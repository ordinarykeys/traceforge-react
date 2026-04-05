import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildUtf16EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  const encoderName = params.keyEncoding && params.keyEncoding !== 'Utf8'
    ? params.keyEncoding
    : 'Utf16'

  return {
    description: 'WT-JS_UTF16',
    parameters: [
      { name: 'text', comment: '参数1' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `function WT_Run(text) {
  var encoder = CryptoJS.enc[${JSON.stringify(encoderName)}];
  if (${params.isEncrypt ? 'true' : 'false'}) {
    return encoder.stringify(CryptoJS.enc.Utf8.parse(String(text)));
  }
  return CryptoJS.enc.Utf8.stringify(encoder.parse(String(text))).replace(/\\u0000+$/g, '');
}`,
  }
}
