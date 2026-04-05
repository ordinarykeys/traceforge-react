import type { EasyLanguageScriptParams } from './types'
import { buildStreamCipherEasyLanguageRunner } from './cipherHelpers'

export const buildRc4EasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildStreamCipherEasyLanguageRunner(params, 'RC4', 'WT-JS_RC4')
}
