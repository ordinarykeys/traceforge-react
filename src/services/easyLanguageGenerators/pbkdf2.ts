import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildPbkdf2EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_PBKDF2',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'salt', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('salt')})`,
    script: `function WT_Run(text, salt) {
  var result = CryptoJS.PBKDF2(String(text), String(salt), {
    keySize: ${Math.max(1, Math.floor(params.keySize / 32))},
    iterations: ${Math.max(1, params.iterations)},
    hasher: CryptoJS.algo.SHA256
  });
  return result.toString(CryptoJS.enc[${JSON.stringify(params.outputFormat)}]);
}`,
  }
}
