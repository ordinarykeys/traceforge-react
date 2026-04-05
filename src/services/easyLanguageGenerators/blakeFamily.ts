import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

type BlakeAlgorithm = 'blake2s' | 'blake2b' | 'blake3'

const buildBlakeFamilyScript = (
  params: EasyLanguageScriptParams,
  algorithm: BlakeAlgorithm
) => {
  return `${EASY_BINARY_HELPERS}

function WT_BlakeDigest(text) {
  if (${JSON.stringify(algorithm)} === 'blake2s') {
    return WT_BLAKE2S.blake2s(WT_String(text));
  }

  if (${JSON.stringify(algorithm)} === 'blake2b') {
    return WT_BLAKE2B.blake2b(WT_String(text));
  }

  return WT_BLAKE3.newRegular().update(WT_Utf8ToBytes(text)).finalize(32, 'bytes');
}

function WT_Run(text) {
  var digest = WT_BlakeDigest(WT_String(text));
  var binary = WT_BytesToBinary(digest);

  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(binary)
    : WT_HexEncode(binary);
}`
}

export const buildBlakeFamilyEasyLanguageRunner = (
  params: EasyLanguageScriptParams,
  algorithm: BlakeAlgorithm,
  description: string
): EasyLanguageRunner => {
  return {
    description,
    parameters: [{ name: 'text', comment: '鍙傛暟1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: buildBlakeFamilyScript(params, algorithm),
  }
}
