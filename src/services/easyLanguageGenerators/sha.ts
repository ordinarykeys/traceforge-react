import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildShaEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_SHA',
    parameters: [
      { name: 'text', comment: '参数1' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `function WT_Run(text) {
  var hash = CryptoJS[${JSON.stringify(params.subType)}](String(text));
  return hash.toString(CryptoJS.enc[${JSON.stringify(params.outputFormat)}]);
}`,
  }
}
