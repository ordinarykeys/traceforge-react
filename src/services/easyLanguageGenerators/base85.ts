import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildBase85EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_BASE85',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_Base85Encode(text) {
  var binary = WT_Utf8Encode(text);
  var output = '';
  var i;
  var j;

  for (i = 0; i < binary.length; i += 4) {
    var chunkLength = Math.min(4, binary.length - i);
    var c1 = binary.charCodeAt(i) & 255;
    var c2 = chunkLength > 1 ? binary.charCodeAt(i + 1) & 255 : 0;
    var c3 = chunkLength > 2 ? binary.charCodeAt(i + 2) & 255 : 0;
    var c4 = chunkLength > 3 ? binary.charCodeAt(i + 3) & 255 : 0;

    if (chunkLength === 4 && c1 === 0 && c2 === 0 && c3 === 0 && c4 === 0) {
      output += 'z';
      continue;
    }

    var value = (((c1 * 256 + c2) * 256 + c3) * 256 + c4);
    var encoded = ['', '', '', '', ''];

    for (j = 4; j >= 0; j -= 1) {
      encoded[j] = String.fromCharCode((value % 85) + 33);
      value = Math.floor(value / 85);
    }

    output += encoded.join('').substr(0, chunkLength + 1);
  }

  return output;
}

function WT_Base85Decode(text) {
  var clean = WT_String(text).replace(/\\s+/g, '');
  var output = '';
  var chunk = '';
  var i;

  function flush(value, isFinal) {
    var padded = value;
    var j;
    while (padded.length < 5) {
      padded += 'u';
    }
    var num = 0;
    for (j = 0; j < 5; j += 1) {
      var code = padded.charCodeAt(j) - 33;
      if (code < 0 || code > 84) {
        throw new Error('Invalid Base85 character: ' + padded.charAt(j));
      }
      num = num * 85 + code;
    }
    var block = String.fromCharCode((num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255);
    output += isFinal ? block.substr(0, value.length - 1) : block;
  }

  for (i = 0; i < clean.length; i += 1) {
    var ch = clean.charAt(i);
    if (ch === 'z') {
      if (chunk.length) {
        throw new Error('Invalid Base85 sequence');
      }
      output += String.fromCharCode(0, 0, 0, 0);
      continue;
    }
    chunk += ch;
    if (chunk.length === 5) {
      flush(chunk, false);
      chunk = '';
    }
  }

  if (chunk.length) {
    if (chunk.length === 1) {
      throw new Error('Invalid Base85 tail');
    }
    flush(chunk, true);
  }

  return WT_Utf8Decode(output);
}

function WT_Run(text) {
  return ${params.isEncrypt ? 'WT_Base85Encode(text)' : 'WT_Base85Decode(text)'};
}`,
  }
}
