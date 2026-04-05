import type { EasyLanguageScriptParams } from './types'
import { buildSha3FamilyEasyLanguageRunner } from './sha3Family'

export const buildKeccak256EasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildSha3FamilyEasyLanguageRunner(params, 'keccak256', 'WT-JS_KECCAK256')
}
