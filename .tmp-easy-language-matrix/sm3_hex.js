function WT_String(value) {
  return value == null ? '' : String(value);
}

function WT_Utf8Encode(text) {
  return unescape(encodeURIComponent(WT_String(text)));
}

function WT_Utf8Decode(binary) {
  return decodeURIComponent(escape(WT_String(binary)));
}

function WT_BinaryToBytes(binary) {
  var text = WT_String(binary);
  var bytes = new Uint8Array(text.length);
  var i;

  for (i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i) & 255;
  }

  return bytes;
}

function WT_BytesToBinary(bytes) {
  var output = '';
  var i;

  for (i = 0; i < bytes.length; i += 1) {
    output += String.fromCharCode(bytes[i] & 255);
  }

  return output;
}

function WT_Utf8ToBytes(text) {
  return WT_BinaryToBytes(WT_Utf8Encode(text));
}

function WT_BytesToUtf8(bytes) {
  return WT_Utf8Decode(WT_BytesToBinary(bytes));
}

function WT_HexByte(value) {
  var hex = '0123456789abcdef';
  return hex.charAt((value >>> 4) & 15) + hex.charAt(value & 15);
}

function WT_HexEncode(binary) {
  var text = WT_String(binary);
  var output = '';
  var i;
  for (i = 0; i < text.length; i += 1) {
    output += WT_HexByte(text.charCodeAt(i) & 255);
  }
  return output;
}

function WT_HexDecode(hex) {
  var clean = WT_String(hex).replace(/\s+/g, '');
  var output = '';
  var i;
  for (i = 0; i < clean.length; i += 2) {
    output += String.fromCharCode(parseInt(clean.substr(i, 2), 16) & 255);
  }
  return output;
}

function WT_Base64Encode(binary) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var text = WT_String(binary);
  var output = '';
  var i;

  for (i = 0; i < text.length; i += 3) {
    var c1 = text.charCodeAt(i) & 255;
    var c2 = i + 1 < text.length ? text.charCodeAt(i + 1) & 255 : NaN;
    var c3 = i + 2 < text.length ? text.charCodeAt(i + 2) & 255 : NaN;
    var triplet = (c1 << 16) | ((isNaN(c2) ? 0 : c2) << 8) | (isNaN(c3) ? 0 : c3);

    output += chars.charAt((triplet >>> 18) & 63);
    output += chars.charAt((triplet >>> 12) & 63);
    output += isNaN(c2) ? '=' : chars.charAt((triplet >>> 6) & 63);
    output += isNaN(c3) ? '=' : chars.charAt(triplet & 63);
  }

  return output;
}

function WT_Base64Decode(base64Text) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var clean = WT_String(base64Text).replace(/[^A-Za-z0-9+/=]/g, '');
  var output = '';
  var i;

  for (i = 0; i < clean.length; i += 4) {
    var e1 = chars.indexOf(clean.charAt(i));
    var e2 = chars.indexOf(clean.charAt(i + 1));
    var e3 = clean.charAt(i + 2) === '=' ? -1 : chars.indexOf(clean.charAt(i + 2));
    var e4 = clean.charAt(i + 3) === '=' ? -1 : chars.indexOf(clean.charAt(i + 3));
    var triplet = (e1 << 18) | (e2 << 12) | ((e3 < 0 ? 0 : e3) << 6) | (e4 < 0 ? 0 : e4);

    output += String.fromCharCode((triplet >>> 16) & 255);
    if (e3 >= 0) {
      output += String.fromCharCode((triplet >>> 8) & 255);
    }
    if (e4 >= 0) {
      output += String.fromCharCode(triplet & 255);
    }
  }

  return output;
}

function WT_Imul(a, b) {
  var ah = (a >>> 16) & 65535;
  var al = a & 65535;
  var bh = (b >>> 16) & 65535;
  var bl = b & 65535;
  return ((al * bl) + ((((ah * bl + al * bh) & 65535) << 16) >>> 0)) | 0;
}

function WT_ToUInt32Hex(value) {
  var hex = (value >>> 0).toString(16);
  while (hex.length < 8) {
    hex = '0' + hex;
  }
  return hex;
}

function WT_ToUInt16Hex(value) {
  var hex = (value & 65535).toString(16);
  while (hex.length < 4) {
    hex = '0' + hex;
  }
  return hex;
}

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
  return "Hex" === 'Base64'
    ? WT_Base64Encode(WT_HexDecode(hash))
    : hash;
}

WScript.Echo(String(WT_Run("abc")));
