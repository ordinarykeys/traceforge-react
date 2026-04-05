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

function WT_IsArray(value) {
  return Object.prototype.toString.call(value) === '[object Array]';
}

function WT_JsonEscape(text) {
  return WT_String(text)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function WT_JsonStringify(value, indent, level) {
  var i;
  var nextIndent;
  var currentIndent;
  var parts;

  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return '"' + WT_JsonEscape(value) + '"';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (WT_IsArray(value)) {
    if (!value.length) {
      return '[]';
    }

    nextIndent = indent + level;
    parts = [];
    for (i = 0; i < value.length; i += 1) {
      parts.push(nextIndent + WT_JsonStringify(value[i], indent, level));
    }
    return '[\n' + parts.join(',\n') + '\n' + indent + ']';
  }

  nextIndent = indent + level;
  currentIndent = indent;
  parts = [];
  for (i in value) {
    if (Object.prototype.hasOwnProperty.call(value, i)) {
      parts.push(nextIndent + '"' + WT_JsonEscape(i) + '": ' + WT_JsonStringify(value[i], nextIndent, level));
    }
  }

  if (!parts.length) {
    return '{}';
  }

  return '{\n' + parts.join(',\n') + '\n' + currentIndent + '}';
}

function WT_DecimalNormalize(text) {
  var value = WT_String(text).replace(/^0+/, '');
  return value === '' ? '0' : value;
}

function WT_DecimalAddStrings(a, b) {
  var left = WT_DecimalNormalize(a);
  var right = WT_DecimalNormalize(b);
  var carry = 0;
  var result = '';
  var i = left.length - 1;
  var j = right.length - 1;
  var sum;

  while (i >= 0 || j >= 0 || carry > 0) {
    sum = carry;
    if (i >= 0) {
      sum += left.charCodeAt(i) - 48;
      i -= 1;
    }
    if (j >= 0) {
      sum += right.charCodeAt(j) - 48;
      j -= 1;
    }
    result = String.fromCharCode(48 + (sum % 10)) + result;
    carry = Math.floor(sum / 10);
  }

  return WT_DecimalNormalize(result);
}

function WT_DecimalMulSmall(text, multiplier) {
  var source = WT_DecimalNormalize(text);
  var carry = 0;
  var result = '';
  var i;
  var value;

  if (multiplier === 0 || source === '0') {
    return '0';
  }

  for (i = source.length - 1; i >= 0; i -= 1) {
    value = (source.charCodeAt(i) - 48) * multiplier + carry;
    result = String.fromCharCode(48 + (value % 10)) + result;
    carry = Math.floor(value / 10);
  }

  while (carry > 0) {
    result = String.fromCharCode(48 + (carry % 10)) + result;
    carry = Math.floor(carry / 10);
  }

  return WT_DecimalNormalize(result);
}

function WT_DecimalDivModSmall(text, divisor) {
  var source = WT_DecimalNormalize(text);
  var quotient = '';
  var remainder = 0;
  var i;
  var value;
  var digit;

  for (i = 0; i < source.length; i += 1) {
    value = remainder * 10 + (source.charCodeAt(i) - 48);
    digit = Math.floor(value / divisor);
    if (digit !== 0 || quotient !== '') {
      quotient += String.fromCharCode(48 + digit);
    }
    remainder = value % divisor;
  }

  return {
    quotient: quotient === '' ? '0' : quotient,
    remainder: remainder
  };
}

function WT_ReadVarint(binary, index) {
  var result = '0';
  var factor = '1';
  var position = index;
  var byteValue;
  var part;

  while (position < binary.length) {
    byteValue = binary.charCodeAt(position) & 255;
    part = byteValue & 127;
    result = WT_DecimalAddStrings(result, WT_DecimalMulSmall(factor, part));
    position += 1;
    if ((byteValue & 128) === 0) {
      break;
    }
    factor = WT_DecimalMulSmall(factor, 128);
  }

  return {
    value: WT_DecimalNormalize(result),
    index: position
  };
}

function WT_ReadFixed32(binary, index) {
  var value =
    (binary.charCodeAt(index) & 255) |
    ((binary.charCodeAt(index + 1) & 255) << 8) |
    ((binary.charCodeAt(index + 2) & 255) << 16) |
    ((binary.charCodeAt(index + 3) & 255) << 24);
  return WT_ToUInt32Hex(value >>> 0);
}

function WT_ReadFixed64(binary, index) {
  var output = '';
  var i;
  for (i = 7; i >= 0; i -= 1) {
    output += WT_HexByte(binary.charCodeAt(index + i) & 255);
  }
  return '0x' + output;
}

function WT_TryUtf8(binary) {
  try {
    return WT_Utf8Decode(binary);
  } catch (error) {
    return null;
  }
}

function WT_StoreField(result, key, value) {
  if (!Object.prototype.hasOwnProperty.call(result, key)) {
    result[key] = value;
    return;
  }

  if (!WT_IsArray(result[key])) {
    result[key] = [result[key]];
  }
  result[key].push(value);
}

function WT_TryParseNested(binary, depth) {
  var parsed;
  if (depth >= 4 || binary.length === 0) {
    return null;
  }

  try {
    parsed = WT_ParseProtobuf(binary, depth + 1);
    if (parsed && parsed.__ok) {
      delete parsed.__ok;
      return parsed;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function WT_TryParseLengthDelimited(binary, depth) {
  var text = WT_TryUtf8(binary);
  var nested;

  if (text !== null && /^[\x20-\x7E\u4e00-\u9fa5\s]+$/.test(text)) {
    return text;
  }

  nested = WT_TryParseNested(binary, depth);
  if (nested !== null) {
    return nested;
  }

  return WT_HexEncode(binary);
}

function WT_ParseProtobuf(binary, depth) {
  var result = {};
  var cursor = 0;
  var tagInfo;
  var tagParts;
  var fieldKey;
  var wireType;
  var lengthInfo;
  var lengthValue;
  var chunk;

  while (cursor < binary.length) {
    tagInfo = WT_ReadVarint(binary, cursor);
    cursor = tagInfo.index;
    tagParts = WT_DecimalDivModSmall(tagInfo.value, 8);
    fieldKey = 'field_' + tagParts.quotient;
    wireType = tagParts.remainder;

    if (wireType === 0) {
      lengthInfo = WT_ReadVarint(binary, cursor);
      cursor = lengthInfo.index;
      WT_StoreField(result, fieldKey, lengthInfo.value);
      continue;
    }

    if (wireType === 1) {
      if (cursor + 8 > binary.length) {
        throw new Error('Unexpected end while reading fixed64');
      }
      WT_StoreField(result, fieldKey, WT_ReadFixed64(binary, cursor));
      cursor += 8;
      continue;
    }

    if (wireType === 2) {
      lengthInfo = WT_ReadVarint(binary, cursor);
      cursor = lengthInfo.index;
      lengthValue = parseInt(lengthInfo.value, 10);
      if (isNaN(lengthValue) || cursor + lengthValue > binary.length) {
        throw new Error('Unexpected end while reading length-delimited field');
      }
      chunk = binary.substr(cursor, lengthValue);
      cursor += lengthValue;
      WT_StoreField(result, fieldKey, WT_TryParseLengthDelimited(chunk, depth));
      continue;
    }

    if (wireType === 5) {
      if (cursor + 4 > binary.length) {
        throw new Error('Unexpected end while reading fixed32');
      }
      WT_StoreField(result, fieldKey, WT_ReadFixed32(binary, cursor));
      cursor += 4;
      continue;
    }

    throw new Error('Unsupported wire type: ' + wireType);
  }

  result.__ok = true;
  return result;
}

function WT_EncodeVarintDecimal(value) {
  var text = WT_DecimalNormalize(String(value));
  var output = '';
  var parts;
  var byteValue;

  if (text === '0') {
    return String.fromCharCode(0);
  }

  while (text !== '0') {
    parts = WT_DecimalDivModSmall(text, 128);
    text = parts.quotient;
    byteValue = parts.remainder;
    if (text !== '0') {
      byteValue |= 128;
    }
    output += String.fromCharCode(byteValue);
  }

  return output;
}

function WT_EncodeLengthDelimited(binary) {
  return WT_EncodeVarintDecimal(binary.length) + binary;
}

function WT_EncodeMessage(value) {
  var output = '';
  var key;
  var match;
  var items;
  var i;
  var tagValue;
  var item;
  var nestedBinary;

  for (key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    match = /^field_(\d+)$/.exec(key);
    if (!match) {
      continue;
    }

    tagValue = parseInt(match[1], 10);
    items = WT_IsArray(value[key]) ? value[key] : [value[key]];

    for (i = 0; i < items.length; i += 1) {
      item = items[i];
      if (typeof item === 'number') {
        output += WT_EncodeVarintDecimal(tagValue * 8);
        output += WT_EncodeVarintDecimal(String(item));
      } else if (typeof item === 'string') {
        output += WT_EncodeVarintDecimal(tagValue * 8 + 2);
        output += WT_EncodeLengthDelimited(WT_Utf8Encode(item));
      } else if (typeof item === 'object' && item !== null) {
        nestedBinary = WT_EncodeMessage(item);
        output += WT_EncodeVarintDecimal(tagValue * 8 + 2);
        output += WT_EncodeLengthDelimited(nestedBinary);
      }
    }
  }

  return output;
}

function WT_Run(text) {
  if (false) {
    var binary = "hex" === 'base64'
      ? WT_Base64Decode(String(text))
      : WT_HexDecode(String(text));
    var parsed = WT_ParseProtobuf(binary, 0);
    delete parsed.__ok;
    return WT_JsonStringify(parsed, '', '  ');
  }

  return WT_HexEncode(WT_EncodeMessage(eval('(' + String(text) + ')')));
}

WScript.Echo(String(WT_Run("{\"field_1\":150,\"field_2\":\"test\"}")));
