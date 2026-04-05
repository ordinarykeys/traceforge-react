if (!Array.isArray) {
  Array.isArray = function (value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  };
}

if (typeof self === 'undefined') {
  self = this;
}

if (!Object.create) {
  Object.create = function (proto) {
    function F() {}
    F.prototype = proto;
    return new F();
  };
}

if (!Object.setPrototypeOf) {
  Object.setPrototypeOf = function (target, proto) {
    target.__super__ = proto;
    var key;
    for (key in proto) {
      if (proto.hasOwnProperty && proto.hasOwnProperty(key) && !(key in target)) {
        target[key] = proto[key];
      }
    }
    return target;
  };
}

if (!Object.getPrototypeOf) {
  Object.getPrototypeOf = function (obj) {
    return obj.__super__ || obj.__proto__ || (obj.constructor ? obj.constructor.prototype : null);
  };
}

var WT_CAN_DEFINE_PROPERTY = false;

try {
  var WT_DEFINE_PROPERTY_TEST = {};
  Object.defineProperty(WT_DEFINE_PROPERTY_TEST, 'ok', {
    value: true
  });
  WT_CAN_DEFINE_PROPERTY = WT_DEFINE_PROPERTY_TEST.ok === true;
} catch (error) {}

if (!WT_CAN_DEFINE_PROPERTY) {
  Object.defineProperty = function (obj, prop, descriptor) {
    if (descriptor) {
      if (descriptor.get) {
        obj[prop] = descriptor.get();
      } else if ('value' in descriptor) {
        obj[prop] = descriptor.value;
      }
    }
    return obj;
  };
}

if (!Array.prototype.fill) {
  Array.prototype.fill = function (value) {
    var i;
    for (i = 0; i < this.length; i += 1) {
      this[i] = value;
    }
    return this;
  };
}

if (!Array.from) {
  Array.from = function (value) {
    var result = [];
    var i;
    for (i = 0; i < value.length; i += 1) {
      result.push(value[i]);
    }
    return result;
  };
}

if (!Array.prototype.map) {
  Array.prototype.map = function (callback) {
    var result = [];
    var i;
    for (i = 0; i < this.length; i += 1) {
      result.push(callback(this[i], i, this));
    }
    return result;
  };
}

if (!Array.prototype.reduce) {
  Array.prototype.reduce = function (callback, initialValue) {
    var i = 0;
    var acc = initialValue;

    if (arguments.length < 2) {
      acc = this[0];
      i = 1;
    }

    for (; i < this.length; i += 1) {
      acc = callback(acc, this[i], i, this);
    }

    return acc;
  };
}

if (!String.fromCodePoint) {
  String.fromCodePoint = function (value) {
    return String.fromCharCode(value);
  };
}

if (!String.prototype.padStart) {
  String.prototype.padStart = function (targetLength, padString) {
    var output = String(this);
    var fill = padString == null ? ' ' : String(padString);

    while (output.length < targetLength) {
      output = fill + output;
    }

    if (output.length > targetLength) {
      output = output.substring(output.length - targetLength);
    }

    return output;
  };
}

if (!String.prototype.codePointAt) {
  String.prototype.codePointAt = function (index) {
    return this.charCodeAt(index);
  };
}

if (typeof TextEncoder === 'undefined') {
  TextEncoder = function () {};

  TextEncoder.prototype.encode = function (text) {
    var input = String(text);
    var encoded = unescape(encodeURIComponent(input));
    var bytes = [];
    var i;

    for (i = 0; i < encoded.length; i += 1) {
      bytes.push(encoded.charCodeAt(i) & 255);
    }

    return new Uint8Array(bytes);
  };
}

if (typeof TextDecoder === 'undefined') {
  TextDecoder = function () {};

  TextDecoder.prototype.decode = function (value) {
    var bytes = value && typeof value.length === 'number' ? value : [];
    var text = '';
    var i;

    for (i = 0; i < bytes.length; i += 1) {
      text += String.fromCharCode(bytes[i] & 255);
    }

    return decodeURIComponent(escape(text));
  };
}

if (typeof setTimeout === 'undefined') {
  setTimeout = function (fn) {
    fn();
    return 0;
  };
}

if (typeof clearTimeout === 'undefined') {
  clearTimeout = function () {};
}

if (typeof setImmediate === 'undefined') {
  setImmediate = function (fn) {
    fn();
    return 0;
  };
}

var WT_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

if (typeof btoa === 'undefined') {
  btoa = function (text) {
    var output = '';
    var i;

    for (i = 0; i < text.length; i += 3) {
      var c1 = text.charCodeAt(i) & 255;
      var c2 = i + 1 < text.length ? text.charCodeAt(i + 1) & 255 : 0;
      var c3 = i + 2 < text.length ? text.charCodeAt(i + 2) & 255 : 0;
      var triplet = (c1 << 16) | (c2 << 8) | c3;

      output += WT_BASE64.charAt((triplet >>> 18) & 63);
      output += WT_BASE64.charAt((triplet >>> 12) & 63);
      output += i + 1 < text.length ? WT_BASE64.charAt((triplet >>> 6) & 63) : '=';
      output += i + 2 < text.length ? WT_BASE64.charAt(triplet & 63) : '=';
    }

    return output;
  };
}

if (typeof atob === 'undefined') {
  atob = function (text) {
    var clean = String(text).replace(/[^A-Za-z0-9+/=]/g, '');
    var output = '';
    var i;

    for (i = 0; i < clean.length; i += 4) {
      var e1 = WT_BASE64.indexOf(clean.charAt(i));
      var e2 = WT_BASE64.indexOf(clean.charAt(i + 1));
      var e3 = clean.charAt(i + 2) === '=' ? -1 : WT_BASE64.indexOf(clean.charAt(i + 2));
      var e4 = clean.charAt(i + 3) === '=' ? -1 : WT_BASE64.indexOf(clean.charAt(i + 3));
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
  };
}

if (typeof ArrayBuffer === 'undefined') {
  ArrayBuffer = function (length) {
    var i;
    this.byteLength = length || 0;
    this._bytes = [];
    for (i = 0; i < this.byteLength; i += 1) {
      this._bytes[i] = 0;
    }
  };
}

function WT_AttachByteArrayMethods(arr, buffer, byteOffset, length) {
  arr.buffer = buffer;
  arr.byteOffset = byteOffset || 0;
  arr.byteLength = length;

  arr.subarray = function (start, end) {
    var begin = start || 0;
    var finish = end == null ? this.length : end;
    var result = [];
    var i;

    if (begin < 0) {
      begin = this.length + begin;
    }
    if (finish < 0) {
      finish = this.length + finish;
    }

    for (i = begin; i < finish && i < this.length; i += 1) {
      result.push(this[i] & 255);
    }

    return new Uint8Array(result);
  };

  arr.slice = function (start, end) {
    return this.subarray(start, end);
  };

  arr.set = function (source, offset) {
    var start = offset || 0;
    var i;

    for (i = 0; i < source.length; i += 1) {
      this[start + i] = source[i] & 255;
      this.buffer._bytes[this.byteOffset + start + i] = this[start + i];
    }
  };

  return arr;
}

if (typeof Uint8Array === 'undefined') {
  Uint8Array = function (value) {
    var i;
    var length;
    var buffer;
    var arr;

    if (typeof value === 'number') {
      buffer = new ArrayBuffer(value);
      arr = buffer._bytes;
      for (i = 0; i < value; i += 1) {
        arr[i] = 0;
      }
      arr.length = value;
      return WT_AttachByteArrayMethods(arr, buffer, 0, value);
    }

    if (value && value._bytes) {
      arr = value._bytes;
      arr.length = value.byteLength;
      return WT_AttachByteArrayMethods(arr, value, 0, value.byteLength);
    }

    length = value && typeof value.length === 'number' ? value.length : 0;
    buffer = new ArrayBuffer(length);
    arr = buffer._bytes;
    for (i = 0; i < length; i += 1) {
      arr[i] = value[i] & 255;
    }
    arr.length = length;
    return WT_AttachByteArrayMethods(arr, buffer, 0, length);
  };
}

if (typeof Uint32Array === 'undefined') {
  Uint32Array = function (value) {
    var i;
    var length;
    var arr = [];

    if (typeof value === 'number') {
      length = value;
      for (i = 0; i < length; i += 1) {
        arr[i] = 0;
      }
    } else {
      length = value && typeof value.length === 'number' ? value.length : 0;
      for (i = 0; i < length; i += 1) {
        arr[i] = value[i] >>> 0;
      }
    }

    arr.length = length;
    arr.fill = Array.prototype.fill;
    arr.subarray = function (start, end) {
      var begin = start || 0;
      var finish = end == null ? this.length : end;
      var result = [];
      var i;

      if (begin < 0) {
        begin = this.length + begin;
      }
      if (finish < 0) {
        finish = this.length + finish;
      }

      for (i = begin; i < finish && i < this.length; i += 1) {
        result.push(this[i] >>> 0);
      }

      return new Uint32Array(result);
    };
    arr.slice = function (start, end) {
      return this.subarray(start, end);
    };
    arr.set = function (source, offset) {
      var start = offset || 0;
      var i;
      for (i = 0; i < source.length; i += 1) {
        this[start + i] = source[i] >>> 0;
      }
    };

    return arr;
  };
}

if (typeof Int32Array === 'undefined') {
  Int32Array = Uint32Array;
}

if (typeof DataView === 'undefined') {
  DataView = function (buffer, byteOffset, byteLength) {
    this.buffer = buffer;
    this.byteOffset = byteOffset || 0;
    this.byteLength = byteLength == null ? (buffer.byteLength - this.byteOffset) : byteLength;
  };

  DataView.prototype.getUint32 = function (offset, littleEndian) {
    var index = this.byteOffset + offset;
    var bytes = this.buffer._bytes;

    if (littleEndian) {
      return ((bytes[index + 3] & 255) << 24) | ((bytes[index + 2] & 255) << 16) | ((bytes[index + 1] & 255) << 8) | (bytes[index] & 255);
    }

    return ((bytes[index] & 255) << 24) | ((bytes[index + 1] & 255) << 16) | ((bytes[index + 2] & 255) << 8) | (bytes[index + 3] & 255);
  };
}

var WT_Console = typeof console !== "undefined" ? console : { log: function () {}, error: function () {} };

var WT_BLAKEJS_UTIL_MODULE = { exports: {} };

(function (module, exports, console) {

var ERROR_MSG_INPUT = 'Input must be an string, Buffer or Uint8Array'

// For convenience, var people hash a string, not just a Uint8Array
function normalizeInput (input) {
  var ret
  if (input instanceof Uint8Array) {
    ret = input
  } else if (typeof input === 'string') {
    var encoder = new TextEncoder()
    ret = encoder.encode(input)
  } else {
    throw new Error(ERROR_MSG_INPUT)
  }
  return ret
}

// Converts a Uint8Array to a hexadecimal string
// For example, toHex([255, 0, 255]) returns "ff00ff"
function toHex (bytes) {
  return Array.prototype.map
    .call(bytes, function (n) {
      return (n < 16 ? '0' : '') + n.toString(16)
    })
    .join('')
}

// Converts any value in [0...2^32-1] to an 8-character hex string
function uint32ToHex (val) {
  return (0x100000000 + val).toString(16).substring(1)
}

// For debugging: prints out hash state in the same format as the RFC
// sample computation exactly, so that you can diff
function debugPrint (label, arr, size) {
  var msg = '\n' + label + ' = '
  for (var i = 0; i < arr.length; i += 2) {
    if (size === 32) {
      msg += uint32ToHex(arr[i]).toUpperCase()
      msg += ' '
      msg += uint32ToHex(arr[i + 1]).toUpperCase()
    } else if (size === 64) {
      msg += uint32ToHex(arr[i + 1]).toUpperCase()
      msg += uint32ToHex(arr[i]).toUpperCase()
    } else throw new Error('Invalid size ' + size)
    if (i % 6 === 4) {
      msg += '\n' + new Array(label.length + 4).join(' ')
    } else if (i < arr.length - 2) {
      msg += ' '
    }
  }
  console.log(msg)
}

// For performance testing: generates N bytes of input, hashes M times
// Measures and prints MB/second hash performance each time
function testSpeed (hashFn, N, M) {
  var startMs = new Date().getTime()

  var input = new Uint8Array(N)
  for (var i = 0; i < N; i++) {
    input[i] = i % 256
  }
  var genMs = new Date().getTime()
  console.log('Generated random input in ' + (genMs - startMs) + 'ms')
  startMs = genMs

  for (var i = 0; i < M; i++) {
    var hashHex = hashFn(input)
    var hashMs = new Date().getTime()
    var ms = hashMs - startMs
    startMs = hashMs
    console.log('Hashed in ' + ms + 'ms: ' + hashHex.substring(0, 20) + '...')
    console.log(
      Math.round((N / (1 << 20) / (ms / 1000)) * 100) / 100 + ' MB PER SECOND'
    )
  }
}

module.exports = {
  normalizeInput: normalizeInput,
  toHex: toHex,
  debugPrint: debugPrint,
  testSpeed: testSpeed
}

}(WT_BLAKEJS_UTIL_MODULE, WT_BLAKEJS_UTIL_MODULE.exports, WT_Console));

function WT_BLAKEJS_REQUIRE(path) {

  if (path === './util') {

    return WT_BLAKEJS_UTIL_MODULE.exports;

  }

  throw new Error('Unsupported BLAKEJS module: ' + path);

}

var WT_BLAKE2S_MODULE = { exports: {} };

(function (require, module, exports, console) {

// BLAKE2s hash function in pure Javascript
// Adapted from the reference implementation in RFC7693
// Ported to Javascript by DC - https://github.com/dcposch

var util = require('./util')

// Little-endian byte access.
// Expects a Uint8Array and an index
// Returns the little-endian uint32 at v[i..i+3]
function B2S_GET32 (v, i) {
  return v[i] ^ (v[i + 1] << 8) ^ (v[i + 2] << 16) ^ (v[i + 3] << 24)
}

// Mixing function G.
function B2S_G (a, b, c, d, x, y) {
  v[a] = v[a] + v[b] + x
  v[d] = ROTR32(v[d] ^ v[a], 16)
  v[c] = v[c] + v[d]
  v[b] = ROTR32(v[b] ^ v[c], 12)
  v[a] = v[a] + v[b] + y
  v[d] = ROTR32(v[d] ^ v[a], 8)
  v[c] = v[c] + v[d]
  v[b] = ROTR32(v[b] ^ v[c], 7)
}

// 32-bit right rotation
// x should be a uint32
// y must be between 1 and 31, inclusive
function ROTR32 (x, y) {
  return (x >>> y) ^ (x << (32 - y))
}

// Initialization Vector.
var BLAKE2S_IV = new Uint32Array([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19
])

var SIGMA = new Uint8Array([
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  14,
  10,
  4,
  8,
  9,
  15,
  13,
  6,
  1,
  12,
  0,
  2,
  11,
  7,
  5,
  3,
  11,
  8,
  12,
  0,
  5,
  2,
  15,
  13,
  10,
  14,
  3,
  6,
  7,
  1,
  9,
  4,
  7,
  9,
  3,
  1,
  13,
  12,
  11,
  14,
  2,
  6,
  5,
  10,
  4,
  0,
  15,
  8,
  9,
  0,
  5,
  7,
  2,
  4,
  10,
  15,
  14,
  1,
  11,
  12,
  6,
  8,
  3,
  13,
  2,
  12,
  6,
  10,
  0,
  11,
  8,
  3,
  4,
  13,
  7,
  5,
  15,
  14,
  1,
  9,
  12,
  5,
  1,
  15,
  14,
  13,
  4,
  10,
  0,
  7,
  6,
  3,
  9,
  2,
  8,
  11,
  13,
  11,
  7,
  14,
  12,
  1,
  3,
  9,
  5,
  0,
  15,
  4,
  8,
  6,
  2,
  10,
  6,
  15,
  14,
  9,
  11,
  3,
  0,
  8,
  12,
  2,
  13,
  7,
  1,
  4,
  10,
  5,
  10,
  2,
  8,
  4,
  7,
  6,
  1,
  5,
  15,
  11,
  9,
  14,
  3,
  12,
  13,
  0
])

// Compression function. "last" flag indicates last block
var v = new Uint32Array(16)
var m = new Uint32Array(16)
function blake2sCompress (ctx, last) {
  var i = 0
  for (i = 0; i < 8; i++) {
    // init work variables
    v[i] = ctx.h[i]
    v[i + 8] = BLAKE2S_IV[i]
  }

  v[12] ^= ctx.t // low 32 bits of offset
  v[13] ^= ctx.t / 0x100000000 // high 32 bits
  if (last) {
    // last block flag set ?
    v[14] = ~v[14]
  }

  for (i = 0; i < 16; i++) {
    // get little-endian words
    m[i] = B2S_GET32(ctx.b, 4 * i)
  }

  // ten rounds of mixing
  // uncomment the DebugPrint calls to log the computation
  // and match the RFC sample documentation
  // util.debugPrint('          m[16]', m, 32)
  for (i = 0; i < 10; i++) {
    // util.debugPrint('   (i=' + i + ')  v[16]', v, 32)
    B2S_G(0, 4, 8, 12, m[SIGMA[i * 16 + 0]], m[SIGMA[i * 16 + 1]])
    B2S_G(1, 5, 9, 13, m[SIGMA[i * 16 + 2]], m[SIGMA[i * 16 + 3]])
    B2S_G(2, 6, 10, 14, m[SIGMA[i * 16 + 4]], m[SIGMA[i * 16 + 5]])
    B2S_G(3, 7, 11, 15, m[SIGMA[i * 16 + 6]], m[SIGMA[i * 16 + 7]])
    B2S_G(0, 5, 10, 15, m[SIGMA[i * 16 + 8]], m[SIGMA[i * 16 + 9]])
    B2S_G(1, 6, 11, 12, m[SIGMA[i * 16 + 10]], m[SIGMA[i * 16 + 11]])
    B2S_G(2, 7, 8, 13, m[SIGMA[i * 16 + 12]], m[SIGMA[i * 16 + 13]])
    B2S_G(3, 4, 9, 14, m[SIGMA[i * 16 + 14]], m[SIGMA[i * 16 + 15]])
  }
  // util.debugPrint('   (i=10) v[16]', v, 32)

  for (i = 0; i < 8; i++) {
    ctx.h[i] ^= v[i] ^ v[i + 8]
  }
  // util.debugPrint('h[8]', ctx.h, 32)
}

// Creates a BLAKE2s hashing context
// Requires an output length between 1 and 32 bytes
// Takes an optional Uint8Array key
function blake2sInit (outlen, key) {
  if (!(outlen > 0 && outlen <= 32)) {
    throw new Error('Incorrect output length, should be in [1, 32]')
  }
  var keylen = key ? key.length : 0
  if (key && !(keylen > 0 && keylen <= 32)) {
    throw new Error('Incorrect key length, should be in [1, 32]')
  }

  var ctx = {
    h: new Uint32Array(BLAKE2S_IV), // hash state
    b: new Uint8Array(64), // input block
    c: 0, // pointer within block
    t: 0, // input count
    outlen: outlen // output length in bytes
  }
  ctx.h[0] ^= 0x01010000 ^ (keylen << 8) ^ outlen

  if (keylen > 0) {
    blake2sUpdate(ctx, key)
    ctx.c = 64 // at the end
  }

  return ctx
}

// Updates a BLAKE2s streaming hash
// Requires hash context and Uint8Array (byte array)
function blake2sUpdate (ctx, input) {
  for (var i = 0; i < input.length; i++) {
    if (ctx.c === 64) {
      // buffer full ?
      ctx.t += ctx.c // add counters
      blake2sCompress(ctx, false) // compress (not last)
      ctx.c = 0 // counter to zero
    }
    ctx.b[ctx.c++] = input[i]
  }
}

// Completes a BLAKE2s streaming hash
// Returns a Uint8Array containing the message digest
function blake2sFinal (ctx) {
  ctx.t += ctx.c // mark last block offset
  while (ctx.c < 64) {
    // fill up with zeros
    ctx.b[ctx.c++] = 0
  }
  blake2sCompress(ctx, true) // final block flag = 1

  // little endian convert and store
  var out = new Uint8Array(ctx.outlen)
  for (var i = 0; i < ctx.outlen; i++) {
    out[i] = (ctx.h[i >> 2] >> (8 * (i & 3))) & 0xff
  }
  return out
}

// Computes the BLAKE2S hash of a string or byte array, and returns a Uint8Array
//
// Returns a n-byte Uint8Array
//
// Parameters:
// - input - the input bytes, as a string, Buffer, or Uint8Array
// - key - optional key Uint8Array, up to 32 bytes
// - outlen - optional output length in bytes, default 64
function blake2s (input, key, outlen) {
  // preprocess inputs
  outlen = outlen || 32
  input = util.normalizeInput(input)

  // do the math
  var ctx = blake2sInit(outlen, key)
  blake2sUpdate(ctx, input)
  return blake2sFinal(ctx)
}

// Computes the BLAKE2S hash of a string or byte array
//
// Returns an n-byte hash in hex, all lowercase
//
// Parameters:
// - input - the input bytes, as a string, Buffer, or Uint8Array
// - key - optional key Uint8Array, up to 32 bytes
// - outlen - optional output length in bytes, default 64
function blake2sHex (input, key, outlen) {
  var output = blake2s(input, key, outlen)
  return util.toHex(output)
}

module.exports = {
  blake2s: blake2s,
  blake2sHex: blake2sHex,
  blake2sInit: blake2sInit,
  blake2sUpdate: blake2sUpdate,
  blake2sFinal: blake2sFinal
}

}(WT_BLAKEJS_REQUIRE, WT_BLAKE2S_MODULE, WT_BLAKE2S_MODULE.exports, WT_Console));

var WT_BLAKE2S = WT_BLAKE2S_MODULE.exports;

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

function WT_BlakeDigest(text) {
  if ("blake2s" === 'blake2s') {
    return WT_BLAKE2S.blake2s(WT_String(text));
  }

  if ("blake2s" === 'blake2b') {
    return WT_BLAKE2B.blake2b(WT_String(text));
  }

  return WT_BLAKE3.newRegular().update(WT_Utf8ToBytes(text)).finalize(32, 'bytes');
}

function WT_Run(text) {
  var digest = WT_BlakeDigest(WT_String(text));
  var binary = WT_BytesToBinary(digest);

  return "Hex" === 'Base64'
    ? WT_Base64Encode(binary)
    : WT_HexEncode(binary);
}

WScript.Echo(String(WT_Run("abc")));
