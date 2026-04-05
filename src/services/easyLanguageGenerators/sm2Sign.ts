import type { EasyLanguageScriptParams } from './types'
import { buildSm2SignEasyLanguageRunner } from './sm2Family'

export const buildSm2SignEasyLanguageRunnerEntry = (params: EasyLanguageScriptParams) => {
  return buildSm2SignEasyLanguageRunner(params)
}
