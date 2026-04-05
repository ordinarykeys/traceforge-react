import type { EasyLanguageScriptParams } from './types'
import { buildBlockCipherEasyLanguageRunner } from './cipherHelpers'

export const buildTripleDesEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildBlockCipherEasyLanguageRunner(params, 'TripleDES', 'WT-JS_3DES')
}
