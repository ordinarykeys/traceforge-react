import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildScryptEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  const keySizeBytes = Math.max(1, Math.floor((params.keySize || 256) / 8))
  const costFactor = Math.max(2, params.costFactor || 16384)
  const blockSizeFactor = Math.max(1, params.blockSizeFactor || 8)
  const parallelism = Math.max(1, params.parallelism || 1)

  return {
    description: 'WT-JS_scrypt',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'salt', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('salt')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_ScryptUtf8Bytes(text) {
  var binary = WT_Utf8Encode(WT_String(text));
  var result = [];
  var i;

  for (i = 0; i < binary.length; i += 1) {
    result.push(binary.charCodeAt(i) & 255);
  }

  return result;
}

function WT_Run(text, salt) {
  var passwordBytes = WT_ScryptUtf8Bytes(text);
  var saltBytes = WT_ScryptUtf8Bytes(salt);
  var derived = scrypt.syncScrypt(
    passwordBytes,
    saltBytes,
    ${costFactor},
    ${blockSizeFactor},
    ${parallelism},
    ${keySizeBytes}
  );
  var hex = '';
  var i;

  for (i = 0; i < derived.length; i += 1) {
    hex += WT_HexByte(derived[i] & 255);
  }

  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(WT_HexDecode(hex))
    : hex;
}`,
  }
}
