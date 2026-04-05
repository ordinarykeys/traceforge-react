import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

const buildSha3FamilyScript = (
  params: EasyLanguageScriptParams,
  globalMethod: 'keccak256' | 'sha3_256'
) => {
  return `${EASY_BINARY_HELPERS}

function WT_Run(text) {
  var hash = ${globalMethod}(String(text));
  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(WT_HexDecode(hash))
    : hash;
}`
}

export const buildSha3FamilyEasyLanguageRunner = (
  params: EasyLanguageScriptParams,
  globalMethod: 'keccak256' | 'sha3_256',
  description: string
): EasyLanguageRunner => {
  return {
    description,
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: buildSha3FamilyScript(params, globalMethod),
  }
}
