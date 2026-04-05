import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildCrc32EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_CRC32',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_Run(text) {
  var binary = WT_Utf8Encode(text);
  var crc = -1;
  var i;
  var j;

  for (i = 0; i < binary.length; i += 1) {
    crc ^= binary.charCodeAt(i) & 255;
    for (j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  var result = (crc ^ -1) >>> 0;
  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(String.fromCharCode((result >>> 24) & 255, (result >>> 16) & 255, (result >>> 8) & 255, result & 255))
    : WT_ToUInt32Hex(result);
}`,
  }
}
