import type { EasyLanguageScriptParams } from './types'
import { buildBlakeFamilyEasyLanguageRunner } from './blakeFamily'

export const buildBlake2bEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildBlakeFamilyEasyLanguageRunner(params, 'blake2b', 'WT-JS_BLAKE2B')
}
