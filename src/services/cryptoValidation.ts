import { Buffer } from 'buffer'
import { z } from 'zod'

type SupportedEncoding = 'Utf8' | 'Base64' | 'Hex' | 'Latin1' | 'Utf16' | 'Utf16LE' | 'Utf16BE'

export interface CryptoValidationParams {
  type: string
  isEncrypt: boolean
  input: string
  key: string
  iv: string
  mode: string
  keyEncoding: string
  ivEncoding: string
  publicKey: string
  privateKey: string
  signature: string
  userId: string
}

const SUPPORTED_ENCODINGS = new Set<SupportedEncoding>([
  'Utf8',
  'Base64',
  'Hex',
  'Latin1',
  'Utf16',
  'Utf16LE',
  'Utf16BE',
])

const PUBLIC_PEM_RE = /-----BEGIN (?:RSA )?PUBLIC KEY-----[\s\S]+-----END (?:RSA )?PUBLIC KEY-----/
const PRIVATE_PEM_RE = /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/
const SM2_PRIVATE_KEY_RE = /^[0-9a-fA-F]{64}$/
const SM2_PUBLIC_KEY_RE = /^(?:04)?[0-9a-fA-F]{128}$/

const nonEmptyString = (label: string) => z.string().trim().min(1, `${label}不能为空`)

const getEncodedByteLength = (value: string, encoding: string): number | null => {
  if (!SUPPORTED_ENCODINGS.has(encoding as SupportedEncoding)) {
    return null
  }

  const trimmed = value.trim()
  switch (encoding) {
    case 'Utf8':
      return new TextEncoder().encode(value).length
    case 'Latin1':
      return value.length
    case 'Utf16':
    case 'Utf16LE':
    case 'Utf16BE':
      return value.length * 2
    case 'Hex':
      return /^[0-9a-fA-F]*$/.test(trimmed) && trimmed.length % 2 === 0 ? trimmed.length / 2 : null
    case 'Base64':
      try {
        return Buffer.from(trimmed, 'base64').length
      } catch {
        return null
      }
    default:
      return null
  }
}

const getByteLengthError = (label: string, value: string, encoding: string, lengths: number[]): string | null => {
  if (!value.trim()) {
    return `${label}不能为空`
  }

  const byteLength = getEncodedByteLength(value, encoding)
  if (byteLength == null) {
    return `${label}格式无效，当前编码为 ${encoding}`
  }

  if (!lengths.includes(byteLength)) {
    return `${label}长度无效，需要 ${lengths.join(' / ')} 字节，当前为 ${byteLength} 字节`
  }

  return null
}

const aesLikeSchema = z.object({
  keyEncoding: z.string(),
  ivEncoding: z.string(),
  key: z.string(),
  iv: z.string(),
  mode: z.string(),
}).superRefine((value, ctx) => {
  const keyError = getByteLengthError('密钥', value.key, value.keyEncoding, [16, 24, 32])
  if (keyError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: keyError })
  }

  if (value.mode !== 'ECB') {
    const ivLength = getEncodedByteLength(value.iv, value.ivEncoding)
    if (!value.iv.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iv'], message: '向量不能为空' })
      return
    }
    if (ivLength == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iv'], message: `向量格式无效，当前编码为 ${value.ivEncoding}` })
      return
    }
    if (ivLength !== 16) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iv'], message: `向量长度无效，需要 16 字节，当前为 ${ivLength} 字节` })
    }
  }
})

const desSchema = z.object({
  keyEncoding: z.string(),
  ivEncoding: z.string(),
  key: z.string(),
  iv: z.string(),
  mode: z.string(),
}).superRefine((value, ctx) => {
  const keyError = getByteLengthError('密钥', value.key, value.keyEncoding, [8])
  if (keyError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: keyError })
  }

  if (value.mode !== 'ECB') {
    const ivLength = getEncodedByteLength(value.iv, value.ivEncoding)
    if (!value.iv.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iv'], message: '向量不能为空' })
      return
    }
    if (ivLength == null || ivLength !== 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['iv'],
        message: `向量长度无效，需要 8 字节，当前为 ${ivLength ?? 0} 字节`,
      })
    }
  }
})

const tripleDesSchema = z.object({
  keyEncoding: z.string(),
  ivEncoding: z.string(),
  key: z.string(),
  iv: z.string(),
  mode: z.string(),
}).superRefine((value, ctx) => {
  const keyError = getByteLengthError('密钥', value.key, value.keyEncoding, [16, 24])
  if (keyError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: keyError })
  }

  if (value.mode !== 'ECB') {
    const ivLength = getEncodedByteLength(value.iv, value.ivEncoding)
    if (!value.iv.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iv'], message: '向量不能为空' })
      return
    }
    if (ivLength == null || ivLength !== 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['iv'],
        message: `向量长度无效，需要 8 字节，当前为 ${ivLength ?? 0} 字节`,
      })
    }
  }
})

const aesGcmSchema = z.object({
  keyEncoding: z.string(),
  ivEncoding: z.string(),
  key: z.string(),
  iv: nonEmptyString('向量'),
}).superRefine((value, ctx) => {
  const keyError = getByteLengthError('密钥', value.key, value.keyEncoding, [16, 24, 32])
  if (keyError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: keyError })
  }
})

const sm4Schema = z.object({
  key: z.string().trim().min(1, '密钥不能为空'),
  iv: z.string(),
  mode: z.string(),
}).superRefine((value, ctx) => {
  const normalizedKey = value.key.replace(/\s+/g, '')
  const keyLooksHex = /^[0-9a-fA-F]{32}$/.test(normalizedKey)
  const keyBytes = new TextEncoder().encode(value.key).length
  if (!keyLooksHex && keyBytes !== 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['key'],
      message: 'SM4 密钥需要 16 字节文本，或 32 位十六进制字符串',
    })
  }

  if (value.mode === 'cbc') {
    const normalizedIv = value.iv.replace(/\s+/g, '')
    const ivLooksHex = /^[0-9a-fA-F]{32}$/.test(normalizedIv)
    const ivBytes = new TextEncoder().encode(value.iv).length
    if (!value.iv.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iv'], message: 'CBC 模式下向量不能为空' })
      return
    }
    if (!ivLooksHex && ivBytes !== 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['iv'],
        message: 'SM4 向量需要 16 字节文本，或 32 位十六进制字符串',
      })
    }
  }
})

const rsaEncryptSchema = z.object({
  publicKey: z.string().trim().regex(PUBLIC_PEM_RE, '请填写有效的 RSA 公钥 PEM'),
})

const rsaDecryptSchema = z.object({
  privateKey: z.string().trim().regex(PRIVATE_PEM_RE, '请填写有效的 RSA 私钥 PEM'),
})

const rsaSignSchema = z.object({
  privateKey: z.string().trim().regex(PRIVATE_PEM_RE, '请填写有效的 RSA 私钥 PEM'),
})

const rsaVerifySchema = z.object({
  publicKey: z.string().trim().regex(PUBLIC_PEM_RE, '请填写有效的 RSA 公钥 PEM'),
  signature: nonEmptyString('签名'),
})

const sm2EncryptSchema = z.object({
  publicKey: z.string().trim().regex(SM2_PUBLIC_KEY_RE, '请填写有效的 SM2 公钥'),
})

const sm2DecryptSchema = z.object({
  privateKey: z.string().trim().regex(SM2_PRIVATE_KEY_RE, '请填写有效的 SM2 私钥'),
})

const sm2SignSchema = z.object({
  privateKey: z.string().trim().regex(SM2_PRIVATE_KEY_RE, '请填写有效的 SM2 私钥'),
  userId: nonEmptyString('用户ID'),
})

const sm2VerifySchema = z.object({
  publicKey: z.string().trim().regex(SM2_PUBLIC_KEY_RE, '请填写有效的 SM2 公钥'),
  signature: nonEmptyString('签名'),
  userId: nonEmptyString('用户ID'),
})

const getFirstIssue = (result: { success: boolean; error?: { issues: { message: string }[] } }) => {
  if (result.success) {
    return null
  }

  return result.error?.issues[0]?.message ?? '参数校验失败'
}

export const validateCryptoParams = (params: CryptoValidationParams): string | null => {
  switch (params.type) {
    case 'aes':
      return getFirstIssue(aesLikeSchema.safeParse(params))
    case 'des':
      return getFirstIssue(desSchema.safeParse(params))
    case '3des':
      return getFirstIssue(tripleDesSchema.safeParse(params))
    case 'aes-gcm':
      return getFirstIssue(aesGcmSchema.safeParse(params))
    case 'sm4':
      return getFirstIssue(sm4Schema.safeParse(params))
    case 'rsa':
      return getFirstIssue((params.isEncrypt ? rsaEncryptSchema : rsaDecryptSchema).safeParse(params))
    case 'rsa-sign':
      return getFirstIssue((params.isEncrypt ? rsaSignSchema : rsaVerifySchema).safeParse(params))
    case 'sm2':
      return getFirstIssue((params.isEncrypt ? sm2EncryptSchema : sm2DecryptSchema).safeParse(params))
    case 'sm2-sign':
      return getFirstIssue((params.isEncrypt ? sm2SignSchema : sm2VerifySchema).safeParse(params))
    default:
      return null
  }
}
