import { Buffer } from "buffer";

import type { ScriptParams } from "@/services/codeLoader";

export type CryptoValidationTarget = "preview" | "js_source" | "easy_module";

export type CryptoValidationResult =
  | { ok: true }
  | { ok: false; message: string };

const DECRYPT_INPUT_REQUIRED_TYPES = new Set([
  "aes",
  "des",
  "3des",
  "rc4",
  "rabbit",
  "aes-gcm",
  "tea",
  "xtea",
  "xxtea",
  "sm4",
  "xor-chain",
  "rsa",
  "sm2",
]);

const HEX_INPUT_TYPES = new Set(["hex"]);
const BASE64_INPUT_TYPES = new Set(["base64"]);
const BASE64URL_INPUT_TYPES = new Set(["base64url"]);
const URL_INPUT_TYPES = new Set(["url"]);

const fail = (message: string): CryptoValidationResult => ({ ok: false, message });

const isBlank = (value: string | null | undefined) => String(value ?? "").trim().length === 0;

const isFiniteInteger = (value: number) => Number.isInteger(value) && Number.isFinite(value);

const isPowerOfTwo = (value: number) => value > 1 && (value & (value - 1)) === 0;

const isValidHex = (value: string) => {
  const clean = value.replace(/\s+/g, "");
  return clean.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(clean);
};

const isValidBase64 = (value: string) => {
  const clean = value.replace(/\s+/g, "");
  if (clean.length === 0) {
    return true;
  }

  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean);
};

const isValidBase64Url = (value: string) => /^[A-Za-z0-9\-_]*$/.test(value.replace(/\s+/g, ""));

const isValidSm2PublicKey = (value: string) => /^(04)?[0-9a-fA-F]{128}$/.test(value.trim());

const isValidSm2PrivateKey = (value: string) => /^[0-9a-fA-F]{64}$/.test(value.trim());

const encodedByteLength = (value: string, encoding: string): number | null => {
  switch (encoding) {
    case "Utf8":
      return new TextEncoder().encode(value).length;
    case "Latin1":
      return value.length;
    case "Utf16":
    case "Utf16BE":
    case "Utf16LE":
      return value.length * 2;
    case "Hex":
      return isValidHex(value) ? value.replace(/\s+/g, "").length / 2 : null;
    case "Base64": {
      if (!isValidBase64(value)) {
        return null;
      }
      const clean = value.replace(/\s+/g, "");
      return clean.length === 0 ? 0 : Buffer.from(clean, "base64").length;
    }
    default:
      return new TextEncoder().encode(value).length;
  }
};

const assertRequired = (value: string, label: string): CryptoValidationResult | null => {
  if (isBlank(value)) {
    return fail(`${label} is required`);
  }
  return null;
};

const assertEncodedByteLength = (
  value: string,
  label: string,
  encoding: string,
  allowedByteLengths: number[],
): CryptoValidationResult | null => {
  const byteLength = encodedByteLength(value, encoding);
  if (byteLength === null) {
    return fail(`${label} is not valid ${encoding} data`);
  }

  if (!allowedByteLengths.includes(byteLength)) {
    const expected =
      allowedByteLengths.length === 1
        ? `${allowedByteLengths[0]}`
        : `${allowedByteLengths.slice(0, -1).join(", ")} or ${allowedByteLengths.at(-1)}`;
    return fail(
      `${label} must be ${expected} bytes after ${encoding} encoding (current: ${byteLength})`,
    );
  }

  return null;
};

const assertCiphertextFormat = (
  value: string,
  format: "Hex" | "Base64" | "Base64URL",
  label = "Input",
): CryptoValidationResult | null => {
  if (isBlank(value)) {
    return fail(`${label} is required`);
  }

  if (format === "Hex" && !isValidHex(value)) {
    return fail(`${label} must be valid Hex`);
  }

  if (format === "Base64" && !isValidBase64(value)) {
    return fail(`${label} must be valid Base64`);
  }

  if (format === "Base64URL" && !isValidBase64Url(value)) {
    return fail(`${label} must be valid Base64URL`);
  }

  return null;
};

const assertPositiveInteger = (value: number, label: string): CryptoValidationResult | null => {
  if (!isFiniteInteger(value) || value <= 0) {
    return fail(`${label} must be a positive integer`);
  }
  return null;
};

const assertSm4Secret = (value: string, label: string): CryptoValidationResult | null => {
  const clean = value.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(clean)) {
    return null;
  }

  const utf8Length = new TextEncoder().encode(value).length;
  if (utf8Length === 16) {
    return null;
  }

  return fail(`${label} must be 16-byte UTF-8 text or 32-character hex`);
};

const assertJsonObjectInput = (value: string): CryptoValidationResult | null => {
  if (isBlank(value)) {
    return fail("Protobuf JSON input is required");
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("Protobuf JSON input must be a valid object");
    }
  } catch {
    return fail("Protobuf JSON input must be valid JSON");
  }

  return null;
};

const validateCommonAlgorithmInputs = (params: ScriptParams): CryptoValidationResult | null => {
  if (params.type === "sha" && isBlank(params.subType)) {
    return fail("SHA subtype is required");
  }

  if (params.type === "hmac") {
    return assertRequired(params.key, "HMAC key");
  }

  if (params.type === "rsa-sign" && isBlank(params.subType)) {
    return fail("RSA sign algorithm is required");
  }

  if (!params.isEncrypt && DECRYPT_INPUT_REQUIRED_TYPES.has(params.type)) {
    return assertRequired(params.input, "Input");
  }

  return null;
};

const validateSymmetricCrypto = (params: ScriptParams): CryptoValidationResult | null => {
  if (params.type === "aes") {
    const keyError = assertRequired(params.key, "AES key")
      ?? assertEncodedByteLength(params.key, "AES key", params.keyEncoding, [16, 24, 32]);
    if (keyError) {
      return keyError;
    }

    if (params.mode !== "ECB") {
      return assertRequired(params.iv, "AES IV")
        ?? assertEncodedByteLength(params.iv, "AES IV", params.ivEncoding, [16]);
    }

    if (!params.isEncrypt) {
      return assertCiphertextFormat(params.input, params.outputEncoding === "Hex" ? "Hex" : "Base64");
    }
  }

  if (params.type === "des") {
    const keyError = assertRequired(params.key, "DES key")
      ?? assertEncodedByteLength(params.key, "DES key", params.keyEncoding, [8]);
    if (keyError) {
      return keyError;
    }

    if (params.mode !== "ECB") {
      return assertRequired(params.iv, "DES IV")
        ?? assertEncodedByteLength(params.iv, "DES IV", params.ivEncoding, [8]);
    }

    if (!params.isEncrypt) {
      return assertCiphertextFormat(params.input, params.outputEncoding === "Hex" ? "Hex" : "Base64");
    }
  }

  if (params.type === "3des") {
    const keyError = assertRequired(params.key, "3DES key")
      ?? assertEncodedByteLength(params.key, "3DES key", params.keyEncoding, [16, 24]);
    if (keyError) {
      return keyError;
    }

    if (params.mode !== "ECB") {
      return assertRequired(params.iv, "3DES IV")
        ?? assertEncodedByteLength(params.iv, "3DES IV", params.ivEncoding, [8]);
    }

    if (!params.isEncrypt) {
      return assertCiphertextFormat(params.input, params.outputEncoding === "Hex" ? "Hex" : "Base64");
    }
  }

  if (params.type === "rc4" || params.type === "rabbit") {
    const keyError = assertRequired(params.key, `${params.type.toUpperCase()} key`);
    if (keyError) {
      return keyError;
    }

    if (!params.isEncrypt) {
      return assertCiphertextFormat(params.input, "Base64");
    }
  }

  if (params.type === "aes-gcm") {
    const keyError = assertRequired(params.key, "AES-GCM key")
      ?? assertEncodedByteLength(params.key, "AES-GCM key", params.keyEncoding, [16, 24, 32]);
    if (keyError) {
      return keyError;
    }

    const ivError = assertRequired(params.iv, "AES-GCM IV");
    if (ivError) {
      return ivError;
    }

    const ivByteLength = encodedByteLength(params.iv, params.ivEncoding);
    if (ivByteLength === null || ivByteLength <= 0) {
      return fail(`AES-GCM IV is not valid ${params.ivEncoding} data`);
    }

    if (!params.isEncrypt) {
      return assertCiphertextFormat(params.input, params.outputEncoding === "Hex" ? "Hex" : "Base64");
    }
  }

  if (params.type === "tea" || params.type === "xtea" || params.type === "xxtea") {
    return assertRequired(params.key, `${params.type.toUpperCase()} key`)
      ?? (!params.isEncrypt
        ? assertCiphertextFormat(params.input, params.outputEncoding === "Hex" ? "Hex" : "Base64")
        : null);
  }

  if (params.type === "sm4") {
    const keyError = assertRequired(params.key, "SM4 key") ?? assertSm4Secret(params.key, "SM4 key");
    if (keyError) {
      return keyError;
    }

    if (params.mode === "cbc") {
      const ivError = assertRequired(params.iv, "SM4 IV") ?? assertSm4Secret(params.iv, "SM4 IV");
      if (ivError) {
        return ivError;
      }
    }

    if (!params.isEncrypt) {
      return assertCiphertextFormat(params.input, params.outputEncoding === "Hex" ? "Hex" : "Base64");
    }
  }

  if (params.type === "xor-chain") {
    if (!isFiniteInteger(params.xorInitialKey) || params.xorInitialKey < 0 || params.xorInitialKey > 255) {
      return fail("XOR initial key must be an integer between 0 and 255");
    }

    if (!params.isEncrypt) {
      return assertCiphertextFormat(params.input, "Base64");
    }
  }

  return null;
};

const validateAsymmetricCrypto = (params: ScriptParams): CryptoValidationResult | null => {
  if (params.type === "rsa") {
    if (params.isEncrypt) {
      const publicKeyError = assertRequired(params.publicKey, "RSA public key");
      if (publicKeyError) {
        return publicKeyError;
      }
    } else {
      const privateKeyError = assertRequired(params.privateKey, "RSA private key");
      if (privateKeyError) {
        return privateKeyError;
      }
      return assertCiphertextFormat(params.input, params.outputFormat === "Hex" ? "Hex" : "Base64");
    }
  }

  if (params.type === "rsa-sign") {
    if (params.isEncrypt) {
      return assertRequired(params.privateKey, "RSA private key");
    }

    const publicKeyError = assertRequired(params.publicKey, "RSA public key");
    if (publicKeyError) {
      return publicKeyError;
    }

    const signatureError = assertRequired(params.signature, "Signature");
    if (signatureError) {
      return signatureError;
    }

    return assertCiphertextFormat(
      params.signature,
      params.outputFormat === "Hex" ? "Hex" : "Base64",
      "Signature",
    );
  }

  if (params.type === "sm2") {
    if (params.isEncrypt) {
      const publicKeyError = assertRequired(params.publicKey, "SM2 public key");
      if (publicKeyError) {
        return publicKeyError;
      }
      if (!isValidSm2PublicKey(params.publicKey)) {
        return fail("SM2 public key must be 128 or 130 hex characters");
      }
    } else {
      const privateKeyError = assertRequired(params.privateKey, "SM2 private key");
      if (privateKeyError) {
        return privateKeyError;
      }
      if (!isValidSm2PrivateKey(params.privateKey)) {
        return fail("SM2 private key must be 64 hex characters");
      }
    }
  }

  if (params.type === "sm2-sign") {
    if (params.isEncrypt) {
      const privateKeyError = assertRequired(params.privateKey, "SM2 private key");
      if (privateKeyError) {
        return privateKeyError;
      }
      if (!isValidSm2PrivateKey(params.privateKey)) {
        return fail("SM2 private key must be 64 hex characters");
      }
      return null;
    }

    const publicKeyError = assertRequired(params.publicKey, "SM2 public key");
    if (publicKeyError) {
      return publicKeyError;
    }
    if (!isValidSm2PublicKey(params.publicKey)) {
      return fail("SM2 public key must be 128 or 130 hex characters");
    }

    const signatureError = assertRequired(params.signature, "Signature");
    if (signatureError) {
      return signatureError;
    }
    if (!isValidHex(params.signature)) {
      return fail("Signature must be valid Hex");
    }
  }

  return null;
};

const validateDerivedOutputs = (params: ScriptParams): CryptoValidationResult | null => {
  if (params.type === "pbkdf2" || params.type === "evpkdf") {
    const saltError = assertRequired(params.salt, "Salt");
    if (saltError) {
      return saltError;
    }

    const iterationsError = assertPositiveInteger(params.iterations, "Iterations");
    if (iterationsError) {
      return iterationsError;
    }

    if (!isFiniteInteger(params.keySize) || params.keySize <= 0 || params.keySize % 32 !== 0) {
      return fail("Key size must be a positive multiple of 32 bits");
    }
  }

  if (params.type === "scrypt") {
    const saltError = assertRequired(params.salt, "Salt");
    if (saltError) {
      return saltError;
    }

    if (!isFiniteInteger(params.keySize) || params.keySize <= 0) {
      return fail("Key size must be a positive integer");
    }

    if (!isFiniteInteger(params.costFactor) || !isPowerOfTwo(params.costFactor)) {
      return fail("scrypt N must be a power of two greater than 1");
    }

    const blockSizeError = assertPositiveInteger(params.blockSizeFactor, "scrypt r");
    if (blockSizeError) {
      return blockSizeError;
    }

    const parallelismError = assertPositiveInteger(params.parallelism, "scrypt p");
    if (parallelismError) {
      return parallelismError;
    }
  }

  return null;
};

const validateEncodingTransforms = (params: ScriptParams): CryptoValidationResult | null => {
  if (!params.isEncrypt && HEX_INPUT_TYPES.has(params.type) && !isValidHex(params.input)) {
    return fail("Input must be valid Hex");
  }

  if (!params.isEncrypt && BASE64_INPUT_TYPES.has(params.type) && !isValidBase64(params.input)) {
    return fail("Input must be valid Base64");
  }

  if (!params.isEncrypt && BASE64URL_INPUT_TYPES.has(params.type) && !isValidBase64Url(params.input)) {
    return fail("Input must be valid Base64URL");
  }

  if (!params.isEncrypt && URL_INPUT_TYPES.has(params.type)) {
    try {
      decodeURIComponent(params.input);
    } catch {
      return fail("Input cannot be decoded as URL");
    }
  }

  if (params.type === "protobuf") {
    if (params.isEncrypt) {
      if (isBlank(params.input)) {
        return fail("Protobuf input is required");
      }
      return params.protobufInputFormat === "base64"
        ? assertCiphertextFormat(params.input, "Base64", "Protobuf input")
        : assertCiphertextFormat(params.input, "Hex", "Protobuf input");
    }

    return assertJsonObjectInput(params.input);
  }

  return null;
};

export function validateCryptoParams(
  params: ScriptParams,
  _target: CryptoValidationTarget,
): CryptoValidationResult {
  const commonError = validateCommonAlgorithmInputs(params);
  if (commonError) {
    return commonError;
  }

  const symmetricError = validateSymmetricCrypto(params);
  if (symmetricError) {
    return symmetricError;
  }

  const asymmetricError = validateAsymmetricCrypto(params);
  if (asymmetricError) {
    return asymmetricError;
  }

  const derivedError = validateDerivedOutputs(params);
  if (derivedError) {
    return derivedError;
  }

  const encodingError = validateEncodingTransforms(params);
  if (encodingError) {
    return encodingError;
  }

  return { ok: true };
}

export function assertValidCryptoParams(
  params: ScriptParams,
  target: CryptoValidationTarget,
): void {
  const result = validateCryptoParams(params, target);
  if (!result.ok) {
    throw new Error(result.message);
  }
}
