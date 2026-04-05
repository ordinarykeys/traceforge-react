import type { EasyLanguageScriptParams } from './types'
import { buildTeaFamilyEasyLanguageRunner } from './teaFamily'

export const buildXteaEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildTeaFamilyEasyLanguageRunner(params, 'xtea', 'WT-JS_XTEA')
}
