export interface EasyLanguageScriptParams {
  type: string
  subType: string
  outputFormat: string
  isEncrypt: boolean
  mode: string
  padding: string
  keyEncoding: string
  ivEncoding: string
  outputEncoding: string
  rsaPadding?: string
  salt: string
  keySize: number
  iterations: number
  costFactor?: number
  blockSizeFactor?: number
  parallelism?: number
  publicKey?: string
  privateKey?: string
  signature?: string
  sm2CipherMode?: number
  userId?: string
  protobufInputFormat?: 'hex' | 'base64'
  xorInitialKey?: number
}

export interface EasyLanguageParameter {
  name: string
  comment: string
}

export interface EasyLanguageRunner {
  script: string
  parameters: EasyLanguageParameter[]
  evalExpression: string
  description?: string
}
