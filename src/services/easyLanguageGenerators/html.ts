import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildHtmlEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_HTML',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `function WT_Run(text) {
  var value = String(text);
  var i;
  var output = '';

  if (${params.isEncrypt ? 'true' : 'false'}) {
    for (i = 0; i < value.length; i += 1) {
      var ch = value.charAt(i);
      var code = value.charCodeAt(i);
      if (code > 127 || ch === '<' || ch === '>' || ch === '&' || ch === '"' || ch === "'") {
        output += '&#' + code + ';';
      } else {
        output += ch;
      }
    }
    return output;
  }

  return value
    .replace(/&#(\\d+);/g, function (_, dec) { return String.fromCharCode(parseInt(dec, 10)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
}`,
  }
}
