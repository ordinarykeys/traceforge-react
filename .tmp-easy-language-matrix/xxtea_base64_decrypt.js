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
  return WT_XXTeaDecrypt(text, key, "Base64");
}

WScript.Echo(String(WT_Run("JJc2gpxfZHXn3eu05GAewWm8d/E=", "0123456789abcdef")));
