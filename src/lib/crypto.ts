import { getEasyLanguageRunner } from "@/services/easyLanguageGenerators";
import type { EasyLanguageParameter, EasyLanguageRunner } from "@/services/easyLanguageGenerators/types";
import {
  generateEasyLanguageRuntimeScript,
  generateFullCodeWithValues,
  type ScriptParams,
} from "@/services/codeLoader";
export type { ScriptParams };
import { assertValidCryptoParams } from "@/lib/cryptoValidation";

export type ExportTarget = "js_source" | "easy_module";

export type ExportArtifact = {
  title: string;
  summary: string;
  content: string;
  language: "javascript" | "plaintext";
  entryName?: string;
};

export const DEFAULT_SCRIPT_PARAMS: ScriptParams = {
  type: "md5",
  subType: "SHA256",
  outputFormat: "Hex",
  isEncrypt: true,
  input: "Hello World",
  key: "1234567890123456",
  iv: "1234567890123456",
  mode: "CBC",
  padding: "Pkcs7",
  keyEncoding: "Utf8",
  ivEncoding: "Utf8",
  outputEncoding: "Base64",
  rsaPadding: "OAEP",
  salt: "salt",
  keySize: 256,
  iterations: 1000,
  costFactor: 16384,
  blockSizeFactor: 8,
  parallelism: 1,
  publicKey: "",
  privateKey: "",
  signature: "",
  sm2CipherMode: 1,
  userId: "1234567812345678",
  protobufInputFormat: "hex",
  xorInitialKey: 0,
};

const ALGORITHM_LABELS: Record<string, string> = {
  md5: "MD5",
  sha: "SHA",
  ripemd160: "RIPEMD160",
  crc32: "CRC32",
  crc16: "CRC16",
  adler32: "Adler32",
  fnv1a: "FNV1a",
  murmurhash3: "MurmurHash3",
  blake2s: "BLAKE2s",
  blake2b: "BLAKE2b",
  blake3: "BLAKE3",
  keccak256: "Keccak-256",
  "sha3-256": "SHA3-256",
  sm3: "SM3",
  hmac: "HMAC",
  aes: "AES",
  "aes-gcm": "AES-GCM",
  tea: "TEA",
  xtea: "XTEA",
  des: "DES",
  "3des": "3DES",
  rc4: "RC4",
  rabbit: "Rabbit",
  xxtea: "XXTEA",
  sm4: "SM4",
  "xor-chain": "XOR Chain",
  rsa: "RSA",
  "rsa-sign": "RSA Sign",
  sm2: "SM2",
  "sm2-sign": "SM2 Sign",
  pbkdf2: "PBKDF2",
  evpkdf: "EvpKDF",
  scrypt: "scrypt",
  base64: "Base64",
  base64url: "Base64URL",
  base58: "Base58",
  base32: "Base32",
  base85: "Base85",
  base91: "Base91",
  hex: "Hex",
  url: "URL",
  utf16: "UTF-16",
  unicode: "Unicode Escape",
  html: "HTML Entity",
  protobuf: "Protobuf",
};

const TYPES_WITH_SUBTYPE = new Set(["sha", "hmac", "rsa-sign"]);
const EASY_LANGUAGE_PENDING_TYPES = new Set<string>();

const PARAMETER_COMMENT_MAP: Record<string, string> = {
  input: "待处理文本",
  iv: "向量",
  key: "密钥",
  message: "待处理文本",
  privateKey: "私钥",
  publicKey: "公钥",
  salt: "Salt",
  signature: "签名",
  text: "待处理文本",
  userId: "用户ID",
  word: "待处理文本",
};

const toIdentifierPart = (value: string) =>
  value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "SCRIPT";

const buildAlgorithmLabel = (params: ScriptParams) => {
  const baseLabel = ALGORITHM_LABELS[params.type] ?? params.type;

  if (params.type === "sha") {
    return `${baseLabel}-${params.subType}`;
  }

  if (params.type === "hmac" || params.type === "rsa-sign") {
    return `${baseLabel} ${params.subType}`;
  }

  return baseLabel;
};

const buildIdentifier = (params: ScriptParams) => {
  const base = [toIdentifierPart(params.type)];
  if (TYPES_WITH_SUBTYPE.has(params.type) && params.subType) {
    base.push(toIdentifierPart(params.subType));
  }
  return base.join("_");
};

const resolveParameterComment = (
  params: ScriptParams,
  parameter: EasyLanguageParameter,
  index: number,
) => {
  if (parameter.name === "script") {
    return "常量JS脚本";
  }

  if (params.type === "md5" && parameter.name === "mode") {
    return "输出模式: lower32/upper32/lower16/upper16";
  }

  return PARAMETER_COMMENT_MAP[parameter.name] ?? `参数${index + 1}`;
};

const buildEasyWrapperLines = (
  params: ScriptParams,
  runner: EasyLanguageRunner,
  options: {
    entryName: string;
    includeScriptParam: boolean;
    scriptExpression: string;
  },
) => {
  const lines = [
    `.子程序 ${options.entryName}, 文本型, , ${runner.description || "WT-JS_DEBUG"}`,
    ...(options.includeScriptParam ? [".参数 script, 文本型, , 常量JS脚本"] : []),
    ...runner.parameters.map(
      (parameter, index) =>
        `.参数 ${parameter.name}, 文本型, , ${resolveParameterComment(params, parameter, index)}`,
    ),
    ".局部变量 js, 对象",
    ".局部变量 ret, 变体型",
    "",
    "' CoInitialize (0) 线程中使用 加载COM",
    'js.创建 ("ScriptControl", )',
    'js.写属性 ("Language", "JScript")',
    "' 如果调试结果与工具不符，有可能是编码问题，可尝试：编码_Utf8到Ansi (到字节集 (...))",
    `js.通用方法 ("AddCode", ${options.scriptExpression})`,
    `ret ＝ js.通用方法 ("Eval", "${runner.evalExpression}")`,
    "js.清除 ()",
    "' CoUninitialize () 线程中使用 卸载COM",
    "返回 (ret.取文本 ())",
  ];

  const INDENT = "    ";
  return lines
    .map((line) => (line.startsWith(".") || line.startsWith("'") || line === "" ? line : `${INDENT}${line}`))
    .join("\n");
};

const buildEasyModule = (params: ScriptParams, runner: EasyLanguageRunner, entryName: string) => {
  return [
    ".版本 2",
    "",
    buildEasyWrapperLines(params, runner, {
      entryName,
      includeScriptParam: true,
      scriptExpression: "script",
    }),
  ].join("\n");
};

export async function generateExportArtifact(
  params: ScriptParams,
  target: ExportTarget,
): Promise<ExportArtifact> {
  assertValidCryptoParams(params, target);

  const script = await generateFullCodeWithValues(params);
  const algorithmLabel = buildAlgorithmLabel(params);
  const easyScript = await generateEasyLanguageRuntimeScript(params);
  const unsupportedJsSource = script.includes("Unsupported self-contained code generation");

  if (target === "js_source") {
    if (unsupportedJsSource && easyScript) {
      return {
        title: `${algorithmLabel} JS Runtime`,
        summary:
          "Generated a ScriptControl-compatible self-contained runtime so this algorithm can still be exported as executable JavaScript.",
        content: easyScript,
        language: "javascript",
        entryName: "WT_Run",
      };
    }

    return {
      title: `${algorithmLabel} JS Source`,
      summary:
        "Generated a complete self-contained script that you can copy into EasyLanguage constants and call from a wrapper module.",
      content: script,
      language: "javascript",
    };
  }

  const runner = getEasyLanguageRunner(params);
  if (!runner) {
    return {
      title: EASY_LANGUAGE_PENDING_TYPES.has(params.type)
        ? `${algorithmLabel} EasyLanguage Pending`
        : `${algorithmLabel} EasyLanguage Wrapper Pending`,
      summary:
        "This algorithm does not have a ScriptControl/JScript-compatible EasyLanguage wrapper yet, so the full JS source is returned for now.",
      content: script,
      language: "javascript",
    };
  }

  if (!easyScript) {
    return {
      title: EASY_LANGUAGE_PENDING_TYPES.has(params.type)
        ? `${algorithmLabel} EasyLanguage Pending`
        : `${algorithmLabel} EasyLanguage Wrapper Pending`,
      summary:
        "EasyLanguage export needs a dedicated ScriptControl/JScript-compatible runtime script. That compatibility layer is still being filled in for this algorithm.",
      content: script,
      language: "javascript",
    };
  }

  const identifier = buildIdentifier(params);
  const entryName = `WT_${identifier}_Eval`;

  return {
    title: `${algorithmLabel} EasyLanguage Module`,
    summary:
      "Generated an EasyLanguage wrapper that matches the JS source + module workflow for ScriptControl compatibility.",
    content: buildEasyModule(params, runner, entryName),
    language: "plaintext",
    entryName,
  };
}
