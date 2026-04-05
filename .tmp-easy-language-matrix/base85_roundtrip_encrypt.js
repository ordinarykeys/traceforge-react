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
  var clean = WT_String(text).replace(/\s+/g, '');
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
  return WT_Base85Encode(text);
}

WScript.Echo(String(WT_Run("Hello <>&\"' 123")));
