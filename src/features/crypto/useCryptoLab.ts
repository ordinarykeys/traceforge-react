import { computed, reactive, ref, watch } from "vue";

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
  DEFAULT_SCRIPT_PARAMS,
  generateExportArtifact,
  type ExportArtifact,
} from "@/lib/crypto";
import { previewCrypto } from "@/lib/cryptoPreview";

import { outputFormatTypes, symmetricTypes } from "./cryptoLabOptions";

type PreviewAction = "encrypt" | "decrypt" | "swap" | null;

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
  const params = reactive({ ...DEFAULT_SCRIPT_PARAMS });

  const loading = ref(false);
  const easyModuleLoading = ref(false);
  const previewLoading = ref(false);

  const error = ref("");
  const previewError = ref("");
  const previewOutput = ref("");
  const previewDetails = ref<Record<string, string>>({});

  const artifact = ref<ExportArtifact | null>(null);
  const generatedCode = ref("");
  const lastPreviewAction = ref<PreviewAction>(null);

  const flatItems = CRYPTO_TREE.flatMap((category) => category.children);
  const algorithmCount = flatItems.length;
  const currentItem = computed(() => flatItems.find((item) => item.key === params.type) ?? null);
  const canDecrypt = computed(() => currentItem.value?.canDecrypt ?? true);

  const showSubType = computed(() => ["sha", "hmac", "rsa-sign"].includes(params.type));
  const showOutputFormat = computed(() => outputFormatTypes.has(params.type));
  const showOutputEncoding = computed(() => symmetricTypes.has(params.type));
  const showMode = computed(() => ["aes", "des", "3des", "sm4"].includes(params.type));
  const showPadding = computed(() => ["aes", "des", "3des"].includes(params.type));
  const showKeyEncoding = computed(() => ["aes", "des", "3des", "rc4", "rabbit"].includes(params.type));
  const showIvEncoding = computed(
    () => ["aes", "des", "3des"].includes(params.type) && params.mode !== "ECB",
  );
  const showIv = computed(() => {
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
  });
  const showSalt = computed(() => ["pbkdf2", "evpkdf", "scrypt"].includes(params.type));
  const showIterations = computed(() => ["pbkdf2", "evpkdf"].includes(params.type));
  const showCostFactor = computed(() => params.type === "scrypt");
  const showBlockSizeFactor = computed(() => params.type === "scrypt");
  const showParallelism = computed(() => params.type === "scrypt");
  const showRsaPadding = computed(() => params.type === "rsa");
  const showPublicKey = computed(() => ["rsa", "sm2", "rsa-sign", "sm2-sign"].includes(params.type));
  const showPrivateKey = computed(() => ["rsa", "sm2", "rsa-sign", "sm2-sign"].includes(params.type));
  const showSignature = computed(() => SIGN_VERIFY_TYPES.has(params.type));
  const showSm2CipherMode = computed(() => params.type === "sm2");
  const showUserId = computed(() => params.type === "sm2-sign");
  const showKeySize = computed(() => ["pbkdf2", "evpkdf"].includes(params.type));
  const showProtobufInputFormat = computed(() => params.type === "protobuf");
  const showXorInitialKey = computed(() => params.type === "xor-chain");
  const needsKey = computed(() => currentItem.value?.needKey ?? false);

  const subTypeOptions = computed(() => {
    if (params.type === "sha") {
      return SHA_TYPES;
    }
    if (params.type === "hmac") {
      return HMAC_TYPES;
    }
    if (params.type === "rsa-sign") {
      return RSA_SIGN_ALGORITHMS;
    }
    return [];
  });

  const modeOptions = computed(() => (params.type === "sm4" ? SM4_MODES : CIPHER_MODES));
  const outputFormatOptions = computed(() => OUTPUT_FORMATS);
  const editorLanguage = computed(() => artifact.value?.language ?? "javascript");

  const encryptActionLabel = computed(() => {
    if (SIGN_VERIFY_TYPES.has(params.type)) {
      return "\u7b7e\u540d";
    }
    if (ENCODE_DECODE_TYPES.has(params.type)) {
      return "\u7f16\u7801";
    }
    if (RESULT_ONLY_TYPES.has(params.type) || !canDecrypt.value) {
      return "\u751f\u6210\u7ed3\u679c";
    }
    return "\u52a0\u5bc6";
  });

  const decryptActionLabel = computed(() => {
    if (SIGN_VERIFY_TYPES.has(params.type)) {
      return "\u9a8c\u7b7e";
    }
    if (ENCODE_DECODE_TYPES.has(params.type)) {
      return "\u89e3\u7801";
    }
    return "\u89e3\u5bc6";
  });

  const previewStatusText = computed(() => {
    if (previewLoading.value) {
      return `${params.isEncrypt ? encryptActionLabel.value : decryptActionLabel.value}\u4e2d...`;
    }
    if (previewError.value) {
      return "\u6267\u884c\u5931\u8d25";
    }
    if (lastPreviewAction.value === "swap") {
      return "\u5df2\u4e92\u6362";
    }
    if (lastPreviewAction.value === "encrypt") {
      return `\u521a\u521a\u5df2${encryptActionLabel.value}`;
    }
    if (lastPreviewAction.value === "decrypt") {
      return `\u521a\u521a\u5df2${decryptActionLabel.value}`;
    }
    return "\u7b49\u5f85\u6267\u884c";
  });

  const previewDetailEntries = computed(() => Object.entries(previewDetails.value));
  const previewDetailText = computed(() =>
    previewDetailEntries.value.map(([label, value]) => `${label}: ${value}`).join("\n"),
  );
  const canSwapIO = computed(() => !previewLoading.value && !previewError.value && Boolean(previewOutput.value));

  watch(
    () => params.type,
    (nextType) => {
      if (!canDecrypt.value) {
        params.isEncrypt = true;
      }

      if (nextType === "sm4") {
        params.mode = "ecb";
      } else if (["aes", "des", "3des"].includes(nextType) && !CIPHER_MODES.includes(params.mode)) {
        params.mode = "CBC";
      }

      if (nextType === "sha") {
        params.subType = "SHA256";
      } else if (nextType === "hmac") {
        params.subType = "HMAC-SHA256";
      } else if (nextType === "rsa-sign") {
        params.subType = "SHA256";
      }
    },
    { immediate: true },
  );

  const generateCode = async () => {
    loading.value = true;
    error.value = "";

    try {
      const result = await generateExportArtifact({ ...params }, "js_source");
      artifact.value = result;
      generatedCode.value = result.content;
    } catch (generationError) {
      error.value = generationError instanceof Error ? generationError.message : String(generationError);
      artifact.value = null;
      generatedCode.value = "";
    } finally {
      loading.value = false;
    }
  };

  const copyEasyLanguageModule = async () => {
    easyModuleLoading.value = true;

    try {
      const result = await generateExportArtifact({ ...params }, "easy_module");
      await navigator.clipboard.writeText(result.content);
    } finally {
      easyModuleLoading.value = false;
    }
  };

  const runPreview = async (encryptMode = params.isEncrypt) => {
    params.isEncrypt = encryptMode;
    previewLoading.value = true;
    previewError.value = "";

    try {
      const result = await previewCrypto({ ...params, isEncrypt: encryptMode });
      previewOutput.value = result.output;
      previewDetails.value = result.details;
      lastPreviewAction.value = encryptMode ? "encrypt" : "decrypt";
    } catch (previewExecutionError) {
      previewOutput.value = "";
      previewDetails.value = {};
      previewError.value = previewExecutionError instanceof Error
        ? previewExecutionError.message
        : String(previewExecutionError);
    } finally {
      previewLoading.value = false;
    }
  };

  const runEncryptPreview = async () => {
    await runPreview(true);
  };

  const runDecryptPreview = async () => {
    await runPreview(false);
  };

  const swapInputAndOutput = () => {
    if (!canSwapIO.value) {
      return;
    }

    const currentInput = params.input;
    params.input = previewOutput.value;
    previewOutput.value = currentInput;
    previewDetails.value = {};
    previewError.value = "";
    lastPreviewAction.value = "swap";
  };

  const copyGeneratedCode = async () => {
    if (!generatedCode.value) {
      return;
    }

    await navigator.clipboard.writeText(generatedCode.value);
  };

  const initialize = async () => {
    await Promise.all([generateCode(), runPreview()]);
  };

  return {
    params,
    loading,
    easyModuleLoading,
    error,
    artifact,
    generatedCode,
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
    canSwapIO,
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
