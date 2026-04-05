import type { EasyLanguageScriptParams } from './types'
import { buildSha3FamilyEasyLanguageRunner } from './sha3Family'

export const buildSha3256EasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildSha3FamilyEasyLanguageRunner(params, 'sha3_256', 'WT-JS_SHA3_256')
}
