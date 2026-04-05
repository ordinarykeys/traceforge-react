import type { EasyLanguageScriptParams } from './types'
import { buildSm2EasyLanguageRunner } from './sm2Family'

export const buildSm2EasyLanguageRunnerEntry = (params: EasyLanguageScriptParams) => {
  return buildSm2EasyLanguageRunner(params)
}
