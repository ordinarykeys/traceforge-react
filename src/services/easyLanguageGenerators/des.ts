import type { EasyLanguageScriptParams } from './types'
import { buildBlockCipherEasyLanguageRunner } from './cipherHelpers'

export const buildDesEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildBlockCipherEasyLanguageRunner(params, 'DES', 'WT-JS_DES')
}
