import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildUrlEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_URL',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `function WT_Run(text) {
  return ${params.isEncrypt ? 'encodeURIComponent(String(text))' : 'decodeURIComponent(String(text))'};
}`,
  }
}
