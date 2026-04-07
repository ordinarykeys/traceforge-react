import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildAesGcmEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_AES_GCM',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'key', comment: '参数2' },
      { name: 'iv', comment: '参数3' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('key')}, ${quoteParam('iv')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_AesGcmParseBytes(value, encoding) {
  if (encoding === 'Hex') {
    return WT_AesGcmBinaryToBytes(WT_HexDecode(WT_String(value)));
  }

  if (encoding === 'Base64') {
    return WT_AesGcmBinaryToBytes(WT_Base64Decode(WT_String(value)));
  }

  return WT_AesGcmUtf8Bytes(value);
}

function WT_AesGcmBinaryToBytes(binary) {
  var text = WT_String(binary);
  var bytes = [];
  var i;

  for (i = 0; i < text.length; i += 1) {
    bytes.push(text.charCodeAt(i) & 255);
  }

  return bytes;
}

function WT_AesGcmBytesToBinary(bytes) {
  var output = '';
  var i;

  for (i = 0; i < bytes.length; i += 1) {
    output += String.fromCharCode(bytes[i] & 255);
  }

  return output;
}

function WT_AesGcmUtf8Bytes(text) {
  return WT_AesGcmBinaryToBytes(WT_Utf8Encode(text));
}

function WT_AesGcmZeroBytes(length) {
  var bytes = [];
  var i;

  for (i = 0; i < length; i += 1) {
    bytes.push(0);
  }

  return bytes;
}

function WT_AesGcmConcat(left, right) {
  var result = [];
  var i;

  for (i = 0; i < left.length; i += 1) {
    result.push(left[i] & 255);
  }

  for (i = 0; i < right.length; i += 1) {
    result.push(right[i] & 255);
  }

  return result;
}

function WT_AesGcmOutput(bytes, encoding) {
  var binary = WT_AesGcmBytesToBinary(bytes);
  return encoding === 'Hex'
    ? WT_HexEncode(binary)
    : WT_Base64Encode(binary);
}

function WT_BytesToWordArray(bytes) {
  return CryptoJS.enc.Latin1.parse(WT_AesGcmBytesToBinary(bytes));
}

function WT_WordArrayToBytes(wordArray) {
  return WT_AesGcmBinaryToBytes(wordArray.toString(CryptoJS.enc.Latin1));
}

function WT_AesEncryptBlock(blockBytes, keyWords) {
  var encrypted = CryptoJS.AES.encrypt(WT_BytesToWordArray(blockBytes), keyWords, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding
  });
  return WT_WordArrayToBytes(encrypted.ciphertext);
}

function WT_BlockBytesToWords(blockBytes) {
  var words = [0, 0, 0, 0];
  var i;

  for (i = 0; i < 4; i += 1) {
    words[i] =
      ((blockBytes[i * 4] & 255) << 24) |
      ((blockBytes[i * 4 + 1] & 255) << 16) |
      ((blockBytes[i * 4 + 2] & 255) << 8) |
      (blockBytes[i * 4 + 3] & 255);
  }

  return words;
}

function WT_BlockWordsToBytes(words) {
  var bytes = WT_AesGcmZeroBytes(16);
  var i;

  for (i = 0; i < 4; i += 1) {
    bytes[i * 4] = (words[i] >>> 24) & 255;
    bytes[i * 4 + 1] = (words[i] >>> 16) & 255;
    bytes[i * 4 + 2] = (words[i] >>> 8) & 255;
    bytes[i * 4 + 3] = words[i] & 255;
  }

  return bytes;
}

function WT_GcmXorWords(left, right) {
  return [
    (left[0] ^ right[0]) >>> 0,
    (left[1] ^ right[1]) >>> 0,
    (left[2] ^ right[2]) >>> 0,
    (left[3] ^ right[3]) >>> 0
  ];
}

function WT_GcmShiftRight(words) {
  var carry = 0;
  var i;

  for (i = 0; i < 4; i += 1) {
    var nextCarry = (words[i] & 1) ? 0x80000000 : 0;
    words[i] = ((words[i] >>> 1) | carry) >>> 0;
    carry = nextCarry;
  }
}

function WT_GcmMultiply(xWords, yWords) {
  var z = [0, 0, 0, 0];
  var v = [yWords[0], yWords[1], yWords[2], yWords[3]];
  var wordIndex;
  var bitIndex;

  for (wordIndex = 0; wordIndex < 4; wordIndex += 1) {
    var word = xWords[wordIndex] >>> 0;

    for (bitIndex = 31; bitIndex >= 0; bitIndex -= 1) {
      if (((word >>> bitIndex) & 1) === 1) {
        z = WT_GcmXorWords(z, v);
      }

      var lsb = v[3] & 1;
      WT_GcmShiftRight(v);
      if (lsb) {
        v[0] = (v[0] ^ 0xe1000000) >>> 0;
      }
    }
  }

  return z;
}

function WT_GcmUpdate(hashWords, hWords, bytes) {
  var offset = 0;

  while (offset < bytes.length) {
    var block = WT_AesGcmZeroBytes(16);
    var size = Math.min(16, bytes.length - offset);
    var i;

    for (i = 0; i < size; i += 1) {
      block[i] = bytes[offset + i];
    }

    hashWords = WT_GcmMultiply(
      WT_GcmXorWords(hashWords, WT_BlockBytesToWords(block)),
      hWords
    );
    offset += size;
  }

  return hashWords;
}

function WT_GcmWriteUint64(bytes, offset, value) {
  var high = Math.floor(value / 0x100000000);
  var low = value >>> 0;

  bytes[offset] = (high >>> 24) & 255;
  bytes[offset + 1] = (high >>> 16) & 255;
  bytes[offset + 2] = (high >>> 8) & 255;
  bytes[offset + 3] = high & 255;
  bytes[offset + 4] = (low >>> 24) & 255;
  bytes[offset + 5] = (low >>> 16) & 255;
  bytes[offset + 6] = (low >>> 8) & 255;
  bytes[offset + 7] = low & 255;
}

function WT_GcmFinishHash(hashWords, hWords, cipherLength) {
  var lengthBlock = WT_AesGcmZeroBytes(16);
  WT_GcmWriteUint64(lengthBlock, 0, 0);
  WT_GcmWriteUint64(lengthBlock, 8, cipherLength * 8);

  return WT_GcmMultiply(
    WT_GcmXorWords(hashWords, WT_BlockBytesToWords(lengthBlock)),
    hWords
  );
}

function WT_GcmInc32(counter) {
  var index = 15;

  while (index >= 12) {
    counter[index] = (counter[index] + 1) & 255;
    if (counter[index] !== 0) {
      break;
    }
    index -= 1;
  }
}

function WT_GcmJ0(hWords, ivBytes) {
  if (ivBytes.length === 12) {
    var fast = WT_AesGcmZeroBytes(16);
    var i;
    for (i = 0; i < ivBytes.length; i += 1) {
      fast[i] = ivBytes[i] & 255;
    }
    fast[15] = 1;
    return fast;
  }

  var hashWords = [0, 0, 0, 0];
  hashWords = WT_GcmUpdate(hashWords, hWords, ivBytes);
  hashWords = WT_GcmFinishHash(hashWords, hWords, ivBytes.length);
  return WT_BlockWordsToBytes(hashWords);
}

function WT_GcmComputeTag(keyWords, hWords, j0, cipherBytes) {
  var hashWords = [0, 0, 0, 0];
  hashWords = WT_GcmUpdate(hashWords, hWords, cipherBytes);
  hashWords = WT_GcmFinishHash(hashWords, hWords, cipherBytes.length);

  return WT_BlockWordsToBytes(
    WT_GcmXorWords(hashWords, WT_BlockBytesToWords(WT_AesEncryptBlock(j0, keyWords)))
  );
}

function WT_GcmCrypt(keyWords, j0, inputBytes) {
  var output = WT_AesGcmZeroBytes(inputBytes.length);
  var counter = j0.slice(0);
  var offset = 0;
  var i;

  WT_GcmInc32(counter);

  while (offset < inputBytes.length) {
    var keystream = WT_AesEncryptBlock(counter, keyWords);
    var size = Math.min(16, inputBytes.length - offset);

    for (i = 0; i < size; i += 1) {
      output[offset + i] = (inputBytes[offset + i] ^ keystream[i]) & 255;
    }

    offset += size;
    WT_GcmInc32(counter);
  }

  return output;
}

function WT_GcmTagsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  var diff = 0;
  var i;

  for (i = 0; i < left.length; i += 1) {
    diff |= (left[i] ^ right[i]);
  }

  return diff === 0;
}

function WT_Run(text, key, iv) {
  var keyBytes = WT_AesGcmParseBytes(key, ${JSON.stringify(params.keyEncoding)});
  var ivBytes = WT_AesGcmParseBytes(iv, ${JSON.stringify(params.ivEncoding)});
  var keyWords = WT_BytesToWordArray(keyBytes);
  var hWords = WT_BlockBytesToWords(WT_AesEncryptBlock(WT_AesGcmZeroBytes(16), keyWords));
  var j0 = WT_GcmJ0(hWords, ivBytes);

  if (${params.isEncrypt ? 'true' : 'false'}) {
    var plainBytes = WT_AesGcmUtf8Bytes(text);
    var cipherBytes = WT_GcmCrypt(keyWords, j0, plainBytes);
    var tagBytes = WT_GcmComputeTag(keyWords, hWords, j0, cipherBytes);
    return WT_AesGcmOutput(
      WT_AesGcmConcat(cipherBytes, tagBytes),
      ${JSON.stringify(params.outputEncoding)}
    );
  }

  var combined = WT_AesGcmParseBytes(text, ${JSON.stringify(params.outputEncoding)});
  if (combined.length < 16) {
    throw new Error('AES-GCM input is too short');
  }

  var cipherOnly = combined.slice(0, combined.length - 16);
  var providedTag = combined.slice(combined.length - 16);
  var expectedTag = WT_GcmComputeTag(keyWords, hWords, j0, cipherOnly);

  if (!WT_GcmTagsEqual(providedTag, expectedTag)) {
    throw new Error('AES-GCM tag verification failed');
  }

  return WT_BytesToUtf8(WT_GcmCrypt(keyWords, j0, cipherOnly));
}`,
  }
}
