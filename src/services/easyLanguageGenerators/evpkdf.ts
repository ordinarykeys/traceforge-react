import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildEvpkdfEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_EvpKDF',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'salt', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('salt')})`,
    script: `function WT_Run(text, salt) {
  var result = CryptoJS.EvpKDF(String(text), String(salt), {
    keySize: ${Math.max(1, Math.floor(params.keySize / 32))},
    iterations: ${Math.max(1, params.iterations)}
  });
  return result.toString(CryptoJS.enc[${JSON.stringify(params.outputFormat)}]);
}`,
  }
}
