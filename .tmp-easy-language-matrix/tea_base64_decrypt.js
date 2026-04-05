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
    sum = (sum + delta) >>> 0;
      v0 = (v0 + ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0;
      v1 = (v1 + ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0;
  }

  return WT_TeaWordToString(v0) + WT_TeaWordToString(v1);
}

function WT_TeaDecryptBlock(v0, v1, keyWords) {
  var delta = 0x9e3779b9;
  var sum = (delta * 32) >>> 0;
  var i;

  for (i = 0; i < 32; i += 1) {
    v1 = (v1 - ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0;
      v0 = (v0 - ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0;
      sum = (sum - delta) >>> 0;
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
  return WT_TeaDecrypt(text, key, "Base64");
}

WScript.Echo(String(WT_Run("XJLkndKqo4SVoHYn+YH1NQ==", "0123456789abcdef")));
