import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildSm3EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_SM3',
    parameters: [{ name: 'text', comment: '参数1' }],
    evalExpression: `WT_Run(${quoteParam('text')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_SM3RotateLeft(value, bits) {
  var shift = bits & 31;
  return (value << shift) | (value >>> (32 - shift));
}

function WT_SM3P0(value) {
  return value ^ WT_SM3RotateLeft(value, 9) ^ WT_SM3RotateLeft(value, 17);
}

function WT_SM3P1(value) {
  return value ^ WT_SM3RotateLeft(value, 15) ^ WT_SM3RotateLeft(value, 23);
}

function WT_SM3FF(x, y, z, round) {
  return round <= 15 ? (x ^ y ^ z) : ((x & y) | (x & z) | (y & z));
}

function WT_SM3GG(x, y, z, round) {
  return round <= 15 ? (x ^ y ^ z) : ((x & y) | ((~x) & z));
}

function WT_SM3ToBytes(binary) {
  var bytes = [];
  var i;
  for (i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 255;
  }
  return bytes;
}

function WT_SM3WordToHex(value) {
  return WT_ToUInt32Hex(value >>> 0);
}

function WT_SM3Pad(binary) {
  var bytes = WT_SM3ToBytes(binary);
  var bitLength = bytes.length * 8;
  var high = Math.floor(bitLength / 0x100000000);
  var low = bitLength >>> 0;

  bytes.push(128);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  bytes.push((high >>> 24) & 255);
  bytes.push((high >>> 16) & 255);
  bytes.push((high >>> 8) & 255);
  bytes.push(high & 255);
  bytes.push((low >>> 24) & 255);
  bytes.push((low >>> 16) & 255);
  bytes.push((low >>> 8) & 255);
  bytes.push(low & 255);

  return bytes;
}

function WT_SM3Hex(text) {
  var bytes = WT_SM3Pad(WT_Utf8Encode(text));
  var state = [
    0x7380166f,
    0x4914b2b9,
    0x172442d7,
    0xda8a0600,
    0xa96f30bc,
    0x163138aa,
    0xe38dee4d,
    0xb0fb0e4e,
  ];
  var W = [];
  var W1 = [];
  var offset;
  var j;

  for (offset = 0; offset < bytes.length; offset += 64) {
    for (j = 0; j < 16; j += 1) {
      W[j] = (
        ((bytes[offset + j * 4] & 255) << 24) |
        ((bytes[offset + j * 4 + 1] & 255) << 16) |
        ((bytes[offset + j * 4 + 2] & 255) << 8) |
        (bytes[offset + j * 4 + 3] & 255)
      ) >>> 0;
    }

    for (j = 16; j < 68; j += 1) {
      W[j] = (WT_SM3P1(W[j - 16] ^ W[j - 9] ^ WT_SM3RotateLeft(W[j - 3], 15)) ^ WT_SM3RotateLeft(W[j - 13], 7) ^ W[j - 6]) >>> 0;
    }

    for (j = 0; j < 64; j += 1) {
      W1[j] = (W[j] ^ W[j + 4]) >>> 0;
    }

    var A = state[0];
    var B = state[1];
    var C = state[2];
    var D = state[3];
    var E = state[4];
    var F = state[5];
    var G = state[6];
    var H = state[7];

    for (j = 0; j < 64; j += 1) {
      var Tj = j <= 15 ? 0x79cc4519 : 0x7a879d8a;
      var SS1 = WT_SM3RotateLeft((WT_SM3RotateLeft(A, 12) + E + WT_SM3RotateLeft(Tj, j)) >>> 0, 7);
      var SS2 = SS1 ^ WT_SM3RotateLeft(A, 12);
      var TT1 = (WT_SM3FF(A, B, C, j) + D + SS2 + W1[j]) >>> 0;
      var TT2 = (WT_SM3GG(E, F, G, j) + H + SS1 + W[j]) >>> 0;

      D = C;
      C = WT_SM3RotateLeft(B, 9);
      B = A;
      A = TT1;
      H = G;
      G = WT_SM3RotateLeft(F, 19);
      F = E;
      E = WT_SM3P0(TT2);
    }

    state[0] = (state[0] ^ A) >>> 0;
    state[1] = (state[1] ^ B) >>> 0;
    state[2] = (state[2] ^ C) >>> 0;
    state[3] = (state[3] ^ D) >>> 0;
    state[4] = (state[4] ^ E) >>> 0;
    state[5] = (state[5] ^ F) >>> 0;
    state[6] = (state[6] ^ G) >>> 0;
    state[7] = (state[7] ^ H) >>> 0;
  }

  return (
    WT_SM3WordToHex(state[0]) +
    WT_SM3WordToHex(state[1]) +
    WT_SM3WordToHex(state[2]) +
    WT_SM3WordToHex(state[3]) +
    WT_SM3WordToHex(state[4]) +
    WT_SM3WordToHex(state[5]) +
    WT_SM3WordToHex(state[6]) +
    WT_SM3WordToHex(state[7])
  );
}

function WT_Run(text) {
  var hash = WT_SM3Hex(text);
  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? WT_Base64Encode(WT_HexDecode(hash))
    : hash;
}`,
  }
}
