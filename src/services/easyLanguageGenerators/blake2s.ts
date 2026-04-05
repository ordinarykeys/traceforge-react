import type { EasyLanguageScriptParams } from './types'
import { buildBlakeFamilyEasyLanguageRunner } from './blakeFamily'

export const buildBlake2sEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildBlakeFamilyEasyLanguageRunner(params, 'blake2s', 'WT-JS_BLAKE2S')
}
