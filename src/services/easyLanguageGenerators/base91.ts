import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildBase91EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_BASE91',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

var WT_BASE91_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_\`{|}~"';

function WT_Base91Index(char) {
  return WT_BASE91_ALPHABET.indexOf(char);
}

function WT_Base91Encode(text) {
  var binary = WT_Utf8Encode(text);
  var b = 0;
  var n = 0;
  var output = '';
  var i;

  for (i = 0; i < binary.length; i += 1) {
    b |= (binary.charCodeAt(i) & 255) << n;
    n += 8;
    if (n > 13) {
      var value = b & 8191;
      if (value > 88) {
        b >>= 13;
        n -= 13;
      } else {
        value = b & 16383;
        b >>= 14;
        n -= 14;
      }
      output += WT_BASE91_ALPHABET.charAt(value % 91) + WT_BASE91_ALPHABET.charAt(Math.floor(value / 91));
    }
  }

  if (n) {
    output += WT_BASE91_ALPHABET.charAt(b % 91);
    if (n > 7 || b > 90) {
      output += WT_BASE91_ALPHABET.charAt(Math.floor(b / 91));
    }
  }

  return output;
}

function WT_Base91Decode(text) {
  var clean = WT_String(text).replace(/\\s+/g, '');
  var value = -1;
  var b = 0;
  var n = 0;
  var output = '';
  var i;

  for (i = 0; i < clean.length; i += 1) {
    var decoded = WT_Base91Index(clean.charAt(i));
    if (decoded < 0) {
      throw new Error('Invalid Base91 character: ' + clean.charAt(i));
    }
    if (value < 0) {
      value = decoded;
      continue;
    }
    value += decoded * 91;
    b |= value << n;
    n += (value & 8191) > 88 ? 13 : 14;
    while (n > 7) {
      output += String.fromCharCode(b & 255);
      b >>= 8;
      n -= 8;
    }
    value = -1;
  }

  if (value >= 0) {
    output += String.fromCharCode((b | (value << n)) & 255);
  }

  return WT_Utf8Decode(output);
}

function WT_Run(text) {
  return ${params.isEncrypt ? 'WT_Base91Encode(text)' : 'WT_Base91Decode(text)'};
}`,
  }
}
