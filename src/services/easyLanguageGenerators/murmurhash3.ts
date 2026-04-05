import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildMurmurhash3EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_MURMURHASH3',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_Run(text) {
  var binary = WT_Utf8Encode(text);
  var remainder = binary.length & 3;
  var bytes = binary.length - remainder;
  var hash = 0;
  var c1 = 0xcc9e2d51;
  var c2 = 0x1b873593;
  var i = 0;
  var k;
  var k1;

  while (i < bytes) {
    k =
      (binary.charCodeAt(i) & 255) |
      ((binary.charCodeAt(i + 1) & 255) << 8) |
      ((binary.charCodeAt(i + 2) & 255) << 16) |
      ((binary.charCodeAt(i + 3) & 255) << 24);
    i += 4;

    k = WT_Imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = WT_Imul(k, c2);

    hash ^= k;
    hash = (hash << 13) | (hash >>> 19);
    hash = (WT_Imul(hash, 5) + 0xe6546b64) | 0;
  }

  k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (binary.charCodeAt(i + 2) & 255) << 16;
    case 2:
      k1 ^= (binary.charCodeAt(i + 1) & 255) << 8;
    case 1:
      k1 ^= binary.charCodeAt(i) & 255;
      k1 = WT_Imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = WT_Imul(k1, c2);
      hash ^= k1;
  }

  hash ^= binary.length;
  hash ^= hash >>> 16;
  hash = WT_Imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = WT_Imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  var result = hash >>> 0;
  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(String.fromCharCode((result >>> 24) & 255, (result >>> 16) & 255, (result >>> 8) & 255, result & 255))
    : WT_ToUInt32Hex(result);
}`,
  }
}
