import { Buffer } from "buffer";
import CryptoJS from "crypto-js";
import { scryptAsync } from "@noble/hashes/scrypt.js";

export interface CipherConfig {
  mode: string;
  padding: string;
  keyEncoding: string;
  ivEncoding: string;
  outputEncoding: string;
  iv: string;
}

export interface Pbkdf2Config {
  salt: string;
  keySize: number;
  iterations: number;
  outputFormat: string;
}

export interface EvpkdfConfig {
  salt: string;
  keySize: number;
  iterations: number;
  outputFormat: string;
}

export interface ScryptConfig {
  salt: string;
  keySize: number;
  costFactor: number;
  blockSizeFactor: number;
  parallelism: number;
  outputFormat: string;
}

const getEncoder = (encoding: string) => {
  const encoders: Record<string, typeof CryptoJS.enc.Utf8> = {
    Utf8: CryptoJS.enc.Utf8,
    Base64: CryptoJS.enc.Base64,
    Hex: CryptoJS.enc.Hex,
    Latin1: CryptoJS.enc.Latin1,
    Utf16: CryptoJS.enc.Utf16,
    Utf16LE: CryptoJS.enc.Utf16LE,
    Utf16BE: CryptoJS.enc.Utf16,
  };
  return encoders[encoding] || CryptoJS.enc.Utf8;
};

const getMode = (mode: string) => {
  const modes: Record<string, typeof CryptoJS.mode.CBC> = {
    CBC: CryptoJS.mode.CBC,
    ECB: CryptoJS.mode.ECB,
    CFB: CryptoJS.mode.CFB,
    OFB: CryptoJS.mode.OFB,
    CTR: CryptoJS.mode.CTR,
  };
  return modes[mode] || CryptoJS.mode.CBC;
};

const getPadding = (padding: string) => {
  const paddings: Record<string, typeof CryptoJS.pad.Pkcs7> = {
    Pkcs7: CryptoJS.pad.Pkcs7,
    ZeroPadding: CryptoJS.pad.ZeroPadding,
    NoPadding: CryptoJS.pad.NoPadding,
    Iso10126: CryptoJS.pad.Iso10126,
    Iso97971: CryptoJS.pad.Iso97971,
    AnsiX923: CryptoJS.pad.AnsiX923,
  };
  return paddings[padding] || CryptoJS.pad.Pkcs7;
};

const bytesToHex = (bytes: Uint8Array): string => Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");

export const md5Results = (text: string) => ({
  lower: CryptoJS.MD5(text).toString().toLowerCase(),
  upper: CryptoJS.MD5(text).toString().toUpperCase(),
  lower16: CryptoJS.MD5(text).toString().substring(8, 24).toLowerCase(),
  upper16: CryptoJS.MD5(text).toString().substring(8, 24).toUpperCase(),
});

export const ripemd160 = (text: string, format: string): string => {
  const hash = CryptoJS.RIPEMD160(text);
  return format === "Base64" ? hash.toString(CryptoJS.enc.Base64) : hash.toString(CryptoJS.enc.Hex);
};

export const sha = (text: string, type: string, format: string): string => {
  const hashMap: Record<string, CryptoJS.lib.WordArray> = {
    SHA1: CryptoJS.SHA1(text),
    SHA3: CryptoJS.SHA3(text),
    SHA224: CryptoJS.SHA224(text),
    SHA256: CryptoJS.SHA256(text),
    SHA384: CryptoJS.SHA384(text),
    SHA512: CryptoJS.SHA512(text),
  };
  const hash = hashMap[type];
  if (!hash) return "";
  return format === "Base64" ? hash.toString(CryptoJS.enc.Base64) : hash.toString(CryptoJS.enc.Hex);
};

export const hmac = (text: string, key: string, type: string, format: string = "Hex"): string => {
  const hmacMap: Record<string, CryptoJS.lib.WordArray> = {
    "HMAC-MD5": CryptoJS.HmacMD5(text, key),
    "HMAC-SHA1": CryptoJS.HmacSHA1(text, key),
    "HMAC-SHA224": CryptoJS.HmacSHA224(text, key),
    "HMAC-SHA256": CryptoJS.HmacSHA256(text, key),
    "HMAC-SHA384": CryptoJS.HmacSHA384(text, key),
    "HMAC-SHA512": CryptoJS.HmacSHA512(text, key),
    "HMAC-SHA3": CryptoJS.HmacSHA3(text, key),
    "HMAC-RIPEMD160": CryptoJS.HmacRIPEMD160(text, key),
  };
  const hash = hmacMap[type];
  if (!hash) return "";
  return format === "Base64" ? hash.toString(CryptoJS.enc.Base64) : hash.toString(CryptoJS.enc.Hex);
};

export const symmetricEncrypt = (
  type: string,
  text: string,
  key: string,
  config: CipherConfig,
): string => {
  const keyParsed = getEncoder(config.keyEncoding).parse(key);
  const ivParsed = config.iv ? getEncoder(config.ivEncoding).parse(config.iv) : undefined;

  const options = {
    mode: getMode(config.mode),
    padding: getPadding(config.padding),
  } as Record<string, unknown>;
  if (ivParsed && config.mode !== "ECB") {
    options.iv = ivParsed;
  }

  const cipherMap: Record<string, typeof CryptoJS.AES> = {
    aes: CryptoJS.AES,
    des: CryptoJS.DES,
    "3des": CryptoJS.TripleDES,
  };
  const cipher = cipherMap[type];
  if (!cipher) return "";

  const encrypted = cipher.encrypt(text, keyParsed, options);
  return config.outputEncoding === "Hex"
    ? encrypted.ciphertext.toString(CryptoJS.enc.Hex)
    : encrypted.toString();
};

export const symmetricDecrypt = (
  type: string,
  text: string,
  key: string,
  config: CipherConfig,
): string => {
  const keyParsed = getEncoder(config.keyEncoding).parse(key);
  const ivParsed = config.iv ? getEncoder(config.ivEncoding).parse(config.iv) : undefined;

  const options = {
    mode: getMode(config.mode),
    padding: getPadding(config.padding),
  } as Record<string, unknown>;
  if (ivParsed && config.mode !== "ECB") {
    options.iv = ivParsed;
  }

  const cipherMap: Record<string, typeof CryptoJS.AES> = {
    aes: CryptoJS.AES,
    des: CryptoJS.DES,
    "3des": CryptoJS.TripleDES,
  };
  const cipher = cipherMap[type];
  if (!cipher) return "";

  let ciphertext = text;
  if (config.outputEncoding === "Hex") {
    ciphertext = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(text));
  }

  const decrypted = cipher.decrypt(ciphertext, keyParsed, options);
  return decrypted.toString(CryptoJS.enc.Utf8);
};

export const streamCipherEncrypt = (
  type: "rc4" | "rabbit",
  text: string,
  key: string,
  keyEncoding: string = "Utf8",
): string => {
  const keyParsed = getEncoder(keyEncoding).parse(key);
  const cipherMap = {
    rc4: CryptoJS.RC4,
    rabbit: CryptoJS.Rabbit,
  };
  const cipher = cipherMap[type];
  if (!cipher) return "";
  return cipher.encrypt(text, keyParsed).toString();
};

export const streamCipherDecrypt = (
  type: "rc4" | "rabbit",
  text: string,
  key: string,
  keyEncoding: string = "Utf8",
): string => {
  const keyParsed = getEncoder(keyEncoding).parse(key);
  const cipherMap = {
    rc4: CryptoJS.RC4,
    rabbit: CryptoJS.Rabbit,
  };
  const cipher = cipherMap[type];
  if (!cipher) return "";
  return cipher.decrypt(text, keyParsed).toString(CryptoJS.enc.Utf8);
};

export const pbkdf2 = (password: string, config: Pbkdf2Config): string => {
  const key = CryptoJS.PBKDF2(password, config.salt, {
    keySize: config.keySize / 32,
    iterations: config.iterations,
  });
  return config.outputFormat === "Base64"
    ? key.toString(CryptoJS.enc.Base64)
    : key.toString(CryptoJS.enc.Hex);
};

export const evpkdf = (password: string, config: EvpkdfConfig): string => {
  const key = CryptoJS.EvpKDF(password, config.salt, {
    keySize: config.keySize / 32,
    iterations: config.iterations,
  });
  return config.outputFormat === "Base64"
    ? key.toString(CryptoJS.enc.Base64)
    : key.toString(CryptoJS.enc.Hex);
};

export const scryptDerive = async (password: string, config: ScryptConfig): Promise<string> => {
  try {
    const derived = await scryptAsync(password, config.salt, {
      N: config.costFactor,
      r: config.blockSizeFactor,
      p: config.parallelism,
      dkLen: Math.max(1, Math.floor(config.keySize / 8)),
    });
    return config.outputFormat === "Base64"
      ? Buffer.from(derived).toString("base64")
      : bytesToHex(derived);
  } catch (error) {
    console.error("scrypt error:", error);
    return "";
  }
};

export const encrypt = (type: string, text: string, key: string): string => {
  const map: Record<string, () => string> = {
    aes: () => CryptoJS.AES.encrypt(text, key).toString(),
    des: () => CryptoJS.DES.encrypt(text, key).toString(),
    "3des": () => CryptoJS.TripleDES.encrypt(text, key).toString(),
    rc4: () => CryptoJS.RC4.encrypt(text, key).toString(),
    rabbit: () => CryptoJS.Rabbit.encrypt(text, key).toString(),
    base64: () => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text)),
    base64url: () => {
      const base64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text));
      return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    url: () => encodeURIComponent(text),
    hex: () => CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(text)),
    utf16: () => CryptoJS.enc.Utf16.stringify(CryptoJS.enc.Utf8.parse(text)),
    unicode: () => text.split("").map((char) => {
      const code = char.charCodeAt(0);
      if (code > 127) {
        return `\\u${code.toString(16).padStart(4, "0")}`;
      }
      return char;
    }).join(""),
    html: () => text.split("").map((char) => {
      const code = char.charCodeAt(0);
      if (code > 127 || char === "<" || char === ">" || char === "&" || char === "\"" || char === "'") {
        return `&#${code};`;
      }
      return char;
    }).join(""),
  };
  return map[type]?.() ?? "";
};

export const decrypt = (type: string, text: string, key: string): string => {
  const map: Record<string, () => string> = {
    aes: () => CryptoJS.AES.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    des: () => CryptoJS.DES.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    "3des": () => CryptoJS.TripleDES.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    rc4: () => CryptoJS.RC4.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    rabbit: () => CryptoJS.Rabbit.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    base64: () => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(text)),
    base64url: () => {
      let base64 = text.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += "=";
      return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(base64));
    },
    url: () => decodeURIComponent(text),
    hex: () => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Hex.parse(text)),
    utf16: () => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Utf16.parse(text)).replace(/\u0000+$/g, ""),
    unicode: () => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
    html: () => text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
  };
  return map[type]?.() ?? "";
};
