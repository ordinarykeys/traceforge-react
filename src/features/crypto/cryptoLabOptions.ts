import type { ExportTarget } from "@/lib/crypto";

export const OUTPUT_ENCODING_OPTIONS = ["Base64", "Hex"] as const;

export const categoryLabels: Record<string, string> = {
  hash: "哈希",
  hmac: "HMAC",
  symmetric: "对称加密",
  asymmetric: "非对称",
  kdf: "密钥派生",
  encoding: "编码",
  protocol: "协议解析",
};

export const algorithmLabelOverrides: Record<string, string> = {
  "rsa-sign": "RSA 签名",
  "sm2-sign": "SM2 签名",
  "xor-chain": "XOR 链式",
};

export const exportTargetLabels: Record<ExportTarget, string> = {
  js_source: "JS 源码",
  easy_module: "易语言模块",
};

export const symmetricTypes = new Set([
  "aes",
  "aes-gcm",
  "tea",
  "xtea",
  "des",
  "3des",
  "rc4",
  "rabbit",
  "xxtea",
  "sm4",
  "xor-chain",
]);

export const outputFormatTypes = new Set([
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
  "keccak256",
  "sha3-256",
  "sm3",
  "hmac",
  "pbkdf2",
  "evpkdf",
  "scrypt",
  "rsa",
  "rsa-sign",
]);

export const getAlgorithmLabel = (key: string, fallback: string) => {
  return algorithmLabelOverrides[key] ?? fallback;
};
