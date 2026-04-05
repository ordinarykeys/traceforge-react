import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildBase58EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_BASE58',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

var WT_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function WT_Base58Encode(text) {
  var binary = WT_Utf8Encode(text);
  var digits = [0];
  var result = '';
  var i;
  var j;

  for (i = 0; i < binary.length; i += 1) {
    var carry = binary.charCodeAt(i) & 255;
    for (j = 0; j < digits.length; j += 1) {
      var value = digits[j] * 256 + carry;
      digits[j] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits[digits.length] = carry % 58;
      carry = Math.floor(carry / 58);
    }
  }

  for (i = 0; i < binary.length && (binary.charCodeAt(i) & 255) === 0; i += 1) {
    result += '1';
  }
  for (i = digits.length - 1; i >= 0; i -= 1) {
    result += WT_BASE58_ALPHABET.charAt(digits[i]);
  }
  return result;
}

function WT_Base58Decode(text) {
  var value = WT_String(text);
  var bytes = [0];
  var output = '';
  var i;
  var j;

  for (i = 0; i < value.length; i += 1) {
    var index = WT_BASE58_ALPHABET.indexOf(value.charAt(i));
    if (index < 0) {
      throw new Error('Invalid Base58 character: ' + value.charAt(i));
    }
    var carry = index;
    for (j = 0; j < bytes.length; j += 1) {
      var current = bytes[j] * 58 + carry;
      bytes[j] = current & 255;
      carry = current >> 8;
    }
    while (carry > 0) {
      bytes[bytes.length] = carry & 255;
      carry = carry >> 8;
    }
  }

  for (i = 0; i < value.length && value.charAt(i) === '1'; i += 1) {
    output += String.fromCharCode(0);
  }
  for (i = bytes.length - 1; i >= 0; i -= 1) {
    output += String.fromCharCode(bytes[i] & 255);
  }
  return WT_Utf8Decode(output);
}

function WT_Run(text) {
  return ${params.isEncrypt ? 'WT_Base58Encode(text)' : 'WT_Base58Decode(text)'};
}`,
  }
}
