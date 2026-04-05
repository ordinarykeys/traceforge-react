import type { EasyLanguageScriptParams } from './types'
import { buildBlakeFamilyEasyLanguageRunner } from './blakeFamily'

export const buildBlake3EasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildBlakeFamilyEasyLanguageRunner(params, 'blake3', 'WT-JS_BLAKE3')
}
