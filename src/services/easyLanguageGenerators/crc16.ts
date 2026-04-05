import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildCrc16EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_CRC16',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_Run(text) {
  var binary = WT_Utf8Encode(text);
  var crc = 65535;
  var i;
  var j;

  for (i = 0; i < binary.length; i += 1) {
    crc ^= binary.charCodeAt(i) & 255;
    for (j = 0; j < 8; j += 1) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xa001;
      } else {
        crc = crc >>> 1;
      }
    }
  }

  crc &= 65535;
  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(String.fromCharCode((crc >>> 8) & 255, crc & 255))
    : WT_ToUInt16Hex(crc);
}`,
  }
}
