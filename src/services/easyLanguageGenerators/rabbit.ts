import type { EasyLanguageScriptParams } from './types'
import { buildStreamCipherEasyLanguageRunner } from './cipherHelpers'

export const buildRabbitEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildStreamCipherEasyLanguageRunner(params, 'Rabbit', 'WT-JS_Rabbit')
}
