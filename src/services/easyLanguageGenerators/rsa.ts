import type { EasyLanguageScriptParams } from './types'
import { buildRsaEasyLanguageRunner } from './rsaFamily'

export const buildRsaEasyLanguageRunnerEntry = (params: EasyLanguageScriptParams) => {
  return buildRsaEasyLanguageRunner(params)
}
