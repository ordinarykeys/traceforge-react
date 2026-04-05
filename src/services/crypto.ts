import { Buffer } from 'buffer'
import CryptoJS from 'crypto-js'
import forge from 'node-forge'
import smCrypto from 'sm-crypto';
const { sm2, sm3, sm4 } = smCrypto;
import { blake2b, blake2s } from '@noble/hashes/blake2.js'
import { blake3 } from '@noble/hashes/blake3.js'
import { scryptAsync } from '@noble/hashes/scrypt.js'

// RSA 密钥对生成
export interface RSAKeyPair {
  publicKey: string
  privateKey: string
}

export const generateRSAKeyPair = (bits: number = 2048): RSAKeyPair => {
  const keypair = forge.pki.rsa.generateKeyPair({ bits, e: 0x10001 })
  return {
    publicKey: forge.pki.publicKeyToPem(keypair.publicKey),
    privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
  }
}

// 获取RSA密钥的最大加密长度
const getMaxEncryptLength = (publicKey: forge.pki.rsa.PublicKey, padding: string): number => {
  const keyBytes = publicKey.n.bitLength() / 8
  if (padding === 'OAEP') {
    // OAEP with SHA-256: keyBytes - 2 * hashLength - 2 = keyBytes - 66
    return keyBytes - 66
  } else {
    // PKCS1v1.5: keyBytes - 11
    return keyBytes - 11
  }
}

// RSA 加密（支持分段和多种填充模式）
export const rsaEncrypt = (
  text: string,
  publicKeyPem: string,
  outputFormat: string = 'Base64',
  padding: string = 'OAEP'
): string => {
  try {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem)
    const bytes = forge.util.encodeUtf8(text)
    const maxLen = getMaxEncryptLength(publicKey, padding)
    
    // 分段加密
    const chunks: string[] = []
    for (let i = 0; i < bytes.length; i += maxLen) {
      const chunk = bytes.substring(i, i + maxLen)
      let encrypted: string
      
      if (padding === 'OAEP') {
        encrypted = publicKey.encrypt(chunk, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() },
        })
      } else {
        // PKCS1v1.5
        encrypted = publicKey.encrypt(chunk, 'RSAES-PKCS1-V1_5')
      }
      chunks.push(encrypted)
    }
    
    // 合并所有加密块
    const result = chunks.join('')
    return outputFormat === 'Hex'
      ? forge.util.bytesToHex(result)
      : forge.util.encode64(result)
  } catch (e) {
    console.error('RSA encrypt error:', e)
    return ''
  }
}

// RSA 解密（支持分段和多种填充模式）
export const rsaDecrypt = (
  ciphertext: string,
  privateKeyPem: string,
  inputFormat: string = 'Base64',
  padding: string = 'OAEP'
): string => {
  try {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)
    const encrypted = inputFormat === 'Hex'
      ? forge.util.hexToBytes(ciphertext)
      : forge.util.decode64(ciphertext)
    
    // 密钥长度（字节）
    const keyBytes = privateKey.n.bitLength() / 8
    
    // 分段解密
    const chunks: string[] = []
    for (let i = 0; i < encrypted.length; i += keyBytes) {
      const chunk = encrypted.substring(i, i + keyBytes)
      let decrypted: string
      
      if (padding === 'OAEP') {
        decrypted = privateKey.decrypt(chunk, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() },
        })
      } else {
        // PKCS1v1.5
        decrypted = privateKey.decrypt(chunk, 'RSAES-PKCS1-V1_5')
      }
      chunks.push(decrypted)
    }
    
    return forge.util.decodeUtf8(chunks.join(''))
  } catch (e) {
    console.error('RSA decrypt error:', e)
    return ''
  }
}

// RSA 签名（支持多种哈希算法）
export const rsaSign = (
  text: string,
  privateKeyPem: string,
  algorithm: string = 'SHA256',
  outputFormat: string = 'Base64'
): string => {
  try {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)
    let md: forge.md.MessageDigest
    
    switch (algorithm) {
      case 'SHA1':
        md = forge.md.sha1.create()
        break
      case 'SHA384':
        md = forge.md.sha384.create()
        break
      case 'SHA512':
        md = forge.md.sha512.create()
        break
      case 'MD5':
        md = forge.md.md5.create()
        break
      default:
        md = forge.md.sha256.create()
    }
    
    md.update(text, 'utf8')
    const signature = privateKey.sign(md)
    return outputFormat === 'Hex'
      ? forge.util.bytesToHex(signature)
      : forge.util.encode64(signature)
  } catch (e) {
    console.error('RSA sign error:', e)
    return ''
  }
}

// RSA 验签
export const rsaVerify = (
  text: string,
  signature: string,
  publicKeyPem: string,
  algorithm: string = 'SHA256',
  inputFormat: string = 'Base64'
): boolean => {
  try {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem)
    let md: forge.md.MessageDigest
    
    switch (algorithm) {
      case 'SHA1':
        md = forge.md.sha1.create()
        break
      case 'SHA384':
        md = forge.md.sha384.create()
        break
      case 'SHA512':
        md = forge.md.sha512.create()
        break
      case 'MD5':
        md = forge.md.md5.create()
        break
      default:
        md = forge.md.sha256.create()
    }
    
    md.update(text, 'utf8')
    const sig = inputFormat === 'Hex'
      ? forge.util.hexToBytes(signature)
      : forge.util.decode64(signature)
    return publicKey.verify(md.digest().bytes(), sig)
  } catch (e) {
    console.error('RSA verify error:', e)
    return false
  }
}

// MD5 多格式输出
export const md5Results = (text: string) => ({
  lower: CryptoJS.MD5(text).toString().toLowerCase(),
  upper: CryptoJS.MD5(text).toString().toUpperCase(),
  lower16: CryptoJS.MD5(text).toString().substring(8, 24).toLowerCase(),
  upper16: CryptoJS.MD5(text).toString().substring(8, 24).toUpperCase(),
})

// RIPEMD160
export const ripemd160 = (text: string, format: string): string => {
  const hash = CryptoJS.RIPEMD160(text)
  return format === 'Base64' ? hash.toString(CryptoJS.enc.Base64) : hash.toString(CryptoJS.enc.Hex)
}

// SHA 单个算法
export const sha = (text: string, type: string, format: string): string => {
  const hashMap: Record<string, CryptoJS.lib.WordArray> = {
    SHA1: CryptoJS.SHA1(text),
    SHA3: CryptoJS.SHA3(text),
    SHA224: CryptoJS.SHA224(text),
    SHA256: CryptoJS.SHA256(text),
    SHA384: CryptoJS.SHA384(text),
    SHA512: CryptoJS.SHA512(text),
  }
  const hash = hashMap[type]
  if (!hash) return ''
  return format === 'Base64' ? hash.toString(CryptoJS.enc.Base64) : hash.toString(CryptoJS.enc.Hex)
}

// HMAC 单个算法 - 扩展支持所有类型和输出格式
export const hmac = (text: string, key: string, type: string, format: string = 'Hex'): string => {
  const hmacMap: Record<string, CryptoJS.lib.WordArray> = {
    'HMAC-MD5': CryptoJS.HmacMD5(text, key),
    'HMAC-SHA1': CryptoJS.HmacSHA1(text, key),
    'HMAC-SHA224': CryptoJS.HmacSHA224(text, key),
    'HMAC-SHA256': CryptoJS.HmacSHA256(text, key),
    'HMAC-SHA384': CryptoJS.HmacSHA384(text, key),
    'HMAC-SHA512': CryptoJS.HmacSHA512(text, key),
    'HMAC-SHA3': CryptoJS.HmacSHA3(text, key),
    'HMAC-RIPEMD160': CryptoJS.HmacRIPEMD160(text, key),
  }
  const hash = hmacMap[type]
  if (!hash) return ''
  return format === 'Base64' ? hash.toString(CryptoJS.enc.Base64) : hash.toString(CryptoJS.enc.Hex)
}

// 获取编码器
const getEncoder = (encoding: string) => {
  const encoders: Record<string, typeof CryptoJS.enc.Utf8> = {
    Utf8: CryptoJS.enc.Utf8,
    Base64: CryptoJS.enc.Base64,
    Hex: CryptoJS.enc.Hex,
    Latin1: CryptoJS.enc.Latin1,
    Utf16: CryptoJS.enc.Utf16,
    Utf16LE: CryptoJS.enc.Utf16LE,
    Utf16BE: CryptoJS.enc.Utf16,
  }
  return encoders[encoding] || CryptoJS.enc.Utf8
}

const wordArrayToBytes = (wordArray: CryptoJS.lib.WordArray): Uint8Array => {
  const { words, sigBytes } = wordArray
  const bytes = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i += 1) {
    bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return bytes
}

const parseEncodingToBytes = (value: string, encoding: string): Uint8Array => {
  return wordArrayToBytes(getEncoder(encoding).parse(value))
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const stringifyBytes = (bytes: Uint8Array, format: string): string => {
  if (format === 'Hex') {
    return bytesToHex(bytes)
  }
  return Buffer.from(bytes).toString('base64')
}

// 获取模式
const getMode = (mode: string) => {
  const modes: Record<string, typeof CryptoJS.mode.CBC> = {
    CBC: CryptoJS.mode.CBC,
    ECB: CryptoJS.mode.ECB,
    CFB: CryptoJS.mode.CFB,
    OFB: CryptoJS.mode.OFB,
    CTR: CryptoJS.mode.CTR,
  }
  return modes[mode] || CryptoJS.mode.CBC
}

// 获取填充
const getPadding = (padding: string) => {
  const paddings: Record<string, typeof CryptoJS.pad.Pkcs7> = {
    Pkcs7: CryptoJS.pad.Pkcs7,
    ZeroPadding: CryptoJS.pad.ZeroPadding,
    NoPadding: CryptoJS.pad.NoPadding,
    Iso10126: CryptoJS.pad.Iso10126,
    Iso97971: CryptoJS.pad.Iso97971,
    AnsiX923: CryptoJS.pad.AnsiX923,
  }
  return paddings[padding] || CryptoJS.pad.Pkcs7
}

// 对称加密配置
export interface CipherConfig {
  mode: string
  padding: string
  keyEncoding: string
  ivEncoding: string
  outputEncoding: string
  iv: string
}

// 对称加密
export const symmetricEncrypt = (
  type: string,
  text: string,
  key: string,
  config: CipherConfig
): string => {
  const keyParsed = getEncoder(config.keyEncoding).parse(key)
  const ivParsed = config.iv ? getEncoder(config.ivEncoding).parse(config.iv) : undefined

  const options = {
    mode: getMode(config.mode),
    padding: getPadding(config.padding),
  } as any
  if (ivParsed && config.mode !== 'ECB') {
    options.iv = ivParsed
  }

  const cipherMap: Record<string, typeof CryptoJS.AES> = {
    aes: CryptoJS.AES,
    des: CryptoJS.DES,
    '3des': CryptoJS.TripleDES,
  }

  const cipher = cipherMap[type]
  if (!cipher) return ''

  const encrypted = cipher.encrypt(text, keyParsed, options)
  return config.outputEncoding === 'Hex'
    ? encrypted.ciphertext.toString(CryptoJS.enc.Hex)
    : encrypted.toString()
}

// 对称解密
export const symmetricDecrypt = (
  type: string,
  text: string,
  key: string,
  config: CipherConfig
): string => {
  const keyParsed = getEncoder(config.keyEncoding).parse(key)
  const ivParsed = config.iv ? getEncoder(config.ivEncoding).parse(config.iv) : undefined

  const options = {
    mode: getMode(config.mode),
    padding: getPadding(config.padding),
  } as any
  if (ivParsed && config.mode !== 'ECB') {
    options.iv = ivParsed
  }

  const cipherMap: Record<string, typeof CryptoJS.AES> = {
    aes: CryptoJS.AES,
    des: CryptoJS.DES,
    '3des': CryptoJS.TripleDES,
  }

  const cipher = cipherMap[type]
  if (!cipher) return ''

  // 如果输入是 Hex 格式，需要转换
  let ciphertext = text
  if (config.outputEncoding === 'Hex') {
    ciphertext = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(text))
  }

  const decrypted = cipher.decrypt(ciphertext, keyParsed, options)
  return decrypted.toString(CryptoJS.enc.Utf8)
}

export const streamCipherEncrypt = (
  type: 'rc4' | 'rabbit',
  text: string,
  key: string,
  keyEncoding: string = 'Utf8'
): string => {
  const keyParsed = getEncoder(keyEncoding).parse(key)
  const cipherMap = {
    rc4: CryptoJS.RC4,
    rabbit: CryptoJS.Rabbit,
  }

  const cipher = cipherMap[type]
  if (!cipher) return ''

  return cipher.encrypt(text, keyParsed).toString()
}

export const streamCipherDecrypt = (
  type: 'rc4' | 'rabbit',
  text: string,
  key: string,
  keyEncoding: string = 'Utf8'
): string => {
  const keyParsed = getEncoder(keyEncoding).parse(key)
  const cipherMap = {
    rc4: CryptoJS.RC4,
    rabbit: CryptoJS.Rabbit,
  }

  const cipher = cipherMap[type]
  if (!cipher) return ''

  return cipher.decrypt(text, keyParsed).toString(CryptoJS.enc.Utf8)
}

// PBKDF2 密钥派生
export interface Pbkdf2Config {
  salt: string
  keySize: number
  iterations: number
  outputFormat: string
}

export const pbkdf2 = (password: string, config: Pbkdf2Config): string => {
  const key = CryptoJS.PBKDF2(password, config.salt, {
    keySize: config.keySize / 32,
    iterations: config.iterations,
  })
  return config.outputFormat === 'Base64'
    ? key.toString(CryptoJS.enc.Base64)
    : key.toString(CryptoJS.enc.Hex)
}

// EvpKDF 密钥派生
export interface EvpkdfConfig {
  salt: string
  keySize: number
  iterations: number
  outputFormat: string
}

export const evpkdf = (password: string, config: EvpkdfConfig): string => {
  const key = CryptoJS.EvpKDF(password, config.salt, {
    keySize: config.keySize / 32,
    iterations: config.iterations,
  })
  return config.outputFormat === 'Base64'
    ? key.toString(CryptoJS.enc.Base64)
    : key.toString(CryptoJS.enc.Hex)
}

export interface ScryptConfig {
  salt: string
  keySize: number
  costFactor: number
  blockSizeFactor: number
  parallelism: number
  outputFormat: string
}

export const scryptDerive = async (password: string, config: ScryptConfig): Promise<string> => {
  try {
    const derived = await scryptAsync(password, config.salt, {
      N: config.costFactor,
      r: config.blockSizeFactor,
      p: config.parallelism,
      dkLen: Math.max(1, Math.floor(config.keySize / 8)),
    })
    return config.outputFormat === 'Base64'
      ? Buffer.from(derived).toString('base64')
      : bytesToHex(derived)
  } catch (e) {
    console.error('scrypt error:', e)
    return ''
  }
}

// 加密
export const encrypt = (type: string, text: string, key: string): string => {
  const map: Record<string, () => string> = {
    aes: () => CryptoJS.AES.encrypt(text, key).toString(),
    des: () => CryptoJS.DES.encrypt(text, key).toString(),
    '3des': () => CryptoJS.TripleDES.encrypt(text, key).toString(),
    rc4: () => CryptoJS.RC4.encrypt(text, key).toString(),
    rabbit: () => CryptoJS.Rabbit.encrypt(text, key).toString(),
    base64: () => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text)),
    base64url: () => {
      const base64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text))
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    },
    url: () => encodeURIComponent(text),
    hex: () => CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(text)),
    utf16: () => CryptoJS.enc.Utf16.stringify(CryptoJS.enc.Utf8.parse(text)),
    unicode: () => {
      return text.split('').map(char => {
        const code = char.charCodeAt(0)
        if (code > 127) {
          return '\\u' + code.toString(16).padStart(4, '0')
        }
        return char
      }).join('')
    },
    html: () => {
      return text.split('').map(char => {
        const code = char.charCodeAt(0)
        if (code > 127 || char === '<' || char === '>' || char === '&' || char === '"' || char === "'") {
          return '&#' + code + ';'
        }
        return char
      }).join('')
    },
  }
  return map[type]?.() ?? ''
}

// 解密
export const decrypt = (type: string, text: string, key: string): string => {
  const map: Record<string, () => string> = {
    aes: () => CryptoJS.AES.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    des: () => CryptoJS.DES.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    '3des': () => CryptoJS.TripleDES.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    rc4: () => CryptoJS.RC4.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    rabbit: () => CryptoJS.Rabbit.decrypt(text, key).toString(CryptoJS.enc.Utf8),
    base64: () => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(text)),
    base64url: () => {
      let base64 = text.replace(/-/g, '+').replace(/_/g, '/')
      while (base64.length % 4) base64 += '='
      return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(base64))
    },
    url: () => decodeURIComponent(text),
    hex: () => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Hex.parse(text)),
    utf16: () => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Utf16.parse(text)).replace(/\u0000+$/g, ''),
    unicode: () => {
      return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16))
      })
    },
    html: () => {
      return text.replace(/&#(\d+);/g, (_, dec) => {
        return String.fromCharCode(parseInt(dec, 10))
      }).replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16))
      })
    },
  }
  return map[type]?.() ?? ''
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const base32Encode = (text: string): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    let bits = 0
    let value = 0
    let output = ''

    for (const byte of bytes) {
      value = (value << 8) | byte
      bits += 8

      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
        bits -= 5
      }
    }

    if (bits > 0) {
      output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
    }

    while (output.length % 8 !== 0) {
      output += '='
    }

    return output
  } catch (e) {
    console.error('Base32 encode error:', e)
    return ''
  }
}

export const base32Decode = (text: string): string => {
  try {
    const clean = text.toUpperCase().replace(/=+$/, '')
    let bits = 0
    let value = 0
    const bytes: number[] = []

    for (const char of clean) {
      const index = BASE32_ALPHABET.indexOf(char)
      if (index < 0) {
        throw new Error(`Invalid Base32 character: ${char}`)
      }

      value = (value << 5) | index
      bits += 5

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff)
        bits -= 8
      }
    }

    return new TextDecoder().decode(new Uint8Array(bytes))
  } catch (e) {
    console.error('Base32 decode error:', e)
    return ''
  }
}

export const base85Encode = (text: string): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    let output = ''

    for (let i = 0; i < bytes.length; i += 4) {
      const chunk = bytes.slice(i, i + 4)
      if (chunk.length === 4 && chunk[0] === 0 && chunk[1] === 0 && chunk[2] === 0 && chunk[3] === 0) {
        output += 'z'
        continue
      }

      let value = 0
      for (let j = 0; j < 4; j += 1) {
        value = value * 256 + (chunk[j] ?? 0)
      }

      const encoded = new Array(5)
      for (let j = 4; j >= 0; j -= 1) {
        encoded[j] = String.fromCharCode((value % 85) + 33)
        value = Math.floor(value / 85)
      }

      output += encoded.slice(0, chunk.length + 1).join('')
    }

    return output
  } catch (e) {
    console.error('Base85 encode error:', e)
    return ''
  }
}

export const base85Decode = (text: string): string => {
  try {
    const clean = text.replace(/\s+/g, '')
    const bytes: number[] = []
    let chunk = ''

    const flush = (value: string, isFinal: boolean) => {
      const padded = value.padEnd(5, 'u')
      let num = 0

      for (let i = 0; i < 5; i += 1) {
        const code = padded.charCodeAt(i) - 33
        if (code < 0 || code > 84) throw new Error(`Invalid Base85 character: ${padded[i]}`)
        num = num * 85 + code
      }

      const block = [
        (num >>> 24) & 0xff,
        (num >>> 16) & 0xff,
        (num >>> 8) & 0xff,
        num & 0xff,
      ]
      bytes.push(...block.slice(0, isFinal ? value.length - 1 : 4))
    }

    for (const char of clean) {
      if (char === 'z') {
        if (chunk.length) throw new Error('Invalid Base85 sequence')
        bytes.push(0, 0, 0, 0)
        continue
      }
      chunk += char
      if (chunk.length === 5) {
        flush(chunk, false)
        chunk = ''
      }
    }

    if (chunk.length) {
      if (chunk.length === 1) throw new Error('Invalid Base85 tail')
      flush(chunk, true)
    }

    return new TextDecoder().decode(new Uint8Array(bytes))
  } catch (e) {
    console.error('Base85 decode error:', e)
    return ''
  }
}

const BASE91_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"'
const BASE91_DECODER = Object.fromEntries([...BASE91_ALPHABET].map((char, index) => [char, index]))

export const base91Encode = (text: string): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    let b = 0
    let n = 0
    let output = ''

    for (const byte of bytes) {
      b |= byte << n
      n += 8
      if (n > 13) {
        let value = b & 8191
        if (value > 88) {
          b >>= 13
          n -= 13
        } else {
          value = b & 16383
          b >>= 14
          n -= 14
        }
        output += BASE91_ALPHABET[value % 91] + BASE91_ALPHABET[Math.floor(value / 91)]
      }
    }

    if (n) {
      output += BASE91_ALPHABET[b % 91]
      if (n > 7 || b > 90) {
        output += BASE91_ALPHABET[Math.floor(b / 91)]
      }
    }

    return output
  } catch (e) {
    console.error('Base91 encode error:', e)
    return ''
  }
}

export const base91Decode = (text: string): string => {
  try {
    const bytes: number[] = []
    let value = -1
    let b = 0
    let n = 0

    for (const char of text.replace(/\s+/g, '')) {
      const decoded = BASE91_DECODER[char]
      if (decoded === undefined) throw new Error(`Invalid Base91 character: ${char}`)
      if (value < 0) {
        value = decoded
        continue
      }

      value += decoded * 91
      b |= value << n
      n += (value & 8191) > 88 ? 13 : 14

      while (n > 7) {
        bytes.push(b & 0xff)
        b >>= 8
        n -= 8
      }

      value = -1
    }

    if (value >= 0) {
      bytes.push((b | (value << n)) & 0xff)
    }

    return new TextDecoder().decode(new Uint8Array(bytes))
  } catch (e) {
    console.error('Base91 decode error:', e)
    return ''
  }
}

export const crc32 = (text: string, format: string = 'Hex'): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    let crc = 0 ^ -1

    for (const byte of bytes) {
      crc ^= byte
      for (let i = 0; i < 8; i += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
      }
    }

    const result = (crc ^ -1) >>> 0
    const out = new Uint8Array([
      (result >>> 24) & 0xff,
      (result >>> 16) & 0xff,
      (result >>> 8) & 0xff,
      result & 0xff,
    ])
    return format === 'Base64'
      ? Buffer.from(out).toString('base64')
      : result.toString(16).padStart(8, '0')
  } catch (e) {
    console.error('CRC32 error:', e)
    return ''
  }
}

export const crc16 = (text: string, format: string = 'Hex'): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    let crc = 0xffff

    for (const byte of bytes) {
      crc ^= byte
      for (let i = 0; i < 8; i += 1) {
        if ((crc & 1) !== 0) {
          crc = (crc >>> 1) ^ 0xa001
        } else {
          crc >>>= 1
        }
      }
    }

    crc &= 0xffff
    const out = new Uint8Array([(crc >>> 8) & 0xff, crc & 0xff])
    return format === 'Base64'
      ? Buffer.from(out).toString('base64')
      : crc.toString(16).padStart(4, '0')
  } catch (e) {
    console.error('CRC16 error:', e)
    return ''
  }
}

export const adler32 = (text: string, format: string = 'Hex'): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    let a = 1
    let b = 0

    for (const byte of bytes) {
      a = (a + byte) % 65521
      b = (b + a) % 65521
    }

    const result = (((b << 16) | a) >>> 0)
    const out = new Uint8Array([
      (result >>> 24) & 0xff,
      (result >>> 16) & 0xff,
      (result >>> 8) & 0xff,
      result & 0xff,
    ])
    return format === 'Base64'
      ? Buffer.from(out).toString('base64')
      : result.toString(16).padStart(8, '0')
  } catch (e) {
    console.error('Adler32 error:', e)
    return ''
  }
}

export const fnv1a = (text: string, format: string = 'Hex'): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    let hash = 0x811c9dc5

    for (const byte of bytes) {
      hash ^= byte
      hash = Math.imul(hash, 0x01000193) >>> 0
    }

    const out = new Uint8Array([
      (hash >>> 24) & 0xff,
      (hash >>> 16) & 0xff,
      (hash >>> 8) & 0xff,
      hash & 0xff,
    ])
    return format === 'Base64'
      ? Buffer.from(out).toString('base64')
      : hash.toString(16).padStart(8, '0')
  } catch (e) {
    console.error('FNV1a error:', e)
    return ''
  }
}

export const murmurhash3 = (text: string, format: string = 'Hex', seed: number = 0): string => {
  try {
    const data = new TextEncoder().encode(text)
    const remainder = data.length & 3
    const bytes = data.length - remainder
    let hash = seed
    const c1 = 0xcc9e2d51
    const c2 = 0x1b873593
    let i = 0

    while (i < bytes) {
      let k =
        (data[i] & 0xff) |
        ((data[i + 1] & 0xff) << 8) |
        ((data[i + 2] & 0xff) << 16) |
        ((data[i + 3] & 0xff) << 24)
      i += 4

      k = Math.imul(k, c1)
      k = (k << 15) | (k >>> 17)
      k = Math.imul(k, c2)

      hash ^= k
      hash = (hash << 13) | (hash >>> 19)
      hash = (Math.imul(hash, 5) + 0xe6546b64) | 0
    }

    let k1 = 0
    if (remainder === 3) {
      k1 ^= (data[i + 2] & 0xff) << 16
    }
    if (remainder >= 2) {
      k1 ^= (data[i + 1] & 0xff) << 8
    }
    if (remainder >= 1) {
      k1 ^= data[i] & 0xff
      k1 = Math.imul(k1, c1)
      k1 = (k1 << 15) | (k1 >>> 17)
      k1 = Math.imul(k1, c2)
      hash ^= k1
    }

    hash ^= data.length
    hash ^= hash >>> 16
    hash = Math.imul(hash, 0x85ebca6b)
    hash ^= hash >>> 13
    hash = Math.imul(hash, 0xc2b2ae35)
    hash ^= hash >>> 16

    const result = hash >>> 0
    const out = new Uint8Array([
      (result >>> 24) & 0xff,
      (result >>> 16) & 0xff,
      (result >>> 8) & 0xff,
      result & 0xff,
    ])

    return format === 'Base64'
      ? Buffer.from(out).toString('base64')
      : result.toString(16).padStart(8, '0')
  } catch (e) {
    console.error('MurmurHash3 error:', e)
    return ''
  }
}

export const blake2Hash = (
  text: string,
  type: 'blake2s' | 'blake2b',
  format: string = 'Hex'
): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    const digest = type === 'blake2s' ? blake2s(bytes) : blake2b(bytes)
    return format === 'Base64'
      ? Buffer.from(digest).toString('base64')
      : bytesToHex(digest)
  } catch (e) {
    console.error(`${type} error:`, e)
    return ''
  }
}

export const blake3Hash = (text: string, format: string = 'Hex'): string => {
  try {
    const digest = blake3(new TextEncoder().encode(text))
    return format === 'Base64'
      ? Buffer.from(digest).toString('base64')
      : bytesToHex(digest)
  } catch (e) {
    console.error('BLAKE3 error:', e)
    return ''
  }
}

export interface AesGcmConfig {
  keyEncoding: string
  ivEncoding: string
  outputEncoding: string
  iv: string
}

export const aesGcmEncrypt = async (
  text: string,
  key: string,
  config: AesGcmConfig
): Promise<string> => {
  try {
    const keyBytes = parseEncodingToBytes(key, config.keyEncoding)
    const ivBytes = parseEncodingToBytes(config.iv, config.ivEncoding)
    const cryptoKey = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['encrypt'])
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
      cryptoKey,
      new TextEncoder().encode(text)
    )
    return stringifyBytes(new Uint8Array(encrypted), config.outputEncoding)
  } catch (e) {
    console.error('AES-GCM encrypt error:', e)
    return ''
  }
}

export const aesGcmDecrypt = async (
  ciphertext: string,
  key: string,
  config: AesGcmConfig
): Promise<string> => {
  try {
    const keyBytes = parseEncodingToBytes(key, config.keyEncoding)
    const ivBytes = parseEncodingToBytes(config.iv, config.ivEncoding)
    const data = config.outputEncoding === 'Hex'
      ? hexToBytes(ciphertext)
      : new Uint8Array(Buffer.from(ciphertext, 'base64'))
    const cryptoKey = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['decrypt'])
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
      cryptoKey,
      toArrayBuffer(data)
    )
    return new TextDecoder().decode(new Uint8Array(decrypted))
  } catch (e) {
    console.error('AES-GCM decrypt error:', e)
    return ''
  }
}

const xxteaToUint32Array = (bytes: Uint8Array, includeLength: boolean): Uint32Array => {
  const length = bytes.length
  const n = Math.ceil(length / 4)
  const result = new Uint32Array(includeLength ? n + 1 : n)

  for (let i = 0; i < length; i += 1) {
    result[i >>> 2] |= bytes[i] << ((i & 3) << 3)
  }

  if (includeLength) {
    result[n] = length
  }

  return result
}

const xxteaToBytes = (data: Uint32Array, includeLength: boolean): Uint8Array => {
  let length = data.length * 4
  if (includeLength) {
    const actualLength = data[data.length - 1]
    length = actualLength
  }

  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) {
    bytes[i] = (data[i >>> 2] >>> ((i & 3) << 3)) & 0xff
  }
  return bytes
}

const xxteaFixKey = (key: Uint8Array): Uint32Array => {
  const fixed = new Uint8Array(16)
  fixed.set(key.subarray(0, 16))
  return xxteaToUint32Array(fixed, false)
}

const xxteaEncryptArray = (data: Uint32Array, key: Uint32Array): Uint32Array => {
  const n = data.length - 1
  if (n < 1) return data

  let z = data[n]
  let y = data[0]
  let sum = 0
  const delta = 0x9e3779b9
  let q = Math.floor(6 + 52 / (n + 1))

  while (q-- > 0) {
    sum = (sum + delta) >>> 0
    const e = (sum >>> 2) & 3

    for (let p = 0; p < n; p += 1) {
      y = data[p + 1]
      const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0
      z = data[p] = (data[p] + mx) >>> 0
    }

    y = data[0]
    const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(n & 3) ^ e] ^ z))) >>> 0
    z = data[n] = (data[n] + mx) >>> 0
  }

  return data
}

const xxteaDecryptArray = (data: Uint32Array, key: Uint32Array): Uint32Array => {
  const n = data.length - 1
  if (n < 1) return data

  let z = data[n]
  let y = data[0]
  const delta = 0x9e3779b9
  let q = Math.floor(6 + 52 / (n + 1))
  let sum = (q * delta) >>> 0

  while (sum !== 0) {
    const e = (sum >>> 2) & 3
    for (let p = n; p > 0; p -= 1) {
      z = data[p - 1]
      const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0
      y = data[p] = (data[p] - mx) >>> 0
    }

    z = data[n]
    const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[e] ^ z))) >>> 0
    y = data[0] = (data[0] - mx) >>> 0
    sum = (sum - delta) >>> 0
  }

  return data
}

export const xxteaEncrypt = (
  text: string,
  key: string,
  outputFormat: string = 'Base64'
): string => {
  try {
    const data = xxteaToUint32Array(new TextEncoder().encode(text), true)
    const encrypted = xxteaEncryptArray(data, xxteaFixKey(new TextEncoder().encode(key)))
    const bytes = xxteaToBytes(encrypted, false)
    return outputFormat === 'Hex'
      ? bytesToHex(bytes)
      : Buffer.from(bytes).toString('base64')
  } catch (e) {
    console.error('XXTEA encrypt error:', e)
    return ''
  }
}

export const xxteaDecrypt = (
  ciphertext: string,
  key: string,
  inputFormat: string = 'Base64'
): string => {
  try {
    const bytes = inputFormat === 'Hex'
      ? hexToBytes(ciphertext)
      : new Uint8Array(Buffer.from(ciphertext, 'base64'))
    const data = xxteaToUint32Array(bytes, false)
    const decrypted = xxteaDecryptArray(data, xxteaFixKey(new TextEncoder().encode(key)))
    return new TextDecoder().decode(xxteaToBytes(decrypted, true))
  } catch (e) {
    console.error('XXTEA decrypt error:', e)
    return ''
  }
}

const teaPad = (bytes: Uint8Array): Uint8Array => {
  const blockSize = 8
  const padding = blockSize - (bytes.length % blockSize || blockSize)
  const result = new Uint8Array(bytes.length + padding)
  result.set(bytes)
  result.fill(padding, bytes.length)
  return result
}

const teaUnpad = (bytes: Uint8Array): Uint8Array => {
  if (!bytes.length) return bytes
  const padding = bytes[bytes.length - 1]
  if (padding <= 0 || padding > 8) return bytes
  return bytes.slice(0, bytes.length - padding)
}

const teaKeyWords = (key: string): Uint32Array => {
  const keyBytes = new Uint8Array(16)
  keyBytes.set(new TextEncoder().encode(key).slice(0, 16))
  const words = new Uint32Array(4)
  for (let i = 0; i < 4; i += 1) {
    words[i] =
      ((keyBytes[i * 4] << 24) >>> 0) |
      ((keyBytes[i * 4 + 1] << 16) >>> 0) |
      ((keyBytes[i * 4 + 2] << 8) >>> 0) |
      (keyBytes[i * 4 + 3] >>> 0)
  }
  return words
}

const teaOutput = (bytes: Uint8Array, format: string): string => {
  return format === 'Hex' ? bytesToHex(bytes) : Buffer.from(bytes).toString('base64')
}

const teaInput = (ciphertext: string, format: string): Uint8Array => {
  return format === 'Hex'
    ? hexToBytes(ciphertext)
    : new Uint8Array(Buffer.from(ciphertext, 'base64'))
}

export const teaEncrypt = (text: string, key: string, outputFormat: string = 'Base64'): string => {
  try {
    const keyWords = teaKeyWords(key)
    const data = teaPad(new TextEncoder().encode(text))
    const out = new Uint8Array(data.length)
    const delta = 0x9e3779b9

    for (let offset = 0; offset < data.length; offset += 8) {
      let v0 =
        ((data[offset] << 24) >>> 0) |
        ((data[offset + 1] << 16) >>> 0) |
        ((data[offset + 2] << 8) >>> 0) |
        data[offset + 3]
      let v1 =
        ((data[offset + 4] << 24) >>> 0) |
        ((data[offset + 5] << 16) >>> 0) |
        ((data[offset + 6] << 8) >>> 0) |
        data[offset + 7]
      let sum = 0

      for (let i = 0; i < 32; i += 1) {
        sum = (sum + delta) >>> 0
        v0 = (v0 + ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0
        v1 = (v1 + ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0
      }

      out[offset] = (v0 >>> 24) & 0xff
      out[offset + 1] = (v0 >>> 16) & 0xff
      out[offset + 2] = (v0 >>> 8) & 0xff
      out[offset + 3] = v0 & 0xff
      out[offset + 4] = (v1 >>> 24) & 0xff
      out[offset + 5] = (v1 >>> 16) & 0xff
      out[offset + 6] = (v1 >>> 8) & 0xff
      out[offset + 7] = v1 & 0xff
    }

    return teaOutput(out, outputFormat)
  } catch (e) {
    console.error('TEA encrypt error:', e)
    return ''
  }
}

export const teaDecrypt = (ciphertext: string, key: string, inputFormat: string = 'Base64'): string => {
  try {
    const keyWords = teaKeyWords(key)
    const data = teaInput(ciphertext, inputFormat)
    const out = new Uint8Array(data.length)
    const delta = 0x9e3779b9

    for (let offset = 0; offset < data.length; offset += 8) {
      let v0 =
        ((data[offset] << 24) >>> 0) |
        ((data[offset + 1] << 16) >>> 0) |
        ((data[offset + 2] << 8) >>> 0) |
        data[offset + 3]
      let v1 =
        ((data[offset + 4] << 24) >>> 0) |
        ((data[offset + 5] << 16) >>> 0) |
        ((data[offset + 6] << 8) >>> 0) |
        data[offset + 7]
      let sum = (delta * 32) >>> 0

      for (let i = 0; i < 32; i += 1) {
        v1 = (v1 - ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0
        v0 = (v0 - ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0
        sum = (sum - delta) >>> 0
      }

      out[offset] = (v0 >>> 24) & 0xff
      out[offset + 1] = (v0 >>> 16) & 0xff
      out[offset + 2] = (v0 >>> 8) & 0xff
      out[offset + 3] = v0 & 0xff
      out[offset + 4] = (v1 >>> 24) & 0xff
      out[offset + 5] = (v1 >>> 16) & 0xff
      out[offset + 6] = (v1 >>> 8) & 0xff
      out[offset + 7] = v1 & 0xff
    }

    return new TextDecoder().decode(teaUnpad(out))
  } catch (e) {
    console.error('TEA decrypt error:', e)
    return ''
  }
}

export const xteaEncrypt = (text: string, key: string, outputFormat: string = 'Base64'): string => {
  try {
    const keyWords = teaKeyWords(key)
    const data = teaPad(new TextEncoder().encode(text))
    const out = new Uint8Array(data.length)
    const delta = 0x9e3779b9

    for (let offset = 0; offset < data.length; offset += 8) {
      let v0 =
        ((data[offset] << 24) >>> 0) |
        ((data[offset + 1] << 16) >>> 0) |
        ((data[offset + 2] << 8) >>> 0) |
        data[offset + 3]
      let v1 =
        ((data[offset + 4] << 24) >>> 0) |
        ((data[offset + 5] << 16) >>> 0) |
        ((data[offset + 6] << 8) >>> 0) |
        data[offset + 7]
      let sum = 0

      for (let i = 0; i < 32; i += 1) {
        v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + keyWords[sum & 3]))) >>> 0
        sum = (sum + delta) >>> 0
        v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + keyWords[(sum >>> 11) & 3]))) >>> 0
      }

      out[offset] = (v0 >>> 24) & 0xff
      out[offset + 1] = (v0 >>> 16) & 0xff
      out[offset + 2] = (v0 >>> 8) & 0xff
      out[offset + 3] = v0 & 0xff
      out[offset + 4] = (v1 >>> 24) & 0xff
      out[offset + 5] = (v1 >>> 16) & 0xff
      out[offset + 6] = (v1 >>> 8) & 0xff
      out[offset + 7] = v1 & 0xff
    }

    return teaOutput(out, outputFormat)
  } catch (e) {
    console.error('XTEA encrypt error:', e)
    return ''
  }
}

export const xteaDecrypt = (ciphertext: string, key: string, inputFormat: string = 'Base64'): string => {
  try {
    const keyWords = teaKeyWords(key)
    const data = teaInput(ciphertext, inputFormat)
    const out = new Uint8Array(data.length)
    const delta = 0x9e3779b9

    for (let offset = 0; offset < data.length; offset += 8) {
      let v0 =
        ((data[offset] << 24) >>> 0) |
        ((data[offset + 1] << 16) >>> 0) |
        ((data[offset + 2] << 8) >>> 0) |
        data[offset + 3]
      let v1 =
        ((data[offset + 4] << 24) >>> 0) |
        ((data[offset + 5] << 16) >>> 0) |
        ((data[offset + 6] << 8) >>> 0) |
        data[offset + 7]
      let sum = (delta * 32) >>> 0

      for (let i = 0; i < 32; i += 1) {
        v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + keyWords[(sum >>> 11) & 3]))) >>> 0
        sum = (sum - delta) >>> 0
        v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + keyWords[sum & 3]))) >>> 0
      }

      out[offset] = (v0 >>> 24) & 0xff
      out[offset + 1] = (v0 >>> 16) & 0xff
      out[offset + 2] = (v0 >>> 8) & 0xff
      out[offset + 3] = v0 & 0xff
      out[offset + 4] = (v1 >>> 24) & 0xff
      out[offset + 5] = (v1 >>> 16) & 0xff
      out[offset + 6] = (v1 >>> 8) & 0xff
      out[offset + 7] = v1 & 0xff
    }

    return new TextDecoder().decode(teaUnpad(out))
  } catch (e) {
    console.error('XTEA decrypt error:', e)
    return ''
  }
}

// ==================== 加密货币相关 ====================
import { keccak_256, sha3_256 } from '@noble/hashes/sha3.js'
import { ripemd160 as nobleRipemd160 } from '@noble/hashes/legacy.js'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import * as secp from '@noble/secp256k1'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js'
import bs58 from 'bs58'

// 辅助函数
const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

// Keccak-256 (以太坊使用)
export const keccak256 = (text: string, inputFormat: string = 'utf8', outputFormat: string = 'Hex'): string => {
  try {
    let data: Uint8Array
    if (inputFormat === 'hex') {
      data = hexToBytes(text)
    } else {
      data = new TextEncoder().encode(text)
    }
    const hash = keccak_256(data)
    return outputFormat === 'Hex' ? bytesToHex(hash) : Buffer.from(hash).toString('base64')
  } catch (e) {
    console.error('Keccak-256 error:', e)
    return ''
  }
}

// SHA3-256
export const sha3256 = (text: string, inputFormat: string = 'utf8', outputFormat: string = 'Hex'): string => {
  try {
    let data: Uint8Array
    if (inputFormat === 'hex') {
      data = hexToBytes(text)
    } else {
      data = new TextEncoder().encode(text)
    }
    const hash = sha3_256(data)
    return outputFormat === 'Hex' ? bytesToHex(hash) : Buffer.from(hash).toString('base64')
  } catch (e) {
    console.error('SHA3-256 error:', e)
    return ''
  }
}

// Base58 编码
export const base58Encode = (text: string, inputFormat: string = 'utf8'): string => {
  try {
    let data: Uint8Array
    if (inputFormat === 'hex') {
      data = hexToBytes(text)
    } else {
      data = new TextEncoder().encode(text)
    }
    return bs58.encode(data)
  } catch (e) {
    console.error('Base58 encode error:', e)
    return ''
  }
}

// Base58 解码
export const base58Decode = (text: string, outputFormat: string = 'utf8'): string => {
  try {
    const decoded = bs58.decode(text)
    if (outputFormat === 'hex') {
      return bytesToHex(decoded)
    }
    return new TextDecoder().decode(decoded)
  } catch (e) {
    console.error('Base58 decode error:', e)
    return ''
  }
}

// Base58Check 编码 (比特币地址)
export const base58CheckEncode = (text: string, version: number = 0): string => {
  try {
    const data = hexToBytes(text)
    const versionByte = new Uint8Array([version])
    const payload = new Uint8Array(versionByte.length + data.length)
    payload.set(versionByte)
    payload.set(data, versionByte.length)
    
    // 双重SHA256取前4字节作为校验和
    const checksum = nobleSha256(nobleSha256(payload)).slice(0, 4)
    
    const result = new Uint8Array(payload.length + 4)
    result.set(payload)
    result.set(checksum, payload.length)
    
    return bs58.encode(result)
  } catch (e) {
    console.error('Base58Check encode error:', e)
    return ''
  }
}

// Base58Check 解码
export const base58CheckDecode = (text: string): { version: number; data: string; valid: boolean } => {
  try {
    const decoded = bs58.decode(text)
    if (decoded.length < 5) {
      return { version: 0, data: '', valid: false }
    }
    
    const version = decoded[0]
    const data = decoded.slice(1, -4)
    const checksum = decoded.slice(-4)
    
    // 验证校验和
    const payload = decoded.slice(0, -4)
    const expectedChecksum = nobleSha256(nobleSha256(payload)).slice(0, 4)
    
    const valid = checksum.every((b, i) => b === expectedChecksum[i])
    
    return {
      version,
      data: bytesToHex(data),
      valid
    }
  } catch (e) {
    console.error('Base58Check decode error:', e)
    return { version: 0, data: '', valid: false }
  }
}

// secp256k1 密钥对生成
export interface Secp256k1KeyPair {
  privateKey: string
  publicKey: string
  publicKeyCompressed: string
}

export const generateSecp256k1KeyPair = (): Secp256k1KeyPair => {
  const privateKey = secp.utils.randomSecretKey()
  const publicKey = secp.getPublicKey(privateKey, false) // 非压缩
  const publicKeyCompressed = secp.getPublicKey(privateKey, true) // 压缩
  
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    publicKeyCompressed: bytesToHex(publicKeyCompressed)
  }
}

// secp256k1 签名
export const secp256k1Sign = async (message: string, privateKeyHex: string, outputFormat: string = 'Hex'): Promise<string> => {
  try {
    const msgHash = keccak_256(new TextEncoder().encode(message))
    const privateKey = hexToBytes(privateKeyHex)
    const signature = await secp.signAsync(msgHash, privateKey, { prehash: false })
    return outputFormat === 'Hex' ? bytesToHex(signature) : Buffer.from(signature).toString('base64')
  } catch (e) {
    console.error('secp256k1 sign error:', e)
    return ''
  }
}

// secp256k1 验签
export const secp256k1Verify = async (message: string, signatureHex: string, publicKeyHex: string): Promise<boolean> => {
  try {
    const msgHash = keccak_256(new TextEncoder().encode(message))
    const signature = hexToBytes(signatureHex)
    const publicKey = hexToBytes(publicKeyHex)
    return secp.verify(signature, msgHash, publicKey, { prehash: false })
  } catch (e) {
    console.error('secp256k1 verify error:', e)
    return false
  }
}

// 从私钥派生公钥
export const derivePublicKey = (privateKeyHex: string, compressed: boolean = true): string => {
  try {
    const privateKey = hexToBytes(privateKeyHex)
    const publicKey = secp.getPublicKey(privateKey, compressed)
    return bytesToHex(publicKey)
  } catch (e) {
    console.error('Derive public key error:', e)
    return ''
  }
}

// 生成以太坊地址
export const generateEthAddress = (publicKeyHex: string): string => {
  try {
    let pubKey = hexToBytes(publicKeyHex)
    // 如果是非压缩公钥(65字节)，去掉前缀04
    if (pubKey.length === 65) {
      pubKey = pubKey.slice(1)
    }
    const hash = keccak_256(pubKey)
    // 取后20字节
    const address = hash.slice(-20)
    return '0x' + bytesToHex(address)
  } catch (e) {
    console.error('Generate ETH address error:', e)
    return ''
  }
}

// 生成比特币地址 (P2PKH)
export const generateBtcAddress = (publicKeyHex: string, network: 'mainnet' | 'testnet' = 'mainnet'): string => {
  try {
    const pubKey = hexToBytes(publicKeyHex)
    // SHA256 + RIPEMD160
    const sha256Hash = nobleSha256(pubKey)
    const ripemd160Hash = nobleRipemd160(sha256Hash)
    
    // 版本前缀: mainnet=0x00, testnet=0x6f
    const version = network === 'mainnet' ? 0x00 : 0x6f
    
    return base58CheckEncode(bytesToHex(ripemd160Hash), version)
  } catch (e) {
    console.error('Generate BTC address error:', e)
    return ''
  }
}

// BIP39 助记词生成
export const generateMnemonicWords = (strength: 12 | 15 | 18 | 21 | 24 = 12, _lang: string = 'english'): string => {
  try {
    // 目前只支持英文，中文需要额外导入
    // strength: 12=128bits, 15=160bits, 18=192bits, 21=224bits, 24=256bits
    const bits = strength === 12 ? 128 : strength === 15 ? 160 : strength === 18 ? 192 : strength === 21 ? 224 : 256
    return generateMnemonic(englishWordlist, bits)
  } catch (e) {
    console.error('Generate mnemonic error:', e)
    return ''
  }
}

// BIP39 助记词验证
export const validateMnemonicWords = (mnemonic: string, _lang: string = 'english'): boolean => {
  try {
    return validateMnemonic(mnemonic, englishWordlist)
  } catch (e) {
    console.error('Validate mnemonic error:', e)
    return false
  }
}

// BIP39 助记词转种子
export const mnemonicToSeed = (mnemonic: string, passphrase: string = ''): string => {
  try {
    const seed = mnemonicToSeedSync(mnemonic, passphrase)
    return bytesToHex(seed)
  } catch (e) {
    console.error('Mnemonic to seed error:', e)
    return ''
  }
}

// 从种子派生主私钥 (简化版BIP32)
export const seedToMasterKey = (seedHex: string): { privateKey: string; chainCode: string } => {
  try {
    // 使用 CryptoJS 的 HMAC-SHA512
    const hmac = CryptoJS.HmacSHA512(
      CryptoJS.enc.Hex.parse(seedHex),
      CryptoJS.enc.Utf8.parse('Bitcoin seed')
    )
    const result = hmac.toString(CryptoJS.enc.Hex)
    
    return {
      privateKey: result.slice(0, 64),
      chainCode: result.slice(64)
    }
  } catch (e) {
    console.error('Seed to master key error:', e)
    return { privateKey: '', chainCode: '' }
  }
}

// ==================== 更多加密货币功能 ====================
import * as ed25519 from '@noble/ed25519'
import { bech32, bech32m } from 'bech32'

// Ed25519 密钥对生成
export interface Ed25519KeyPair {
  privateKey: string
  publicKey: string
}

export const generateEd25519KeyPair = async (): Promise<Ed25519KeyPair> => {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = await ed25519.getPublicKeyAsync(privateKey)
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey)
  }
}

// Ed25519 签名
export const ed25519Sign = async (message: string, privateKeyHex: string): Promise<string> => {
  try {
    const privateKey = hexToBytes(privateKeyHex)
    const msgBytes = new TextEncoder().encode(message)
    const signature = await ed25519.signAsync(msgBytes, privateKey)
    return bytesToHex(signature)
  } catch (e) {
    console.error('Ed25519 sign error:', e)
    return ''
  }
}

// Ed25519 验签
export const ed25519Verify = async (message: string, signatureHex: string, publicKeyHex: string): Promise<boolean> => {
  try {
    const signature = hexToBytes(signatureHex)
    const publicKey = hexToBytes(publicKeyHex)
    const msgBytes = new TextEncoder().encode(message)
    return await ed25519.verifyAsync(signature, msgBytes, publicKey)
  } catch (e) {
    console.error('Ed25519 verify error:', e)
    return false
  }
}

// Bech32 编码 (BTC SegWit地址)
export const bech32Encode = (hrp: string, data: string, version: number = 0): string => {
  try {
    const dataBytes = hexToBytes(data)
    const words = bech32.toWords(dataBytes)
    words.unshift(version)
    return bech32.encode(hrp, words)
  } catch (e) {
    console.error('Bech32 encode error:', e)
    return ''
  }
}

// Bech32 解码
export const bech32Decode = (address: string): { hrp: string; version: number; data: string } => {
  try {
    const decoded = bech32.decode(address)
    const version = decoded.words[0]
    const data = bech32.fromWords(decoded.words.slice(1))
    return {
      hrp: decoded.prefix,
      version,
      data: bytesToHex(new Uint8Array(data))
    }
  } catch (e) {
    console.error('Bech32 decode error:', e)
    return { hrp: '', version: 0, data: '' }
  }
}

// Bech32m 编码 (BTC Taproot地址)
export const bech32mEncode = (hrp: string, data: string, version: number = 1): string => {
  try {
    const dataBytes = hexToBytes(data)
    const words = bech32m.toWords(dataBytes)
    words.unshift(version)
    return bech32m.encode(hrp, words)
  } catch (e) {
    console.error('Bech32m encode error:', e)
    return ''
  }
}

// Bech32m 解码
export const bech32mDecode = (address: string): { hrp: string; version: number; data: string } => {
  try {
    const decoded = bech32m.decode(address)
    const version = decoded.words[0]
    const data = bech32m.fromWords(decoded.words.slice(1))
    return {
      hrp: decoded.prefix,
      version,
      data: bytesToHex(new Uint8Array(data))
    }
  } catch (e) {
    console.error('Bech32m decode error:', e)
    return { hrp: '', version: 0, data: '' }
  }
}

// 私钥格式转换: Hex -> WIF
export const hexToWif = (hexKey: string, compressed: boolean = true, mainnet: boolean = true): string => {
  try {
    const prefix = mainnet ? 0x80 : 0xef
    let payload = bytesToHex(new Uint8Array([prefix])) + hexKey
    if (compressed) {
      payload += '01'
    }
    return base58CheckEncode(payload.slice(2), prefix)
  } catch (e) {
    console.error('Hex to WIF error:', e)
    return ''
  }
}

// 私钥格式转换: WIF -> Hex
export const wifToHex = (wif: string): { hex: string; compressed: boolean; mainnet: boolean } => {
  try {
    const decoded = base58CheckDecode(wif)
    if (!decoded.valid) {
      return { hex: '', compressed: false, mainnet: false }
    }
    const mainnet = decoded.version === 0x80
    const data = decoded.data
    const compressed = data.length === 66 && data.endsWith('01')
    const hex = compressed ? data.slice(0, 64) : data
    return { hex, compressed, mainnet }
  } catch (e) {
    console.error('WIF to Hex error:', e)
    return { hex: '', compressed: false, mainnet: false }
  }
}

// 验证ETH地址
export const validateEthAddress = (address: string): boolean => {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return false
  }
  // 如果全小写或全大写，直接返回true
  const addr = address.slice(2)
  if (addr === addr.toLowerCase() || addr === addr.toUpperCase()) {
    return true
  }
  // EIP-55 校验和验证
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(addr.toLowerCase())))
  for (let i = 0; i < 40; i++) {
    const char = addr[i]
    const hashChar = parseInt(hash[i], 16)
    if (hashChar >= 8 && char !== char.toUpperCase()) {
      return false
    }
    if (hashChar < 8 && char !== char.toLowerCase()) {
      return false
    }
  }
  return true
}

// 验证BTC地址
export const validateBtcAddress = (address: string): { valid: boolean; type: string } => {
  try {
    // P2PKH (1开头) 或 P2SH (3开头)
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
      const decoded = base58CheckDecode(address)
      if (decoded.valid) {
        const type = decoded.version === 0x00 ? 'P2PKH' : decoded.version === 0x05 ? 'P2SH' : 'Unknown'
        return { valid: true, type }
      }
    }
    // Bech32 (bc1开头)
    if (/^bc1[a-z0-9]{39,59}$/i.test(address)) {
      try {
        const decoded = bech32.decode(address)
        if (decoded.words[0] === 0) {
          return { valid: true, type: 'P2WPKH/P2WSH' }
        }
      } catch {
        // 尝试 bech32m
        const decoded = bech32m.decode(address)
        if (decoded.words[0] === 1) {
          return { valid: true, type: 'P2TR (Taproot)' }
        }
      }
    }
    return { valid: false, type: 'Invalid' }
  } catch (e) {
    return { valid: false, type: 'Invalid' }
  }
}

// 生成BTC SegWit地址 (P2WPKH)
export const generateBtcSegwitAddress = (publicKeyHex: string, mainnet: boolean = true): string => {
  try {
    const pubKey = hexToBytes(publicKeyHex)
    const sha256Hash = nobleSha256(pubKey)
    const ripemd160Hash = nobleRipemd160(sha256Hash)
    const hrp = mainnet ? 'bc' : 'tb'
    return bech32Encode(hrp, bytesToHex(ripemd160Hash), 0)
  } catch (e) {
    console.error('Generate BTC SegWit address error:', e)
    return ''
  }
}

// Schnorr 签名 (BTC Taproot)
export const schnorrSign = async (message: string, privateKeyHex: string): Promise<string> => {
  try {
    const msgHash = nobleSha256(new TextEncoder().encode(message))
    const privateKey = hexToBytes(privateKeyHex)
    const signature = secp.schnorr.sign(msgHash, privateKey)
    return bytesToHex(signature)
  } catch (e) {
    console.error('Schnorr sign error:', e)
    return ''
  }
}

// Schnorr 验签
export const schnorrVerify = (message: string, signatureHex: string, publicKeyHex: string): boolean => {
  try {
    const msgHash = nobleSha256(new TextEncoder().encode(message))
    const signature = hexToBytes(signatureHex)
    const publicKey = hexToBytes(publicKeyHex)
    return secp.schnorr.verify(signature, msgHash, publicKey)
  } catch (e) {
    console.error('Schnorr verify error:', e)
    return false
  }
}

// 获取Schnorr公钥 (x-only, 32字节)
export const getSchnorrPublicKey = (privateKeyHex: string): string => {
  try {
    const privateKey = hexToBytes(privateKeyHex)
    const publicKey = secp.schnorr.getPublicKey(privateKey)
    return bytesToHex(publicKey)
  } catch (e) {
    console.error('Get Schnorr public key error:', e)
    return ''
  }
}

// EIP-55 校验和地址
export const toChecksumAddress = (address: string): string => {
  try {
    const addr = address.toLowerCase().replace('0x', '')
    const hash = bytesToHex(keccak_256(new TextEncoder().encode(addr)))
    let checksumAddress = '0x'
    for (let i = 0; i < 40; i++) {
      checksumAddress += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i]
    }
    return checksumAddress
  } catch (e) {
    console.error('To checksum address error:', e)
    return ''
  }
}

// ==================== 消息签名 ====================

// ETH 消息哈希 (EIP-191)
export const ethMessageHash = (message: string): Uint8Array => {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`
  const prefixedMessage = prefix + message
  return keccak_256(new TextEncoder().encode(prefixedMessage))
}

// ETH 消息签名 (EIP-191 personal_sign) - 简化版，不含恢复ID
export const ethSignMessage = async (
  message: string,
  privateKeyHex: string
): Promise<{ signature: string; r: string; s: string; msgHash: string }> => {
  try {
    const msgHash = ethMessageHash(message)
    const privateKey = hexToBytes(privateKeyHex)
    const sigBytes = await secp.signAsync(msgHash, privateKey, { lowS: true })
    
    // sigBytes 是 64 字节的紧凑签名 (r + s)
    const r = bytesToHex(sigBytes.slice(0, 32))
    const s = bytesToHex(sigBytes.slice(32, 64))
    
    // 计算 v 值 (简化：使用 27，实际应该通过恢复测试确定)
    const v = 27
    
    return {
      signature: '0x' + r + s + v.toString(16).padStart(2, '0'),
      r: '0x' + r,
      s: '0x' + s,
      msgHash: '0x' + bytesToHex(msgHash)
    }
  } catch (e) {
    console.error('ETH sign message error:', e)
    return { signature: '', r: '', s: '', msgHash: '' }
  }
}

// ETH 消息签名验证
export const ethVerifyMessage = (
  message: string,
  signature: string,
  publicKeyHex: string
): boolean => {
  try {
    const msgHash = ethMessageHash(message)
    const sig = signature.replace('0x', '')
    // 取前 64 字节 (r + s)
    const sigBytes = hexToBytes(sig.slice(0, 128))
    const publicKey = hexToBytes(publicKeyHex)
    return secp.verify(sigBytes, msgHash, publicKey)
  } catch (e) {
    console.error('ETH verify message error:', e)
    return false
  }
}

// 从私钥生成ETH地址
export const privateKeyToEthAddress = (privateKeyHex: string): string => {
  try {
    const privateKey = hexToBytes(privateKeyHex)
    const publicKey = secp.getPublicKey(privateKey, false)
    return generateEthAddress(bytesToHex(publicKey))
  } catch (e) {
    console.error('Private key to ETH address error:', e)
    return ''
  }
}

// BTC 消息哈希 (双重SHA256)
export const btcMessageHash = (message: string): Uint8Array => {
  const prefix = '\x18Bitcoin Signed Message:\n'
  const msgLen = message.length
  // VarInt 编码
  let varInt: number[]
  if (msgLen < 253) {
    varInt = [msgLen]
  } else if (msgLen < 0x10000) {
    varInt = [253, msgLen & 0xff, (msgLen >> 8) & 0xff]
  } else {
    varInt = [254, msgLen & 0xff, (msgLen >> 8) & 0xff, (msgLen >> 16) & 0xff, (msgLen >> 24) & 0xff]
  }
  
  const prefixBytes = new TextEncoder().encode(prefix)
  const msgBytes = new TextEncoder().encode(message)
  const fullMsg = new Uint8Array(prefixBytes.length + varInt.length + msgBytes.length)
  fullMsg.set(prefixBytes, 0)
  fullMsg.set(varInt, prefixBytes.length)
  fullMsg.set(msgBytes, prefixBytes.length + varInt.length)
  
  // 双重 SHA256
  return nobleSha256(nobleSha256(fullMsg))
}

// BTC 消息签名
export const btcSignMessage = async (
  message: string,
  privateKeyHex: string
): Promise<{ signature: string; msgHash: string }> => {
  try {
    const msgHash = btcMessageHash(message)
    const privateKey = hexToBytes(privateKeyHex)
    const sigBytes = await secp.signAsync(msgHash, privateKey, { lowS: true })
    
    // 构建 65 字节签名: header(1) + r(32) + s(32)
    // header = 27 + 4 (compressed) = 31
    const header = 31
    const fullSig = new Uint8Array(65)
    fullSig[0] = header
    fullSig.set(sigBytes.slice(0, 32), 1)  // r
    fullSig.set(sigBytes.slice(32, 64), 33) // s
    
    return {
      signature: Buffer.from(fullSig).toString('base64'),
      msgHash: bytesToHex(msgHash)
    }
  } catch (e) {
    console.error('BTC sign message error:', e)
    return { signature: '', msgHash: '' }
  }
}

// BTC 消息签名验证
export const btcVerifyMessage = (
  message: string,
  signature: string,
  publicKeyHex: string
): boolean => {
  try {
    const msgHash = btcMessageHash(message)
    const sigBytes = Buffer.from(signature, 'base64')
    if (sigBytes.length !== 65) return false
    
    // 提取 r 和 s
    const rs = new Uint8Array(64)
    rs.set(sigBytes.slice(1, 33), 0)  // r
    rs.set(sigBytes.slice(33, 65), 32) // s
    
    const publicKey = hexToBytes(publicKeyHex)
    return secp.verify(rs, msgHash, publicKey)
  } catch (e) {
    console.error('BTC verify message error:', e)
    return false
  }
}

// 从私钥生成BTC地址
export const privateKeyToBtcAddress = (privateKeyHex: string, mainnet: boolean = true): { legacy: string; segwit: string } => {
  try {
    const privateKey = hexToBytes(privateKeyHex)
    const publicKey = secp.getPublicKey(privateKey, true) // 压缩公钥
    const legacy = generateBtcAddress(bytesToHex(publicKey), mainnet ? 'mainnet' : 'testnet')
    const segwit = generateBtcSegwitAddress(bytesToHex(publicKey), mainnet)
    return { legacy, segwit }
  } catch (e) {
    console.error('Private key to BTC address error:', e)
    return { legacy: '', segwit: '' }
  }
}


// ==================== 国密算法 ====================

// SM3 哈希
export const sm3Hash = (text: string, outputFormat: string = 'Hex'): string => {
  try {
    const hash = sm3(text)
    if (outputFormat === 'Base64') {
      // Hex to Base64
      const bytes = []
      for (let i = 0; i < hash.length; i += 2) {
        bytes.push(parseInt(hash.substr(i, 2), 16))
      }
      return btoa(String.fromCharCode(...bytes))
    }
    return hash
  } catch (e) {
    console.error('SM3 hash error:', e)
    return ''
  }
}

// SM2 密钥对生成
export interface SM2KeyPair {
  publicKey: string
  privateKey: string
}

export const generateSM2KeyPair = (): SM2KeyPair => {
  const keypair = sm2.generateKeyPairHex()
  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
  }
}

const normalizeSm4Hex = (value: string, label: string): string => {
  const clean = (value || '').replace(/\s+/g, '')
  if (/^[0-9a-fA-F]{32}$/.test(clean)) {
    return clean.toLowerCase()
  }

  const bytes = new TextEncoder().encode(String(value || ''))
  if (bytes.length !== 16) {
    throw new Error(`${label} must be 16-byte UTF-8 text or 32-character hex`)
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// SM2 加密
export const sm2Encrypt = (
  text: string,
  publicKey: string,
  cipherMode: 0 | 1 = 1 // 0: C1C2C3, 1: C1C3C2
): string => {
  try {
    const encrypted = sm2.doEncrypt(text, publicKey, cipherMode)
    return encrypted
  } catch (e) {
    console.error('SM2 encrypt error:', e)
    return ''
  }
}

// SM2 解密
export const sm2Decrypt = (
  ciphertext: string,
  privateKey: string,
  cipherMode: 0 | 1 = 1
): string => {
  try {
    const decrypted = sm2.doDecrypt(ciphertext, privateKey, cipherMode)
    return decrypted
  } catch (e) {
    console.error('SM2 decrypt error:', e)
    return ''
  }
}

// SM2 签名
export const sm2Sign = (
  text: string,
  privateKey: string,
  userId: string = '1234567812345678'
): string => {
  try {
    const signature = sm2.doSignature(text, privateKey, {
      userId,
      der: true,
    })
    return signature
  } catch (e) {
    console.error('SM2 sign error:', e)
    return ''
  }
}

// SM2 验签
export const sm2Verify = (
  text: string,
  signature: string,
  publicKey: string,
  userId: string = '1234567812345678'
): boolean => {
  try {
    return sm2.doVerifySignature(text, signature, publicKey, {
      userId,
      der: true,
    })
  } catch (e) {
    console.error('SM2 verify error:', e)
    return false
  }
}

// SM4 加密
export const sm4Encrypt = (
  text: string,
  key: string,
  mode: 'ecb' | 'cbc' = 'ecb',
  iv?: string,
  outputFormat: string = 'Hex'
): string => {
  try {
    const normalizedKey = normalizeSm4Hex(key, 'SM4 key')
    const normalizedIv = mode === 'cbc' ? normalizeSm4Hex(iv || '', 'SM4 iv') : undefined
    let encrypted: string
    if (mode === 'cbc' && normalizedIv) {
      encrypted = sm4.encrypt(text, normalizedKey, { mode: 'cbc', iv: normalizedIv })
    } else {
      encrypted = sm4.encrypt(text, normalizedKey)
    }
    
    if (outputFormat === 'Base64' && typeof encrypted === 'string') {
      // Hex to Base64
      const bytes = []
      for (let i = 0; i < encrypted.length; i += 2) {
        bytes.push(parseInt(encrypted.substr(i, 2), 16))
      }
      return btoa(String.fromCharCode(...bytes))
    }
    return encrypted
  } catch (e) {
    console.error('SM4 encrypt error:', e)
    return ''
  }
}

// SM4 解密
export const sm4Decrypt = (
  ciphertext: string,
  key: string,
  mode: 'ecb' | 'cbc' = 'ecb',
  iv?: string,
  inputFormat: string = 'Hex'
): string => {
  try {
    const normalizedKey = normalizeSm4Hex(key, 'SM4 key')
    const normalizedIv = mode === 'cbc' ? normalizeSm4Hex(iv || '', 'SM4 iv') : undefined
    let input = ciphertext
    if (inputFormat === 'Base64') {
      // Base64 to Hex
      const decoded = atob(ciphertext)
      input = Array.from(decoded)
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    }
    
    if (mode === 'cbc' && normalizedIv) {
      return sm4.decrypt(input, normalizedKey, { mode: 'cbc', iv: normalizedIv })
    }
    return sm4.decrypt(input, normalizedKey)
  } catch (e) {
    console.error('SM4 decrypt error:', e)
    return ''
  }
}

// ==================== Protobuf 解析 ====================

// 解析未知 Protobuf 数据（无 schema）
export const parseProtobufRaw = (hexOrBase64: string, isBase64: boolean = false): Record<string, unknown> => {
  try {
    let bytes: Uint8Array
    if (isBase64) {
      const decoded = atob(hexOrBase64)
      bytes = new Uint8Array(decoded.length)
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i)
      }
    } else {
      // Hex
      const hex = hexOrBase64.replace(/\s/g, '')
      bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
      }
    }
    
    return decodeProtobufMessage(bytes, 0, bytes.length)
  } catch (e) {
    console.error('Protobuf parse error:', e)
    return { error: String(e) }
  }
}

// 解码 Protobuf 消息
function decodeProtobufMessage(bytes: Uint8Array, start: number, end: number): Record<string, unknown> {
  const result: Record<string, unknown[]> = {}
  let pos = start
  
  while (pos < end) {
    const [tag, newPos] = readVarint(bytes, pos)
    pos = newPos
    
    const fieldNumber = Number(tag >> 3n)
    const wireType = Number(tag & 0x7n)
    
    let value: unknown
    
    switch (wireType) {
      case 0: // Varint
        const [varint, nextPos] = readVarint(bytes, pos)
        pos = nextPos
        value = varint
        break
      case 1: // 64-bit
        value = readFixed64(bytes, pos)
        pos += 8
        break
      case 2: // Length-delimited
        const [length, lenPos] = readVarint(bytes, pos)
        pos = lenPos
        const data = bytes.slice(pos, pos + Number(length))
        pos += Number(length)
        // 尝试解析为嵌套消息或字符串
        value = tryParseNestedOrString(data)
        break
      case 5: // 32-bit
        value = readFixed32(bytes, pos)
        pos += 4
        break
      default:
        throw new Error(`Unknown wire type: ${wireType}`)
    }
    
    const key = `field_${fieldNumber}`
    if (!result[key]) {
      result[key] = []
    }
    result[key].push(value)
  }
  
  // 简化单值字段
  const simplified: Record<string, unknown> = {}
  for (const [key, values] of Object.entries(result)) {
    simplified[key] = values.length === 1 ? values[0] : values
  }
  
  return simplified
}

// 读取 Varint
function readVarint(bytes: Uint8Array, pos: number): [bigint, number] {
  let result = 0n
  let shift = 0n
  let byte: number
  
  do {
    byte = bytes[pos++]
    result |= BigInt(byte & 0x7f) << shift
    shift += 7n
  } while (byte & 0x80)
  
  return [result, pos]
}

// 读取 32 位定长
function readFixed32(bytes: Uint8Array, pos: number): number {
  return (
    bytes[pos] |
    (bytes[pos + 1] << 8) |
    (bytes[pos + 2] << 16) |
    (bytes[pos + 3] << 24)
  ) >>> 0
}

// 读取 64 位定长
function readFixed64(bytes: Uint8Array, pos: number): string {
  const low = readFixed32(bytes, pos)
  const high = readFixed32(bytes, pos + 4)
  return `0x${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`
}

// 尝试解析为嵌套消息或字符串
function tryParseNestedOrString(data: Uint8Array): unknown {
  // 尝试解析为 UTF-8 字符串
  try {
    const str = new TextDecoder('utf-8', { fatal: true }).decode(data)
    // 检查是否是可打印字符串
    if (/^[\x20-\x7E\u4e00-\u9fa5\s]+$/.test(str)) {
      return str
    }
  } catch {
    // 不是有效的 UTF-8
  }
  
  // 尝试解析为嵌套消息
  try {
    const nested = decodeProtobufMessage(data, 0, data.length)
    if (Object.keys(nested).length > 0) {
      return nested
    }
  } catch {
    // 不是有效的 Protobuf 消息
  }
  
  // 返回 Hex 字符串
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 将对象编码为 Protobuf（简单实现）
export const encodeProtobufSimple = (obj: Record<string, unknown>): string => {
  try {
    const bytes: number[] = []
    
    for (const [key, value] of Object.entries(obj)) {
      const match = key.match(/^field_(\d+)$/)
      if (!match) continue
      
      const fieldNumber = parseInt(match[1])
      const values = Array.isArray(value) ? value : [value]
      
      for (const v of values) {
        if (typeof v === 'number' || typeof v === 'bigint') {
          // Varint
          const tag = (fieldNumber << 3) | 0
          bytes.push(...encodeVarint(BigInt(tag)))
          bytes.push(...encodeVarint(BigInt(v)))
        } else if (typeof v === 'string') {
          // Length-delimited
          const tag = (fieldNumber << 3) | 2
          bytes.push(...encodeVarint(BigInt(tag)))
          const strBytes = new TextEncoder().encode(v)
          bytes.push(...encodeVarint(BigInt(strBytes.length)))
          bytes.push(...strBytes)
        }
      }
    }
    
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch (e) {
    console.error('Protobuf encode error:', e)
    return ''
  }
}

// 编码 Varint
function encodeVarint(value: bigint): number[] {
  const bytes: number[] = []
  while (value > 127n) {
    bytes.push(Number(value & 0x7fn) | 0x80)
    value >>= 7n
  }
  bytes.push(Number(value))
  return bytes
}

// ==================== XOR 链式加密 ====================

// XOR 链式加密
export const xorChainEncrypt = (text: string, initialKey: number = 0): string => {
  try {
    const bytes = new TextEncoder().encode(text)
    const encrypted: number[] = []
    let key = initialKey
    
    for (let i = 0; i < bytes.length; i++) {
      const encryptedByte = bytes[i] ^ key
      encrypted.push(encryptedByte)
      key = encryptedByte // 密钥更新为当前加密字节
    }
    
    // 转为 Base64
    const uint8Array = new Uint8Array(encrypted)
    return CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.create(uint8Array as any))
  } catch (e) {
    console.error('XOR chain encrypt error:', e)
    return ''
  }
}

// XOR 链式解密
export const xorChainDecrypt = (ciphertext: string, initialKey: number = 0): string => {
  try {
    // Base64 解码
    const wordArray = CryptoJS.enc.Base64.parse(ciphertext)
    const bytes: number[] = []
    for (let i = 0; i < wordArray.sigBytes; i++) {
      bytes.push((wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff)
    }
    
    // XOR 解密
    const decrypted: number[] = []
    let key = initialKey
    
    for (let i = 0; i < bytes.length; i++) {
      const decryptedByte = bytes[i] ^ key
      decrypted.push(decryptedByte)
      key = bytes[i] // 密钥更新为当前加密字节
    }
    
    // 转为字符串
    return new TextDecoder().decode(new Uint8Array(decrypted))
  } catch (e) {
    console.error('XOR chain decrypt error:', e)
    return ''
  }
}
