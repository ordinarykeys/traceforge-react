import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildBase64UrlEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_BASE64URL',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_Run(text) {
  if (${params.isEncrypt ? 'true' : 'false'}) {
    return WT_Base64Encode(WT_Utf8Encode(text)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
  }

  var base64 = WT_String(text).replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return WT_Utf8Decode(WT_Base64Decode(base64));
}`,
  }
}
