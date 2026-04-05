import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildXorChainEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_XORCHAIN',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'initialKey', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('initialKey')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_XorChainEncrypt(text, initialKey) {
  var binary = WT_Utf8Encode(text);
  var output = '';
  var key = parseInt(initialKey, 10);
  var i;

  if (isNaN(key)) {
    key = ${params.xorInitialKey ?? 0};
  }

  for (i = 0; i < binary.length; i += 1) {
    var encryptedByte = (binary.charCodeAt(i) & 255) ^ key;
    output += String.fromCharCode(encryptedByte);
    key = encryptedByte;
  }

  return WT_Base64Encode(output);
}

function WT_XorChainDecrypt(text, initialKey) {
  var binary = WT_Base64Decode(text);
  var output = '';
  var key = parseInt(initialKey, 10);
  var i;

  if (isNaN(key)) {
    key = ${params.xorInitialKey ?? 0};
  }

  for (i = 0; i < binary.length; i += 1) {
    var current = binary.charCodeAt(i) & 255;
    output += String.fromCharCode(current ^ key);
    key = current;
  }

  return WT_Utf8Decode(output);
}

function WT_Run(text, initialKey) {
  return ${params.isEncrypt ? 'WT_XorChainEncrypt(text, initialKey)' : 'WT_XorChainDecrypt(text, initialKey)'};
}`,
  }
}
