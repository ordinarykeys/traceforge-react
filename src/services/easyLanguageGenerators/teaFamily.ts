import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

const buildTeaFamilyScript = (
  params: EasyLanguageScriptParams,
  variant: 'tea' | 'xtea'
) => {
  const encryptRounds = variant === 'tea'
    ? `sum = (sum + delta) >>> 0;
      v0 = (v0 + ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0;
      v1 = (v1 + ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0;`
    : `v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + keyWords[sum & 3]))) >>> 0;
      sum = (sum + delta) >>> 0;
      v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + keyWords[(sum >>> 11) & 3]))) >>> 0;`

  const decryptRounds = variant === 'tea'
    ? `v1 = (v1 - ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0;
      v0 = (v0 - ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0;
      sum = (sum - delta) >>> 0;`
    : `v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + keyWords[(sum >>> 11) & 3]))) >>> 0;
      sum = (sum - delta) >>> 0;
      v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + keyWords[sum & 3]))) >>> 0;`

  return `${EASY_BINARY_HELPERS}

function WT_TeaPad(binary) {
  var padding = 8 - (binary.length % 8);
  var i;
  if (padding === 0) {
    padding = 8;
  }
  for (i = 0; i < padding; i += 1) {
    binary += String.fromCharCode(padding);
  }
  return binary;
}

function WT_TeaUnpad(binary) {
  if (!binary.length) {
    return binary;
  }

  var padding = binary.charCodeAt(binary.length - 1) & 255;
  if (padding <= 0 || padding > 8) {
    return binary;
  }

  return binary.substr(0, binary.length - padding);
}

function WT_TeaWord(binary, offset) {
  return (
    (((binary.charCodeAt(offset) & 255) << 24) >>> 0) |
    (((binary.charCodeAt(offset + 1) & 255) << 16) >>> 0) |
    (((binary.charCodeAt(offset + 2) & 255) << 8) >>> 0) |
    ((binary.charCodeAt(offset + 3) & 255) >>> 0)
  );
}

function WT_TeaWordToString(value) {
  return String.fromCharCode(
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  );
}

function WT_TeaKeyWords(key) {
  var binary = WT_Utf8Encode(key);
  var padded = binary.substr(0, 16);
  var words = [];

  while (padded.length < 16) {
    padded += String.fromCharCode(0);
  }

  words[0] = WT_TeaWord(padded, 0);
  words[1] = WT_TeaWord(padded, 4);
  words[2] = WT_TeaWord(padded, 8);
  words[3] = WT_TeaWord(padded, 12);
  return words;
}

function WT_TeaEncryptBlock(v0, v1, keyWords) {
  var delta = 0x9e3779b9;
  var sum = 0;
  var i;

  for (i = 0; i < 32; i += 1) {
    ${encryptRounds}
  }

  return WT_TeaWordToString(v0) + WT_TeaWordToString(v1);
}

function WT_TeaDecryptBlock(v0, v1, keyWords) {
  var delta = 0x9e3779b9;
  var sum = (delta * 32) >>> 0;
  var i;

  for (i = 0; i < 32; i += 1) {
    ${decryptRounds}
  }

  return WT_TeaWordToString(v0) + WT_TeaWordToString(v1);
}

function WT_TeaEncrypt(text, key, outputFormat) {
  var binary = WT_TeaPad(WT_Utf8Encode(text));
  var keyWords = WT_TeaKeyWords(key);
  var output = '';
  var offset;

  for (offset = 0; offset < binary.length; offset += 8) {
    output += WT_TeaEncryptBlock(
      WT_TeaWord(binary, offset),
      WT_TeaWord(binary, offset + 4),
      keyWords
    );
  }

  return outputFormat === 'Hex' ? WT_HexEncode(output) : WT_Base64Encode(output);
}

function WT_TeaDecrypt(ciphertext, key, inputFormat) {
  var binary = inputFormat === 'Hex'
    ? WT_HexDecode(ciphertext)
    : WT_Base64Decode(ciphertext);
  var keyWords = WT_TeaKeyWords(key);
  var output = '';
  var offset;

  for (offset = 0; offset < binary.length; offset += 8) {
    output += WT_TeaDecryptBlock(
      WT_TeaWord(binary, offset),
      WT_TeaWord(binary, offset + 4),
      keyWords
    );
  }

  return WT_Utf8Decode(WT_TeaUnpad(output));
}

function WT_Run(text, key) {
  return ${params.isEncrypt ? 'WT_TeaEncrypt(text, key, ' + JSON.stringify(params.outputEncoding) + ')' : 'WT_TeaDecrypt(text, key, ' + JSON.stringify(params.outputEncoding) + ')'};
}`
}

export const buildTeaFamilyEasyLanguageRunner = (
  params: EasyLanguageScriptParams,
  variant: 'tea' | 'xtea',
  description: string
): EasyLanguageRunner => {
  return {
    description,
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'key', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('key')})`,
    script: buildTeaFamilyScript(params, variant),
  }
}
