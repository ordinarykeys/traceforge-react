import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildRipemd160EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_RIPEMD160',
    parameters: [
      { name: 'text', comment: '参数1' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `function WT_Run(text) {
  var hash = CryptoJS.RIPEMD160(String(text));
  return hash.toString(CryptoJS.enc[${JSON.stringify(params.outputFormat)}]);
}`,
  }
}
