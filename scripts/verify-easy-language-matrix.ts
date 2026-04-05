import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { DEFAULT_SCRIPT_PARAMS } from "../src/lib/crypto";
import { previewCrypto } from "../src/lib/cryptoPreview";
import type { ScriptParams } from "../src/services/codeLoader";
import { generateEasyLanguageRuntimeScript } from "../src/services/codeLoader";
import { getEasyLanguageRunner } from "../src/services/easyLanguageGenerators";
import { generateRSAKeyPair, generateSM2KeyPair } from "../src/services/crypto";
import { ensureEmptyDir, installLocalPackageFetch, normalize, sanitizeName } from "./_cryptoRegressionSupport";

const execFileAsync = promisify(execFile);

const outDir = path.resolve(process.cwd(), ".tmp-easy-language-matrix");
const cscriptPath = "C:\\Windows\\SysWOW64\\cscript.exe";
const sampleText = "Hello <>&\"' 123";
const simpleText = "abc";
const fixedKey = "0123456789abcdef";
const fixedIv = "0123456789abcdef";

type Scalar = string | number;

type CaseContext = Partial<
  Record<"text" | "key" | "iv" | "salt" | "publicKey" | "privateKey" | "signature" | "userId" | "initialKey" | "mode", Scalar>
>;

type VerificationCase = {
  name: string;
  verify: () => Promise<void>;
};

const toJsLiteral = (value: Scalar): string => {
  if (typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
};

const defaultContext = (params: ScriptParams): CaseContext => ({
  text: params.input,
  key: params.key,
  iv: params.iv,
  salt: params.salt,
  publicKey: params.publicKey,
  privateKey: params.privateKey,
  signature: params.signature,
  userId: params.userId,
  initialKey: params.xorInitialKey,
  mode: params.type === "md5" ? "lower32" : params.mode,
});

const resolveArgument = (name: string, params: ScriptParams, context: CaseContext): Scalar => {
  const merged = { ...defaultContext(params), ...context };
  const value = merged[name as keyof CaseContext];
  if (value === undefined) {
    throw new Error(`Missing WT_Run argument "${name}" for ${params.type}`);
  }
  return value;
};

const runRuntime = async (caseName: string, params: ScriptParams, context: CaseContext = {}): Promise<string> => {
  const runtime = await generateEasyLanguageRuntimeScript(params);
  const runner = getEasyLanguageRunner(params);

  if (!runtime || !runner) {
    throw new Error(`Missing EasyLanguage runtime for ${params.type}`);
  }

  const args = runner.parameters
    .map((parameter) => toJsLiteral(resolveArgument(parameter.name, params, context)))
    .join(", ");

  const scriptPath = path.join(outDir, `${sanitizeName(caseName)}.js`);
  const script = `${runtime}\n\nWScript.Echo(String(WT_Run(${args})));\n`;
  await writeFile(scriptPath, script, "utf8");

  const { stdout, stderr } = await execFileAsync(cscriptPath, ["//nologo", scriptPath], {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });

  const output = normalize(`${stdout}${stderr}`);
  if (!output) {
    throw new Error(`No output from ${caseName}`);
  }
  return output;
};

const assertEqual = (caseName: string, actual: string, expected: string) => {
  const normalizedActual = normalize(actual);
  const normalizedExpected = normalize(expected);
  if (normalizedActual !== normalizedExpected) {
    throw new Error([`${caseName} output mismatch`, `expected: ${normalizedExpected}`, `actual:   ${normalizedActual}`].join("\n"));
  }
};

const previewOutput = async (params: ScriptParams): Promise<string> => {
  const result = await previewCrypto(params);
  return normalize(result.output);
};

const withParams = (overrides: Partial<ScriptParams>): ScriptParams => ({
  ...DEFAULT_SCRIPT_PARAMS,
  input: sampleText,
  outputFormat: "Hex",
  outputEncoding: "Base64",
  ...overrides,
});

const createDirectPreviewCase = (name: string, params: ScriptParams, context: CaseContext = {}): VerificationCase => ({
  name,
  verify: async () => {
    const expected = await previewOutput(params);
    const actual = await runRuntime(name, params, context);
    assertEqual(name, actual, expected);
  },
});

const createDeterministicPairCase = (
  name: string,
  encryptParams: ScriptParams,
  decryptOverrides: Partial<ScriptParams> = {},
  encryptContext: CaseContext = {},
  decryptContext: CaseContext = {},
): VerificationCase => ({
  name,
  verify: async () => {
    const encryptExpected = await previewOutput(encryptParams);
    const encryptActual = await runRuntime(`${name}_encrypt`, encryptParams, encryptContext);
    assertEqual(`${name}_encrypt`, encryptActual, encryptExpected);

    const decryptParams = {
      ...encryptParams,
      ...decryptOverrides,
      isEncrypt: false,
      input: encryptActual,
    };
    const decryptExpected = await previewOutput(decryptParams);
    const decryptActual = await runRuntime(`${name}_decrypt`, decryptParams, decryptContext);
    assertEqual(`${name}_decrypt`, decryptActual, decryptExpected);
  },
});

const createRandomizedRoundTripCase = (
  name: string,
  encryptParams: ScriptParams,
  decryptBase: ScriptParams,
  encryptContext: CaseContext = {},
  decryptContext: CaseContext = {},
): VerificationCase => ({
  name,
  verify: async () => {
    const cipherText = await runRuntime(`${name}_encrypt`, encryptParams, encryptContext);
    const decryptParams = {
      ...decryptBase,
      input: cipherText,
      isEncrypt: false,
    };
    const decryptActual = await runRuntime(`${name}_decrypt`, decryptParams, decryptContext);
    assertEqual(`${name}_decrypt`, decryptActual, encryptParams.input);
  },
});

const createSignatureVerifyCase = (
  name: string,
  signParams: ScriptParams,
  verifyBase: ScriptParams,
  signContext: CaseContext = {},
  verifyContext: CaseContext = {},
): VerificationCase => ({
  name,
  verify: async () => {
    const signature = await runRuntime(`${name}_sign`, signParams, signContext);
    const verifyParams = {
      ...verifyBase,
      input: signParams.input,
      isEncrypt: false,
      signature,
    };
    const verifyActual = await runRuntime(`${name}_verify`, verifyParams, verifyContext);
    assertEqual(`${name}_verify`, verifyActual, "true");
  },
});

async function buildCases(): Promise<VerificationCase[]> {
  const rsa1024 = generateRSAKeyPair(1024);
  const sm2KeyPair = generateSM2KeyPair();
  const protobufJson = JSON.stringify({ field_1: 150, field_2: "test" });
  const protobufHex = "089601120474657374";

  const cases: VerificationCase[] = [];

  cases.push(
    createDirectPreviewCase("md5_lower32", withParams({ type: "md5", input: simpleText }), { mode: "lower32" }),
    createDirectPreviewCase("ripemd160_hex", withParams({ type: "ripemd160", input: simpleText })),
    createDirectPreviewCase("crc32_hex", withParams({ type: "crc32", input: simpleText })),
    createDirectPreviewCase("crc16_hex", withParams({ type: "crc16", input: simpleText })),
    createDirectPreviewCase("adler32_hex", withParams({ type: "adler32", input: simpleText })),
    createDirectPreviewCase("fnv1a_hex", withParams({ type: "fnv1a", input: simpleText })),
    createDirectPreviewCase("murmurhash3_hex", withParams({ type: "murmurhash3", input: simpleText })),
    createDirectPreviewCase("blake2s_hex", withParams({ type: "blake2s", input: simpleText })),
    createDirectPreviewCase("blake2b_hex", withParams({ type: "blake2b", input: simpleText })),
    createDirectPreviewCase("blake3_hex", withParams({ type: "blake3", input: simpleText })),
    createDirectPreviewCase("keccak256_hex", withParams({ type: "keccak256", input: simpleText })),
    createDirectPreviewCase("sha3_256_hex", withParams({ type: "sha3-256", input: simpleText })),
    createDirectPreviewCase("sm3_hex", withParams({ type: "sm3", input: simpleText })),
    createDirectPreviewCase(
      "pbkdf2_hex",
      withParams({ type: "pbkdf2", input: "password", salt: "salt", keySize: 256, iterations: 1000 }),
    ),
    createDirectPreviewCase(
      "evpkdf_hex",
      withParams({ type: "evpkdf", input: "password", salt: "salt", keySize: 256, iterations: 1000 }),
    ),
    createDirectPreviewCase(
      "scrypt_hex",
      withParams({ type: "scrypt", input: "password", salt: "salt", keySize: 32, costFactor: 16, blockSizeFactor: 1, parallelism: 1 }),
    ),
    createDirectPreviewCase("protobuf_parse_hex", withParams({ type: "protobuf", input: protobufHex, protobufInputFormat: "hex", isEncrypt: true })),
    createDirectPreviewCase("protobuf_encode_hex", withParams({ type: "protobuf", input: protobufJson, isEncrypt: false })),
    createDirectPreviewCase("xor_chain_encrypt", withParams({ type: "xor-chain", input: sampleText, xorInitialKey: 77, isEncrypt: true }), { initialKey: 77 }),
  );

  for (const subType of ["SHA1", "SHA224", "SHA256", "SHA384", "SHA512", "SHA3"]) {
    cases.push(createDirectPreviewCase(`sha_${subType.toLowerCase()}`, withParams({ type: "sha", subType, input: simpleText })));
  }

  for (const subType of [
    "HMAC-MD5",
    "HMAC-SHA1",
    "HMAC-SHA224",
    "HMAC-SHA256",
    "HMAC-SHA384",
    "HMAC-SHA512",
    "HMAC-SHA3",
    "HMAC-RIPEMD160",
  ]) {
    cases.push(
      createDirectPreviewCase(
        `hmac_${subType.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        withParams({ type: "hmac", subType, input: sampleText, key: "hmac-secret" }),
      ),
    );
  }

  cases.push(
    createDeterministicPairCase(
      "aes_cbc_pkcs7",
      withParams({
        type: "aes",
        input: sampleText,
        key: fixedKey,
        iv: fixedIv,
        mode: "CBC",
        padding: "Pkcs7",
        keyEncoding: "Utf8",
        ivEncoding: "Utf8",
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "aes_ecb_pkcs7",
      withParams({
        type: "aes",
        input: sampleText,
        key: fixedKey,
        iv: "",
        mode: "ECB",
        padding: "Pkcs7",
        keyEncoding: "Utf8",
        ivEncoding: "Utf8",
        outputEncoding: "Hex",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "des_cbc_pkcs7",
      withParams({
        type: "des",
        input: sampleText,
        key: "12345678",
        iv: "12345678",
        mode: "CBC",
        padding: "Pkcs7",
        keyEncoding: "Utf8",
        ivEncoding: "Utf8",
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "triple_des_cbc_pkcs7",
      withParams({
        type: "3des",
        input: sampleText,
        key: "123456789012345678901234",
        iv: "12345678",
        mode: "CBC",
        padding: "Pkcs7",
        keyEncoding: "Utf8",
        ivEncoding: "Utf8",
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "rc4_base64",
      withParams({
        type: "rc4",
        input: sampleText,
        key: "stream-key",
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "rabbit_base64",
      withParams({
        type: "rabbit",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "aes_gcm_hex",
      withParams({
        type: "aes-gcm",
        input: simpleText,
        key: fixedKey,
        iv: fixedIv,
        keyEncoding: "Utf8",
        ivEncoding: "Utf8",
        outputEncoding: "Hex",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "tea_base64",
      withParams({
        type: "tea",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "xtea_base64",
      withParams({
        type: "xtea",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "xxtea_base64",
      withParams({
        type: "xxtea",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "sm4_cbc_hex",
      withParams({
        type: "sm4",
        input: sampleText,
        key: fixedKey,
        iv: fixedIv,
        mode: "cbc",
        outputEncoding: "Hex",
        isEncrypt: true,
      }),
    ),
    createDeterministicPairCase(
      "sm4_ecb_hex",
      withParams({
        type: "sm4",
        input: sampleText,
        key: fixedKey,
        iv: "",
        mode: "ecb",
        outputEncoding: "Hex",
        isEncrypt: true,
      }),
    ),
  );

  for (const type of ["base64", "base64url", "base58", "base32", "base85", "base91", "hex", "url", "unicode", "html"]) {
    cases.push(createDeterministicPairCase(`${type}_roundtrip`, withParams({ type, input: sampleText, isEncrypt: true })));
  }

  cases.push(
    createRandomizedRoundTripCase(
      "rsa_oaep",
      withParams({
        type: "rsa",
        input: simpleText,
        publicKey: rsa1024.publicKey,
        privateKey: rsa1024.privateKey,
        outputFormat: "Hex",
        rsaPadding: "OAEP",
        isEncrypt: true,
      }),
      withParams({
        type: "rsa",
        publicKey: rsa1024.publicKey,
        privateKey: rsa1024.privateKey,
        outputFormat: "Hex",
        rsaPadding: "OAEP",
      }),
    ),
    createRandomizedRoundTripCase(
      "rsa_pkcs1",
      withParams({
        type: "rsa",
        input: simpleText,
        publicKey: rsa1024.publicKey,
        privateKey: rsa1024.privateKey,
        outputFormat: "Base64",
        rsaPadding: "PKCS1",
        isEncrypt: true,
      }),
      withParams({
        type: "rsa",
        publicKey: rsa1024.publicKey,
        privateKey: rsa1024.privateKey,
        outputFormat: "Base64",
        rsaPadding: "PKCS1",
      }),
    ),
    createRandomizedRoundTripCase(
      "sm2_c1c3c2",
      withParams({
        type: "sm2",
        input: sampleText,
        publicKey: sm2KeyPair.publicKey,
        privateKey: sm2KeyPair.privateKey,
        sm2CipherMode: 1,
        isEncrypt: true,
      }),
      withParams({
        type: "sm2",
        publicKey: sm2KeyPair.publicKey,
        privateKey: sm2KeyPair.privateKey,
        sm2CipherMode: 1,
      }),
    ),
    createRandomizedRoundTripCase(
      "sm2_c1c2c3",
      withParams({
        type: "sm2",
        input: sampleText,
        publicKey: sm2KeyPair.publicKey,
        privateKey: sm2KeyPair.privateKey,
        sm2CipherMode: 0,
        isEncrypt: true,
      }),
      withParams({
        type: "sm2",
        publicKey: sm2KeyPair.publicKey,
        privateKey: sm2KeyPair.privateKey,
        sm2CipherMode: 0,
      }),
    ),
  );

  for (const subType of ["MD5", "SHA1", "SHA256", "SHA384", "SHA512"]) {
    cases.push(
      createSignatureVerifyCase(
        `rsa_sign_${subType.toLowerCase()}`,
        withParams({
          type: "rsa-sign",
          input: sampleText,
          privateKey: rsa1024.privateKey,
          publicKey: rsa1024.publicKey,
          subType,
          outputFormat: "Hex",
          isEncrypt: true,
        }),
        withParams({
          type: "rsa-sign",
          privateKey: rsa1024.privateKey,
          publicKey: rsa1024.publicKey,
          subType,
          outputFormat: "Hex",
        }),
      ),
    );
  }

  cases.push(
    createSignatureVerifyCase(
      "sm2_sign",
      withParams({
        type: "sm2-sign",
        input: sampleText,
        privateKey: sm2KeyPair.privateKey,
        publicKey: sm2KeyPair.publicKey,
        userId: "1234567812345678",
        isEncrypt: true,
      }),
      withParams({
        type: "sm2-sign",
        privateKey: sm2KeyPair.privateKey,
        publicKey: sm2KeyPair.publicKey,
        userId: "1234567812345678",
      }),
    ),
  );

  const xorEncryptParams = withParams({
    type: "xor-chain",
    input: sampleText,
    xorInitialKey: 77,
    isEncrypt: true,
  });
  const xorCipher = await previewOutput(xorEncryptParams);
  cases.push(
    createDirectPreviewCase("xor_chain_decrypt", { ...xorEncryptParams, isEncrypt: false, input: xorCipher }, { initialKey: 77 }),
  );

  return cases;
}

async function main() {
  installLocalPackageFetch();
  await ensureEmptyDir(outDir);

  const cases = await buildCases();
  const failures: Array<{ name: string; error: string }> = [];

  for (const item of cases) {
    try {
      await item.verify();
      console.log(`PASS ${item.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ name: item.name, error: message });
      console.error(`FAIL ${item.name}`);
      console.error(message);
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} EasyLanguage matrix case(s) failed`);
  }

  console.log(`All EasyLanguage matrix cases passed (${cases.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
