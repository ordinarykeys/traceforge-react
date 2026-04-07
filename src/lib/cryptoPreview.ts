import type { ScriptParams } from "@/services/codeLoader";
import { assertValidCryptoParams } from "@/lib/cryptoValidation";

export type CryptoPreviewResult = {
  output: string;
  details: Record<string, string>;
};

type PreviewCipherConfig = {
  mode: string;
  padding: string;
  keyEncoding: string;
  ivEncoding: string;
  outputEncoding: string;
  iv: string;
};

const boolText = (value: boolean) => (value ? "yes" : "no");
const CORE_TYPES = new Set([
  "md5",
  "ripemd160",
  "sha",
  "hmac",
  "aes",
  "des",
  "3des",
  "rc4",
  "rabbit",
  "pbkdf2",
  "evpkdf",
  "scrypt",
  "base64",
  "base64url",
  "url",
  "hex",
  "utf16",
  "unicode",
  "html",
]);

let coreServicePromise: Promise<typeof import("@/services/cryptoCore")> | null = null;
let legacyServicePromise: Promise<typeof import("@/services/crypto")> | null = null;

async function loadCryptoCore() {
  if (!coreServicePromise) {
    coreServicePromise = import("@/services/cryptoCore");
  }
  return coreServicePromise;
}

async function loadCryptoLegacy() {
  if (!legacyServicePromise) {
    legacyServicePromise = import("@/services/crypto");
  }
  return legacyServicePromise;
}

export async function previewCrypto(params: ScriptParams): Promise<CryptoPreviewResult> {
  assertValidCryptoParams(params, "preview");

  const text = params.input;
  const key = params.key;
  const details: Record<string, string> = {};
  let output = "";
  const cryptoService: any = CORE_TYPES.has(params.type)
    ? await loadCryptoCore()
    : await loadCryptoLegacy();

  switch (params.type) {
    case "md5": {
      const result = cryptoService.md5Results(text);
      details["md5.lower32"] = result.lower;
      details["md5.upper32"] = result.upper;
      details["md5.lower16"] = result.lower16;
      details["md5.upper16"] = result.upper16;
      output = result.lower;
      break;
    }
    case "ripemd160":
      output = cryptoService.ripemd160(text, params.outputFormat);
      break;
    case "sha":
      output = cryptoService.sha(text, params.subType, params.outputFormat);
      break;
    case "hmac":
      output = cryptoService.hmac(text, key, params.subType, params.outputFormat);
      break;
    case "aes":
    case "des":
    case "3des": {
      const config: PreviewCipherConfig = {
        mode: params.mode,
        padding: params.padding,
        keyEncoding: params.keyEncoding,
        ivEncoding: params.ivEncoding,
        outputEncoding: params.outputEncoding,
        iv: params.iv,
      };
      output = params.isEncrypt
        ? cryptoService.symmetricEncrypt(params.type, text, key, config)
        : cryptoService.symmetricDecrypt(params.type, text, key, config);
      break;
    }
    case "rc4":
    case "rabbit":
      output = params.isEncrypt
        ? cryptoService.streamCipherEncrypt(params.type, text, key, params.keyEncoding)
        : cryptoService.streamCipherDecrypt(params.type, text, key, params.keyEncoding);
      break;
    case "rsa":
      output = params.isEncrypt
        ? cryptoService.rsaEncrypt(text, params.publicKey, params.outputFormat, params.rsaPadding)
        : cryptoService.rsaDecrypt(text, params.privateKey, params.outputFormat, params.rsaPadding);
      break;
    case "rsa-sign": {
      if (params.isEncrypt) {
        output = cryptoService.rsaSign(text, params.privateKey, params.subType, params.outputFormat);
      } else {
        const valid = cryptoService.rsaVerify(
          text,
          params.signature,
          params.publicKey,
          params.subType,
          params.outputFormat,
        );
        details["verify.result"] = valid ? "valid" : "invalid";
        output = String(valid);
      }
      break;
    }
    case "pbkdf2":
      output = cryptoService.pbkdf2(text, {
        salt: params.salt,
        keySize: params.keySize,
        iterations: params.iterations,
        outputFormat: params.outputFormat,
      });
      break;
    case "evpkdf":
      output = cryptoService.evpkdf(text, {
        salt: params.salt,
        keySize: params.keySize,
        iterations: params.iterations,
        outputFormat: params.outputFormat,
      });
      break;
    case "scrypt":
      output = await cryptoService.scryptDerive(text, {
        salt: params.salt,
        keySize: params.keySize,
        costFactor: params.costFactor,
        blockSizeFactor: params.blockSizeFactor,
        parallelism: params.parallelism,
        outputFormat: params.outputFormat,
      });
      break;
    case "keccak256":
      output = cryptoService.keccak256(text, "utf8", params.outputFormat);
      break;
    case "sha3-256":
      output = cryptoService.sha3256(text, "utf8", params.outputFormat);
      break;
    case "blake2s":
      output = cryptoService.blake2Hash(text, "blake2s", params.outputFormat);
      break;
    case "blake2b":
      output = cryptoService.blake2Hash(text, "blake2b", params.outputFormat);
      break;
    case "blake3":
      output = cryptoService.blake3Hash(text, params.outputFormat);
      break;
    case "crc32":
      output = cryptoService.crc32(text, params.outputFormat);
      break;
    case "crc16":
      output = cryptoService.crc16(text, params.outputFormat);
      break;
    case "adler32":
      output = cryptoService.adler32(text, params.outputFormat);
      break;
    case "fnv1a":
      output = cryptoService.fnv1a(text, params.outputFormat);
      break;
    case "murmurhash3":
      output = cryptoService.murmurhash3(text, params.outputFormat, 0);
      break;
    case "base58":
      output = params.isEncrypt
        ? cryptoService.base58Encode(text, "utf8")
        : cryptoService.base58Decode(text, "utf8");
      break;
    case "base32":
      output = params.isEncrypt ? cryptoService.base32Encode(text) : cryptoService.base32Decode(text);
      break;
    case "base85":
      output = params.isEncrypt ? cryptoService.base85Encode(text) : cryptoService.base85Decode(text);
      break;
    case "base91":
      output = params.isEncrypt ? cryptoService.base91Encode(text) : cryptoService.base91Decode(text);
      break;
    case "aes-gcm":
      output = params.isEncrypt
        ? await cryptoService.aesGcmEncrypt(text, key, {
            keyEncoding: params.keyEncoding,
            ivEncoding: params.ivEncoding,
            outputEncoding: params.outputEncoding,
            iv: params.iv,
          })
        : await cryptoService.aesGcmDecrypt(text, key, {
            keyEncoding: params.keyEncoding,
            ivEncoding: params.ivEncoding,
            outputEncoding: params.outputEncoding,
            iv: params.iv,
          });
      break;
    case "xxtea":
      output = params.isEncrypt
        ? cryptoService.xxteaEncrypt(text, key, params.outputEncoding)
        : cryptoService.xxteaDecrypt(text, key, params.outputEncoding);
      break;
    case "tea":
      output = params.isEncrypt
        ? cryptoService.teaEncrypt(text, key, params.outputEncoding)
        : cryptoService.teaDecrypt(text, key, params.outputEncoding);
      break;
    case "xtea":
      output = params.isEncrypt
        ? cryptoService.xteaEncrypt(text, key, params.outputEncoding)
        : cryptoService.xteaDecrypt(text, key, params.outputEncoding);
      break;
    case "sm3":
      output = cryptoService.sm3Hash(text, params.outputFormat);
      break;
    case "sm2":
      output = params.isEncrypt
        ? cryptoService.sm2Encrypt(text, params.publicKey, params.sm2CipherMode as 0 | 1)
        : cryptoService.sm2Decrypt(text, params.privateKey, params.sm2CipherMode as 0 | 1);
      break;
    case "sm2-sign": {
      if (params.isEncrypt) {
        output = cryptoService.sm2Sign(text, params.privateKey, params.userId);
      } else {
        const valid = cryptoService.sm2Verify(
          text,
          params.signature,
          params.publicKey,
          params.userId,
        );
        details["verify.result"] = valid ? "valid" : "invalid";
        output = String(valid);
      }
      break;
    }
    case "sm4":
      output = params.isEncrypt
        ? cryptoService.sm4Encrypt(text, key, params.mode as "ecb" | "cbc", params.iv, params.outputEncoding)
        : cryptoService.sm4Decrypt(text, key, params.mode as "ecb" | "cbc", params.iv, params.outputEncoding);
      break;
    case "protobuf":
      if (params.isEncrypt) {
        output = JSON.stringify(
          cryptoService.parseProtobufRaw(text, params.protobufInputFormat === "base64"),
          (_, value) => (typeof value === "bigint" ? value.toString() : value),
          2,
        );
      } else {
        output = cryptoService.encodeProtobufSimple(JSON.parse(text));
      }
      break;
    case "xor-chain":
      output = params.isEncrypt
        ? cryptoService.xorChainEncrypt(text, params.xorInitialKey)
        : cryptoService.xorChainDecrypt(text, params.xorInitialKey);
      break;
    default:
      output = params.isEncrypt
        ? cryptoService.encrypt(params.type, text, key)
        : cryptoService.decrypt(params.type, text, key);
      break;
  }

  if (params.type === "rsa") {
    details["rsa.padding"] = params.rsaPadding;
  }

  if (params.type === "sm2") {
    details["sm2.cipherMode"] = params.sm2CipherMode === 1 ? "C1C3C2" : "C1C2C3";
  }

  if (params.type === "sm4") {
    details["sm4.mode"] = params.mode;
  }

  if (params.type === "xor-chain") {
    details["xor.initialKey"] = String(params.xorInitialKey);
  }

  if (params.type === "protobuf" && !params.isEncrypt) {
    details["protobuf.encoding"] = "JSON -> Hex";
  }

  if (params.type === "protobuf" && params.isEncrypt) {
    details["protobuf.inputFormat"] = params.protobufInputFormat;
  }

  if (params.type === "rsa-sign" || params.type === "sm2-sign") {
    details["verify.mode"] = boolText(!params.isEncrypt);
  }

  return { output, details };
}
