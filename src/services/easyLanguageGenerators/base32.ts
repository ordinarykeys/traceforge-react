import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildBase32EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_BASE32',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

var WT_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function WT_Base32Encode(text) {
  var binary = WT_Utf8Encode(text);
  var bits = 0;
  var value = 0;
  var output = '';
  var i;

  for (i = 0; i < binary.length; i += 1) {
    value = (value << 8) | (binary.charCodeAt(i) & 255);
    bits += 8;
    while (bits >= 5) {
      output += WT_BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += WT_BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
  }

  while (output.length % 8 !== 0) {
    output += '=';
  }
  return output;
}

function WT_Base32Decode(text) {
  var clean = WT_String(text).toUpperCase().replace(/=+$/g, '');
  var bits = 0;
  var value = 0;
  var output = '';
  var i;

  for (i = 0; i < clean.length; i += 1) {
    var index = WT_BASE32_ALPHABET.indexOf(clean.charAt(i));
    if (index < 0) {
      throw new Error('Invalid Base32 character: ' + clean.charAt(i));
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output += String.fromCharCode((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return WT_Utf8Decode(output);
}

function WT_Run(text) {
  return ${params.isEncrypt ? 'WT_Base32Encode(text)' : 'WT_Base32Decode(text)'};
}`,
  }
}
