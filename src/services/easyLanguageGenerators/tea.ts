import type { EasyLanguageScriptParams } from './types'
import { buildTeaFamilyEasyLanguageRunner } from './teaFamily'

export const buildTeaEasyLanguageRunner = (params: EasyLanguageScriptParams) => {
  return buildTeaFamilyEasyLanguageRunner(params, 'tea', 'WT-JS_TEA')
}
