import type { ScriptParams } from "@/services/codeLoader";
import * as cryptoService from "@/services/crypto";
import { assertValidCryptoParams } from "@/lib/cryptoValidation";

export type CryptoPreviewResult = {
  output: string;
  details: Record<string, string>;
};

const boolText = (value: boolean) => (value ? "是" : "否");

export async function previewCrypto(params: ScriptParams): Promise<CryptoPreviewResult> {
  assertValidCryptoParams(params, "preview");

  const text = params.input;
  const key = params.key;
  const details: Record<string, string> = {};
  let output = "";

  switch (params.type) {
    case "md5": {
      const result = cryptoService.md5Results(text);
      details["32位小写"] = result.lower;
      details["32位大写"] = result.upper;
      details["16位小写"] = result.lower16;
      details["16位大写"] = result.upper16;
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
      const config: cryptoService.CipherConfig = {
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
        details["验证结果"] = valid ? "签名有效" : "签名无效";
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
        details["验证结果"] = valid ? "签名有效" : "签名无效";
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
    details["Padding"] = params.rsaPadding;
  }

  if (params.type === "sm2") {
    details["密文模式"] = params.sm2CipherMode === 1 ? "C1C3C2" : "C1C2C3";
  }

  if (params.type === "sm4") {
    details["模式"] = params.mode;
  }

  if (params.type === "xor-chain") {
    details["初始异或值"] = String(params.xorInitialKey);
  }

  if (params.type === "protobuf" && !params.isEncrypt) {
    details["编码模式"] = "JSON -> Hex";
  }

  if (params.type === "protobuf" && params.isEncrypt) {
    details["解析输入"] = params.protobufInputFormat;
  }

  if (params.type === "rsa-sign" || params.type === "sm2-sign") {
    details["验证模式"] = boolText(!params.isEncrypt);
  }

  return { output, details };
}
