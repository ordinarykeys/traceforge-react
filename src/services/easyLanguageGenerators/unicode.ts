import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildUnicodeEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_UNICODE',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `function WT_ZeroPad4(hex) {
  while (hex.length < 4) {
    hex = '0' + hex;
  }
  return hex;
}

function WT_Run(text) {
  var value = String(text);
  var i;
  var output = '';

  if (${params.isEncrypt ? 'true' : 'false'}) {
    for (i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      output += code > 127 ? '\\\\u' + WT_ZeroPad4(code.toString(16)) : value.charAt(i);
    }
    return output;
  }

  return value.replace(/\\\\u([0-9a-fA-F]{4})/g, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
}`,
  }
}
