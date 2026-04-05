import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildAdler32EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_ADLER32',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_Run(text) {
  var binary = WT_Utf8Encode(text);
  var a = 1;
  var b = 0;
  var i;

  for (i = 0; i < binary.length; i += 1) {
    a = (a + (binary.charCodeAt(i) & 255)) % 65521;
    b = (b + a) % 65521;
  }

  var result = (((b << 16) | a) >>> 0);
  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(String.fromCharCode((result >>> 24) & 255, (result >>> 16) & 255, (result >>> 8) & 255, result & 255))
    : WT_ToUInt32Hex(result);
}`,
  }
}
