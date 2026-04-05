import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildMd5EasyLanguageRunner = (_params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_MD5',
    parameters: [
      { name: 'text', comment: '待加密文本' },
      { name: 'mode', comment: '输出模式: lower32/upper32/lower16/upper16' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('mode')})`,
    script: `function WT_Run(text, mode) {
  var hash = CryptoJS.MD5(String(text)).toString();
  var lower32 = hash.toLowerCase();
  var upper32 = hash.toUpperCase();
  var lower16 = hash.substring(8, 24).toLowerCase();
  var upper16 = hash.substring(8, 24).toUpperCase();

  switch (mode) {
    case '32A':
    case 'upper32':
      return upper32;
    case '16a':
    case 'lower16':
      return lower16;
    case '16A':
    case 'upper16':
      return upper16;
    case '32a':
    case 'lower32':
    default:
      return lower32;
  }
}`,
  }
}
