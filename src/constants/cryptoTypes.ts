export interface CryptoCategory {
  key: string
  label: string
  children: CryptoItem[]
}

export interface CryptoItem {
  key: string
  label: string
  needKey: boolean
  hasMultiOutput: boolean
  canDecrypt: boolean
}

export const CRYPTO_TREE: CryptoCategory[] = [
  {
    key: 'hash',
    label: '哈希',
    children: [
      { key: 'md5', label: 'MD5', needKey: false, hasMultiOutput: true, canDecrypt: false },
      { key: 'sha', label: 'SHA', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'ripemd160', label: 'RIPEMD160', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'crc32', label: 'CRC32', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'crc16', label: 'CRC16', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'adler32', label: 'Adler32', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'fnv1a', label: 'FNV1a', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'murmurhash3', label: 'MurmurHash3', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'blake2s', label: 'BLAKE2s', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'blake2b', label: 'BLAKE2b', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'blake3', label: 'BLAKE3', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'keccak256', label: 'Keccak-256', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'sha3-256', label: 'SHA3-256', needKey: false, hasMultiOutput: false, canDecrypt: false },
      { key: 'sm3', label: 'SM3', needKey: false, hasMultiOutput: false, canDecrypt: false },
    ],
  },
  {
    key: 'hmac',
    label: 'HMAC',
    children: [
      { key: 'hmac', label: 'HMAC', needKey: true, hasMultiOutput: false, canDecrypt: false },
    ],
  },
  {
    key: 'symmetric',
    label: '对称加密',
    children: [
      { key: 'aes', label: 'AES', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'aes-gcm', label: 'AES-GCM', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'tea', label: 'TEA', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'xtea', label: 'XTEA', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'des', label: 'DES', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: '3des', label: '3DES', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'rc4', label: 'RC4', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'rabbit', label: 'Rabbit', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'xxtea', label: 'XXTEA', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'sm4', label: 'SM4', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'xor-chain', label: 'XOR链式', needKey: true, hasMultiOutput: false, canDecrypt: true },
    ],
  },
  {
    key: 'asymmetric',
    label: '非对称加密',
    children: [
      { key: 'rsa', label: 'RSA', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'rsa-sign', label: 'RSA签名', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'sm2', label: 'SM2', needKey: true, hasMultiOutput: false, canDecrypt: true },
      { key: 'sm2-sign', label: 'SM2签名', needKey: true, hasMultiOutput: false, canDecrypt: true },
    ],
  },
  {
    key: 'kdf',
    label: '密钥派生',
    children: [
      { key: 'pbkdf2', label: 'PBKDF2', needKey: true, hasMultiOutput: false, canDecrypt: false },
      { key: 'evpkdf', label: 'EvpKDF', needKey: true, hasMultiOutput: false, canDecrypt: false },
      { key: 'scrypt', label: 'scrypt', needKey: true, hasMultiOutput: false, canDecrypt: false },
    ],
  },
  {
    key: 'encoding',
    label: '编码',
    children: [
      { key: 'base64', label: 'Base64', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'base64url', label: 'Base64URL', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'base58', label: 'Base58', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'base32', label: 'Base32', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'base85', label: 'Base85', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'base91', label: 'Base91', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'hex', label: 'Hex', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'url', label: 'URL', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'utf16', label: 'UTF-16', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'unicode', label: 'Unicode转义', needKey: false, hasMultiOutput: false, canDecrypt: true },
      { key: 'html', label: 'HTML实体', needKey: false, hasMultiOutput: false, canDecrypt: true },
    ],
  },
  {
    key: 'protocol',
    label: '协议解析',
    children: [
      { key: 'protobuf', label: 'Protobuf', needKey: false, hasMultiOutput: true, canDecrypt: true },
    ],
  },
]

export const SHA_TYPES = ['SHA1', 'SHA3', 'SHA224', 'SHA256', 'SHA384', 'SHA512']
export const OUTPUT_FORMATS = ['Hex', 'Base64']

export const HMAC_TYPES = [
  'HMAC-MD5',
  'HMAC-SHA1',
  'HMAC-SHA224',
  'HMAC-SHA256',
  'HMAC-SHA384',
  'HMAC-SHA512',
  'HMAC-SHA3',
  'HMAC-RIPEMD160',
]

export const CIPHER_MODES = ['CBC', 'ECB', 'CFB', 'OFB', 'CTR']
export const PADDING_TYPES = ['Pkcs7', 'ZeroPadding', 'NoPadding', 'Iso10126', 'Iso97971', 'AnsiX923']
export const ENCODING_TYPES = ['Utf8', 'Base64', 'Hex', 'Latin1', 'Utf16', 'Utf16LE', 'Utf16BE']
export const KEY_SIZES = [128, 192, 256, 384, 512]
export const RSA_KEY_SIZES = [1024, 2048, 4096]
export const RSA_SIGN_ALGORITHMS = ['SHA256', 'SHA1', 'SHA384', 'SHA512', 'MD5']
export const RSA_PADDINGS = ['OAEP', 'PKCS1v1.5']
export const MNEMONIC_LENGTHS: number[] = []
export const MNEMONIC_LANGUAGES: string[] = []
export const BTC_NETWORKS: string[] = []
export const SM4_MODES = ['ecb', 'cbc']
