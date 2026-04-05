import type { EasyLanguageScriptParams } from './types'
import { buildBlockCipherEasyLanguageRunner } from './cipherHelpers'

export const buildAesEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildBlockCipherEasyLanguageRunner(params, 'AES', 'WT-JS_AES')
}
