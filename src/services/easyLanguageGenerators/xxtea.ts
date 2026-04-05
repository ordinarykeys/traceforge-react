import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildXxteaEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_XXTEA',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'key', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('key')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_StringToBytes(binary) {
  var bytes = [];
  var i;
  for (i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 255;
  }
  return bytes;
}

function WT_BytesToString(bytes) {
  var output = '';
  var i;
  for (i = 0; i < bytes.length; i += 1) {
    output += String.fromCharCode(bytes[i] & 255);
  }
  return output;
}

function WT_ToUint32Array(bytes, includeLength) {
  var length = bytes.length;
  var n = Math.ceil(length / 4);
  var result = [];
  var total = includeLength ? n + 1 : n;
  var i;

  for (i = 0; i < total; i += 1) {
    result[i] = 0;
  }

  for (i = 0; i < length; i += 1) {
    result[i >>> 2] |= (bytes[i] & 255) << ((i & 3) << 3);
  }

  if (includeLength) {
    result[n] = length;
  }

  return result;
}

function WT_FromUint32Array(data, includeLength) {
  var length = data.length * 4;
  var bytes = [];
  var i;

  if (includeLength) {
    length = data[data.length - 1];
  }

  for (i = 0; i < length; i += 1) {
    bytes[i] = (data[i >>> 2] >>> ((i & 3) << 3)) & 255;
  }

  return bytes;
}

function WT_FixKey(key) {
  var bytes = WT_StringToBytes(WT_Utf8Encode(key));
  var fixed = [];
  var i;

  for (i = 0; i < 16; i += 1) {
    fixed[i] = i < bytes.length ? bytes[i] : 0;
  }

  return WT_ToUint32Array(fixed, false);
}

function WT_XXTeaEncryptArray(data, key) {
  var n = data.length - 1;
  var z;
  var y;
  var sum;
  var delta;
  var q;
  var e;
  var p;
  var mx;

  if (n < 1) {
    return data;
  }

  z = data[n];
  y = data[0];
  sum = 0;
  delta = 0x9e3779b9;
  q = Math.floor(6 + 52 / (n + 1));

  while (q-- > 0) {
    sum = (sum + delta) >>> 0;
    e = (sum >>> 2) & 3;

    for (p = 0; p < n; p += 1) {
      y = data[p + 1];
      mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0;
      z = data[p] = (data[p] + mx) >>> 0;
    }

    y = data[0];
    mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(n & 3) ^ e] ^ z))) >>> 0;
    z = data[n] = (data[n] + mx) >>> 0;
  }

  return data;
}

function WT_XXTeaDecryptArray(data, key) {
  var n = data.length - 1;
  var z;
  var y;
  var delta;
  var q;
  var sum;
  var e;
  var p;
  var mx;

  if (n < 1) {
    return data;
  }

  z = data[n];
  y = data[0];
  delta = 0x9e3779b9;
  q = Math.floor(6 + 52 / (n + 1));
  sum = (q * delta) >>> 0;

  while (sum !== 0) {
    e = (sum >>> 2) & 3;

    for (p = n; p > 0; p -= 1) {
      z = data[p - 1];
      mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0;
      y = data[p] = (data[p] - mx) >>> 0;
    }

    z = data[n];
    mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[e] ^ z))) >>> 0;
    y = data[0] = (data[0] - mx) >>> 0;
    sum = (sum - delta) >>> 0;
  }

  return data;
}

function WT_XXTeaEncrypt(text, key, outputFormat) {
  var data = WT_ToUint32Array(WT_StringToBytes(WT_Utf8Encode(text)), true);
  var encrypted = WT_XXTeaEncryptArray(data, WT_FixKey(key));
  var binary = WT_BytesToString(WT_FromUint32Array(encrypted, false));
  return outputFormat === 'Hex' ? WT_HexEncode(binary) : WT_Base64Encode(binary);
}

function WT_XXTeaDecrypt(ciphertext, key, inputFormat) {
  var binary = inputFormat === 'Hex'
    ? WT_HexDecode(ciphertext)
    : WT_Base64Decode(ciphertext);
  var decrypted = WT_XXTeaDecryptArray(WT_ToUint32Array(WT_StringToBytes(binary), false), WT_FixKey(key));
  return WT_Utf8Decode(WT_BytesToString(WT_FromUint32Array(decrypted, true)));
}

function WT_Run(text, key) {
  return ${params.isEncrypt ? 'WT_XXTeaEncrypt(text, key, ' + JSON.stringify(params.outputEncoding) + ')' : 'WT_XXTeaDecrypt(text, key, ' + JSON.stringify(params.outputEncoding) + ')'};
}`,
  }
}
