import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

const HMAC_FUNCTIONS: Record<string, string> = {
  'HMAC-MD5': 'HmacMD5',
  'HMAC-SHA1': 'HmacSHA1',
  'HMAC-SHA224': 'HmacSHA224',
  'HMAC-SHA256': 'HmacSHA256',
  'HMAC-SHA384': 'HmacSHA384',
  'HMAC-SHA512': 'HmacSHA512',
  'HMAC-SHA3': 'HmacSHA3',
  'HMAC-RIPEMD160': 'HmacRIPEMD160',
}

export const buildHmacEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  const functionName = HMAC_FUNCTIONS[params.subType] || 'HmacSHA256'

  return {
    description: 'WT-JS_HMAC',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'key', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('key')})`,
    script: `function WT_Run(text, key) {
  var hash = CryptoJS.${functionName}(String(text), String(key));
  return hash.toString(CryptoJS.enc[${JSON.stringify(params.outputFormat)}]);
}`,
  }
}
