import { DEFAULT_SCRIPT_PARAMS } from "../src/lib/crypto";
import {
  HMAC_TYPES,
  RSA_SIGN_ALGORITHMS,
  SHA_TYPES,
} from "../src/constants/cryptoTypes";
import type { ScriptParams } from "../src/services/codeLoader";
import { generateRSAKeyPair, generateSM2KeyPair } from "../src/services/crypto";

export type CryptoRegressionSample = {
  name: string;
  params: ScriptParams;
};

export const sampleText = "Hello <>&\"' 123";
export const simpleText = "abc";
export const fixedKey = "0123456789abcdef";
export const fixedIv = "0123456789abcdef";
export const protobufJson = JSON.stringify({ field_1: 150, field_2: "test" });
export const protobufHex = "089601120474657374";

const withParams = (overrides: Partial<ScriptParams>): ScriptParams => ({
  ...DEFAULT_SCRIPT_PARAMS,
  input: sampleText,
  outputFormat: "Hex",
  outputEncoding: "Base64",
  ...overrides,
});

export async function buildCryptoRegressionSamples(): Promise<CryptoRegressionSample[]> {
  const rsa1024 = generateRSAKeyPair(1024);
  const sm2KeyPair = generateSM2KeyPair();

  const samples: CryptoRegressionSample[] = [
    { name: "md5_lower32", params: withParams({ type: "md5", input: simpleText }) },
    { name: "ripemd160_hex", params: withParams({ type: "ripemd160", input: simpleText }) },
    { name: "crc32_hex", params: withParams({ type: "crc32", input: simpleText }) },
    { name: "crc16_hex", params: withParams({ type: "crc16", input: simpleText }) },
    { name: "adler32_hex", params: withParams({ type: "adler32", input: simpleText }) },
    { name: "fnv1a_hex", params: withParams({ type: "fnv1a", input: simpleText }) },
    { name: "murmurhash3_hex", params: withParams({ type: "murmurhash3", input: simpleText }) },
    { name: "blake2s_hex", params: withParams({ type: "blake2s", input: simpleText }) },
    { name: "blake2b_hex", params: withParams({ type: "blake2b", input: simpleText }) },
    { name: "blake3_hex", params: withParams({ type: "blake3", input: simpleText }) },
    { name: "keccak256_hex", params: withParams({ type: "keccak256", input: simpleText }) },
    { name: "sha3_256_hex", params: withParams({ type: "sha3-256", input: simpleText }) },
    { name: "sm3_hex", params: withParams({ type: "sm3", input: simpleText }) },
    {
      name: "pbkdf2_hex",
      params: withParams({ type: "pbkdf2", input: "password", salt: "salt", keySize: 256, iterations: 1000 }),
    },
    {
      name: "evpkdf_hex",
      params: withParams({ type: "evpkdf", input: "password", salt: "salt", keySize: 256, iterations: 1000 }),
    },
    {
      name: "scrypt_hex",
      params: withParams({
        type: "scrypt",
        input: "password",
        salt: "salt",
        keySize: 32,
        costFactor: 16,
        blockSizeFactor: 1,
        parallelism: 1,
      }),
    },
    {
      name: "protobuf_parse_hex",
      params: withParams({ type: "protobuf", input: protobufHex, protobufInputFormat: "hex", isEncrypt: true }),
    },
    {
      name: "protobuf_encode_hex",
      params: withParams({ type: "protobuf", input: protobufJson, isEncrypt: false }),
    },
    {
      name: "aes_cbc_pkcs7",
      params: withParams({
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
    },
    {
      name: "aes_ecb_pkcs7",
      params: withParams({
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
    },
    {
      name: "des_cbc_pkcs7",
      params: withParams({
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
    },
    {
      name: "triple_des_cbc_pkcs7",
      params: withParams({
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
    },
    {
      name: "rc4_base64",
      params: withParams({
        type: "rc4",
        input: sampleText,
        key: "stream-key",
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    },
    {
      name: "rabbit_base64",
      params: withParams({
        type: "rabbit",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    },
    {
      name: "aes_gcm_hex",
      params: withParams({
        type: "aes-gcm",
        input: simpleText,
        key: fixedKey,
        iv: fixedIv,
        keyEncoding: "Utf8",
        ivEncoding: "Utf8",
        outputEncoding: "Hex",
        isEncrypt: true,
      }),
    },
    {
      name: "tea_base64",
      params: withParams({
        type: "tea",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    },
    {
      name: "xtea_base64",
      params: withParams({
        type: "xtea",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    },
    {
      name: "xxtea_base64",
      params: withParams({
        type: "xxtea",
        input: sampleText,
        key: fixedKey,
        outputEncoding: "Base64",
        isEncrypt: true,
      }),
    },
    {
      name: "sm4_cbc_hex",
      params: withParams({
        type: "sm4",
        input: sampleText,
        key: fixedKey,
        iv: fixedIv,
        mode: "cbc",
        outputEncoding: "Hex",
        isEncrypt: true,
      }),
    },
    {
      name: "sm4_ecb_hex",
      params: withParams({
        type: "sm4",
        input: sampleText,
        key: fixedKey,
        iv: "",
        mode: "ecb",
        outputEncoding: "Hex",
        isEncrypt: true,
      }),
    },
    { name: "base64_roundtrip", params: withParams({ type: "base64", input: sampleText, isEncrypt: true }) },
    { name: "base64url_roundtrip", params: withParams({ type: "base64url", input: sampleText, isEncrypt: true }) },
    { name: "base58_roundtrip", params: withParams({ type: "base58", input: sampleText, isEncrypt: true }) },
    { name: "base32_roundtrip", params: withParams({ type: "base32", input: sampleText, isEncrypt: true }) },
    { name: "base85_roundtrip", params: withParams({ type: "base85", input: sampleText, isEncrypt: true }) },
    { name: "base91_roundtrip", params: withParams({ type: "base91", input: sampleText, isEncrypt: true }) },
    { name: "hex_roundtrip", params: withParams({ type: "hex", input: sampleText, isEncrypt: true }) },
    { name: "url_roundtrip", params: withParams({ type: "url", input: sampleText, isEncrypt: true }) },
    { name: "utf16_roundtrip", params: withParams({ type: "utf16", input: sampleText, isEncrypt: true }) },
    { name: "unicode_roundtrip", params: withParams({ type: "unicode", input: sampleText, isEncrypt: true }) },
    { name: "html_roundtrip", params: withParams({ type: "html", input: sampleText, isEncrypt: true }) },
    {
      name: "xor_chain_roundtrip",
      params: withParams({ type: "xor-chain", input: sampleText, xorInitialKey: 77, isEncrypt: true }),
    },
    {
      name: "rsa_oaep",
      params: withParams({
        type: "rsa",
        input: simpleText,
        publicKey: rsa1024.publicKey,
        privateKey: rsa1024.privateKey,
        outputFormat: "Hex",
        rsaPadding: "OAEP",
        isEncrypt: true,
      }),
    },
    {
      name: "rsa_pkcs1",
      params: withParams({
        type: "rsa",
        input: simpleText,
        publicKey: rsa1024.publicKey,
        privateKey: rsa1024.privateKey,
        outputFormat: "Base64",
        rsaPadding: "PKCS1",
        isEncrypt: true,
      }),
    },
    {
      name: "sm2_c1c3c2",
      params: withParams({
        type: "sm2",
        input: sampleText,
        publicKey: sm2KeyPair.publicKey,
        privateKey: sm2KeyPair.privateKey,
        sm2CipherMode: 1,
        isEncrypt: true,
      }),
    },
    {
      name: "sm2_c1c2c3",
      params: withParams({
        type: "sm2",
        input: sampleText,
        publicKey: sm2KeyPair.publicKey,
        privateKey: sm2KeyPair.privateKey,
        sm2CipherMode: 0,
        isEncrypt: true,
      }),
    },
    {
      name: "sm2_sign",
      params: withParams({
        type: "sm2-sign",
        input: sampleText,
        privateKey: sm2KeyPair.privateKey,
        publicKey: sm2KeyPair.publicKey,
        userId: "1234567812345678",
        isEncrypt: true,
      }),
    },
  ];

  for (const subType of SHA_TYPES) {
    samples.push({
      name: `sha_${subType.toLowerCase()}`,
      params: withParams({ type: "sha", subType, input: simpleText }),
    });
  }

  for (const subType of HMAC_TYPES) {
    samples.push({
      name: `hmac_${subType.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      params: withParams({ type: "hmac", subType, input: sampleText, key: "hmac-secret" }),
    });
  }

  for (const subType of RSA_SIGN_ALGORITHMS) {
    samples.push({
      name: `rsa_sign_${subType.toLowerCase()}`,
      params: withParams({
        type: "rsa-sign",
        input: sampleText,
        privateKey: rsa1024.privateKey,
        publicKey: rsa1024.publicKey,
        subType,
        outputFormat: "Hex",
        isEncrypt: true,
      }),
    });
  }

  return samples;
}
