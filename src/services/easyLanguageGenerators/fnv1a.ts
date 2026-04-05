import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildFnv1aEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_FNV1A',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_Run(text) {
  var binary = WT_Utf8Encode(text);
  var hash = 0x811c9dc5;
  var i;

  for (i = 0; i < binary.length; i += 1) {
    hash ^= binary.charCodeAt(i) & 255;
    hash = WT_Imul(hash, 0x01000193) >>> 0;
  }

  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(String.fromCharCode((hash >>> 24) & 255, (hash >>> 16) & 255, (hash >>> 8) & 255, hash & 255))
    : WT_ToUInt32Hex(hash);
}`,
  }
}
