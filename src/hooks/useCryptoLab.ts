import { useMemo, useState, useEffect, useCallback } from "react";

import {
  CIPHER_MODES,
  CRYPTO_TREE,
  ENCODING_TYPES,
  HMAC_TYPES,
  KEY_SIZES,
  OUTPUT_FORMATS,
  PADDING_TYPES,
  RSA_PADDINGS,
  RSA_SIGN_ALGORITHMS,
  SHA_TYPES,
  SM4_MODES,
} from "@/constants/cryptoTypes";
import {
  type ExportArtifact,
} from "@/lib/crypto";
import type { ScriptParams } from "@/services/codeLoader";

import { outputFormatTypes, symmetricTypes } from "@/features/crypto/cryptoLabOptions";

type PreviewAction = "encrypt" | "decrypt" | "swap" | null;

const DEFAULT_SCRIPT_PARAMS: ScriptParams = {
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

const ENCODE_DECODE_TYPES = new Set([
  "base64",
  "base64url",
  "base58",
  "base32",
  "base85",
  "base91",
  "hex",
  "html-entity",
  "unicode",
  "url-encode",
  "utf16",
  "utf16le",
  "utf16be",
  "protobuf",
  "base64url", // Note: duplicated in original code but keeping for parity
]);

const SIGN_VERIFY_TYPES = new Set(["rsa-sign", "sm2-sign"]);
const RESULT_ONLY_TYPES = new Set([
  "md5",
  "sha",
  "ripemd160",
  "crc32",
  "crc16",
  "adler32",
  "fnv1a",
  "murmurhash3",
  "blake2s",
  "blake2b",
  "blake3",
  "keccak-256",
  "sha3-256",
  "sm3",
  "hmac",
  "pbkdf2",
  "evpkdf",
  "scrypt",
]);

export function useCryptoLab() {
  const [params, setParams] = useState<ScriptParams>({ ...DEFAULT_SCRIPT_PARAMS });

  const [loading, setLoading] = useState(false);
  const [easyModuleLoading, setEasyModuleLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewOutput, setPreviewOutput] = useState("");
  const [previewDetails, setPreviewDetails] = useState<Record<string, string>>({});

  const [artifact, setArtifact] = useState<ExportArtifact | null>(null);
  const [generatedCode, setGeneratedCode] = useState("");
  const [lastPreviewAction, setLastPreviewAction] = useState<PreviewAction>(null);

  const flatItems = useMemo(() => CRYPTO_TREE.flatMap((category) => category.children), []);
  const algorithmCount = flatItems.length;
  const currentItem = useMemo(() => flatItems.find((item) => item.key === params.type) ?? null, [flatItems, params.type]);
  const canDecrypt = useMemo(() => currentItem?.canDecrypt ?? true, [currentItem]);

  // Computed properties
  const showSubType = useMemo(() => ["sha", "hmac", "rsa-sign"].includes(params.type), [params.type]);
  const showOutputFormat = useMemo(() => outputFormatTypes.has(params.type), [params.type]);
  const showOutputEncoding = useMemo(() => symmetricTypes.has(params.type), [params.type]);
  const showMode = useMemo(() => ["aes", "des", "3des", "sm4"].includes(params.type), [params.type]);
  const showPadding = useMemo(() => ["aes", "des", "3des"].includes(params.type), [params.type]);
  const showKeyEncoding = useMemo(() => ["aes", "des", "3des", "rc4", "rabbit"].includes(params.type), [params.type]);
  
  const showIvEncoding = useMemo(
    () => ["aes", "des", "3des"].includes(params.type) && params.mode !== "ECB",
    [params.type, params.mode]
  );

  const showIv = useMemo(() => {
    if (["aes", "des", "3des"].includes(params.type)) {
      return params.mode !== "ECB";
    }
    if (params.type === "aes-gcm") {
      return true;
    }
    if (params.type === "sm4") {
      return params.mode === "cbc";
    }
    return false;
  }, [params.type, params.mode]);

  const showSalt = useMemo(() => ["pbkdf2", "evpkdf", "scrypt"].includes(params.type), [params.type]);
  const showIterations = useMemo(() => ["pbkdf2", "evpkdf"].includes(params.type), [params.type]);
  const showCostFactor = useMemo(() => params.type === "scrypt", [params.type]);
  const showBlockSizeFactor = useMemo(() => params.type === "scrypt", [params.type]);
  const showParallelism = useMemo(() => params.type === "scrypt", [params.type]);
  const showRsaPadding = useMemo(() => params.type === "rsa", [params.type]);
  const showPublicKey = useMemo(() => ["rsa", "sm2", "rsa-sign", "sm2-sign"].includes(params.type), [params.type]);
  const showPrivateKey = useMemo(() => ["rsa", "sm2", "rsa-sign", "sm2-sign"].includes(params.type), [params.type]);
  const showSignature = useMemo(() => SIGN_VERIFY_TYPES.has(params.type), [params.type]);
  const showSm2CipherMode = useMemo(() => params.type === "sm2", [params.type]);
  const showUserId = useMemo(() => params.type === "sm2-sign", [params.type]);
  const showKeySize = useMemo(() => ["pbkdf2", "evpkdf"].includes(params.type), [params.type]);
  const showProtobufInputFormat = useMemo(() => params.type === "protobuf", [params.type]);
  const showXorInitialKey = useMemo(() => params.type === "xor-chain", [params.type]);
  const needsKey = useMemo(() => currentItem?.needKey ?? false, [currentItem]);

  const hasAnyParameter = useMemo(() => {
    return (
      showSubType ||
      showMode ||
      showPadding ||
      showKeyEncoding ||
      showIvEncoding ||
      showIv ||
      showSalt ||
      showIterations ||
      showCostFactor ||
      showBlockSizeFactor ||
      showParallelism ||
      showRsaPadding ||
      showKeySize ||
      showProtobufInputFormat ||
      showSm2CipherMode ||
      showUserId ||
      showXorInitialKey ||
      needsKey
    );
  }, [
    showSubType,
    showMode,
    showPadding,
    showKeyEncoding,
    showIvEncoding,
    showIv,
    showSalt,
    showIterations,
    showCostFactor,
    showBlockSizeFactor,
    showParallelism,
    showRsaPadding,
    showKeySize,
    showProtobufInputFormat,
    showSm2CipherMode,
    showUserId,
    showXorInitialKey,
    needsKey,
  ]);

  const subTypeOptions = useMemo(() => {
    if (params.type === "sha") return SHA_TYPES;
    if (params.type === "hmac") return HMAC_TYPES;
    if (params.type === "rsa-sign") return RSA_SIGN_ALGORITHMS;
    return [];
  }, [params.type]);

  const modeOptions = useMemo(() => (params.type === "sm4" ? SM4_MODES : CIPHER_MODES), [params.type]);
  const outputFormatOptions = useMemo(() => OUTPUT_FORMATS, []);
  const editorLanguage = useMemo(() => artifact?.language ?? "javascript", [artifact]);

  const encryptActionLabel = useMemo(() => {
    if (SIGN_VERIFY_TYPES.has(params.type)) return "签名";
    if (ENCODE_DECODE_TYPES.has(params.type)) return "编码";
    if (RESULT_ONLY_TYPES.has(params.type) || !canDecrypt) return "生成结果";
    return "加密";
  }, [params.type, canDecrypt]);

  const decryptActionLabel = useMemo(() => {
    if (SIGN_VERIFY_TYPES.has(params.type)) return "验签";
    if (ENCODE_DECODE_TYPES.has(params.type)) return "解码";
    return "解密";
  }, [params.type]);

  const previewStatusText = useMemo(() => {
    if (previewLoading) return `${params.isEncrypt ? encryptActionLabel : decryptActionLabel}中...`;
    if (previewError) return "执行失败";
    if (lastPreviewAction === "swap") return "已互换";
    if (lastPreviewAction === "encrypt") return `刚刚已${encryptActionLabel}`;
    if (lastPreviewAction === "decrypt") return `刚刚已${decryptActionLabel}`;
    return "等待执行";
  }, [previewLoading, params.isEncrypt, encryptActionLabel, decryptActionLabel, previewError, lastPreviewAction]);

  const previewDetailEntries = useMemo(() => Object.entries(previewDetails), [previewDetails]);
  const previewDetailText = useMemo(() =>
    previewDetailEntries.map(([label, value]) => `${label}: ${value}`).join("\n"),
  [previewDetailEntries]);

  const canSwapIO = useMemo(() => !previewLoading && !previewError && Boolean(previewOutput), [previewLoading, previewError, previewOutput]);

  const compactKeyLabel = useMemo(() => {
    if (params.type === "xor-chain") return "初始密钥";
    if (["pbkdf2", "evpkdf", "scrypt"].includes(params.type)) return "密码";
    return "密钥";
  }, [params.type]);

  const previewDisplay = useMemo(() => {
    if (previewLoading) return `${params.isEncrypt ? encryptActionLabel : decryptActionLabel}中...`;
    if (previewError) return previewError;
    if (previewOutput) return previewOutput;
    if (canDecrypt) return `点击“${encryptActionLabel}”或“${decryptActionLabel}”先确认当前算法结果。`;
    return `点击“${encryptActionLabel}”先确认当前算法结果。`;
  }, [previewLoading, params.isEncrypt, encryptActionLabel, decryptActionLabel, previewError, previewOutput, canDecrypt]);

  // Watcher equivalent: Sync sub-params when algorithm type changes
  useEffect(() => {
    setParams((prev) => {
      const updates: Partial<ScriptParams> = {};
      
      // 1. Decrypt mode enforcement
      if (!currentItem?.canDecrypt) {
        updates.isEncrypt = true;
      }

      // 2. Algorithm specific mode defaults
      if (params.type === "sm4") {
        updates.mode = "ecb";
      } else if (["aes", "des", "3des"].includes(params.type) && !CIPHER_MODES.includes(prev.mode)) {
        updates.mode = "CBC";
      }

      // 3. Sub-type defaults for quick navigation
      if (params.type === "sha") {
        updates.subType = "SHA256";
      } else if (params.type === "hmac") {
        updates.subType = "HMAC-SHA256";
      } else if (params.type === "rsa-sign") {
        updates.subType = "SHA256";
      }

      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [params.type, currentItem?.canDecrypt]);

  const generateCode = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { generateExportArtifact } = await import("@/lib/crypto");
      const result = await generateExportArtifact({ ...params }, "js_source");
      setArtifact(result);
      setGeneratedCode(result.content);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
      setArtifact(null);
      setGeneratedCode("");
    } finally {
      setLoading(false);
    }
  }, [params]);

  const copyEasyLanguageModule = useCallback(async () => {
    setEasyModuleLoading(true);
    try {
      const { generateExportArtifact } = await import("@/lib/crypto");
      const result = await generateExportArtifact({ ...params }, "easy_module");
      await navigator.clipboard.writeText(result.content);
    } finally {
      setEasyModuleLoading(false);
    }
  }, [params]);

  const runPreview = useCallback(async (encryptMode = params.isEncrypt) => {
    setParams(p => ({ ...p, isEncrypt: encryptMode }));
    setPreviewLoading(true);
    setPreviewError("");

    try {
      const { previewCrypto } = await import("@/lib/cryptoPreview");
      const result = await previewCrypto({ ...params, isEncrypt: encryptMode });
      setPreviewOutput(result.output);
      setPreviewDetails(result.details);
      setLastPreviewAction(encryptMode ? "encrypt" : "decrypt");
    } catch (previewExecutionError) {
      setPreviewOutput("");
      setPreviewDetails({});
      setPreviewError(previewExecutionError instanceof Error ? previewExecutionError.message : String(previewExecutionError));
    } finally {
      setPreviewLoading(false);
    }
  }, [params]);

  const runEncryptPreview = useCallback(() => runPreview(true), [runPreview]);
  const runDecryptPreview = useCallback(() => runPreview(false), [runPreview]);

  const swapInputAndOutput = useCallback(() => {
    if (!canSwapIO) return;

    setParams(prev => {
      const currentInput = prev.input;
      const nextInput = previewOutput;
      
      setPreviewOutput(currentInput);
      setPreviewDetails({});
      setPreviewError("");
      setLastPreviewAction("swap");

      return { ...prev, input: nextInput };
    });
  }, [canSwapIO, previewOutput]);

  const copyGeneratedCode = useCallback(async () => {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
  }, [generatedCode]);

  const initialize = useCallback(async () => {
    await Promise.all([generateCode(), runPreview()]);
  }, [generateCode, runPreview]);

  return {
    params,
    setParams,
    loading,
    easyModuleLoading,
    error,
    artifact,
    generatedCode,
    setGeneratedCode,
    previewLoading,
    previewError,
    previewOutput,
    previewDetails,
    lastPreviewAction,
    algorithmCount,
    canDecrypt,
    showSubType,
    showOutputFormat,
    showOutputEncoding,
    showMode,
    showPadding,
    showKeyEncoding,
    showIvEncoding,
    showIv,
    showSalt,
    showIterations,
    showCostFactor,
    showBlockSizeFactor,
    showParallelism,
    showRsaPadding,
    showPublicKey,
    showPrivateKey,
    showSignature,
    showSm2CipherMode,
    showUserId,
    showKeySize,
    showProtobufInputFormat,
    showXorInitialKey,
    needsKey,
    subTypeOptions,
    modeOptions,
    outputFormatOptions,
    editorLanguage,
    encryptActionLabel,
    decryptActionLabel,
    previewStatusText,
    previewDetailEntries,
    previewDetailText,
    previewDisplay,
    compactKeyLabel,
    canSwapIO,
    hasAnyParameter,
    generateCode,
    copyEasyLanguageModule,
    runPreview,
    runEncryptPreview,
    runDecryptPreview,
    swapInputAndOutput,
    copyGeneratedCode,
    initialize,
    constants: {
      CRYPTO_TREE,
      ENCODING_TYPES,
      KEY_SIZES,
      PADDING_TYPES,
      RSA_PADDINGS,
      OUTPUT_FORMATS,
      SM4_MODES,
    },
  };
}
