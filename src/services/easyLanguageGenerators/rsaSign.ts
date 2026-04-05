import type { EasyLanguageScriptParams } from './types'
import { buildRsaSignEasyLanguageRunner } from './rsaFamily'

export const buildRsaSignEasyLanguageRunnerEntry = (params: EasyLanguageScriptParams) => {
  return buildRsaSignEasyLanguageRunner(params)
}
