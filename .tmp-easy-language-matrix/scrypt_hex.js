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
"use strict";

(function(root) {
    var MAX_VALUE = 0x7fffffff;

    // The SHA256 and PBKDF2 implementation are from scrypt-async-js:
    // See: https://github.com/dchest/scrypt-async-js
    function SHA256(m) {
        var K = new Uint32Array([
           0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
           0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
           0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
           0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
           0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
           0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
           0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
           0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
           0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
           0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
           0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
           0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
           0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
       ]);

        var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
        var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
        var w = new Uint32Array(64);

        function blocks(p) {
            var off = 0, len = p.length;
            while (len >= 64) {
                var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7, u, i, j, t1, t2;

                for (i = 0; i < 16; i++) {
                    j = off + i*4;
                    w[i] = ((p[j] & 0xff)<<24) | ((p[j+1] & 0xff)<<16) |
                    ((p[j+2] & 0xff)<<8) | (p[j+3] & 0xff);
                }

                for (i = 16; i < 64; i++) {
                    u = w[i-2];
                    t1 = ((u>>>17) | (u<<(32-17))) ^ ((u>>>19) | (u<<(32-19))) ^ (u>>>10);

                    u = w[i-15];
                    t2 = ((u>>>7) | (u<<(32-7))) ^ ((u>>>18) | (u<<(32-18))) ^ (u>>>3);

                    w[i] = (((t1 + w[i-7]) | 0) + ((t2 + w[i-16]) | 0)) | 0;
                }

                for (i = 0; i < 64; i++) {
                    t1 = ((((((e>>>6) | (e<<(32-6))) ^ ((e>>>11) | (e<<(32-11))) ^
                             ((e>>>25) | (e<<(32-25)))) + ((e & f) ^ (~e & g))) | 0) +
                          ((h + ((K[i] + w[i]) | 0)) | 0)) | 0;

                    t2 = ((((a>>>2) | (a<<(32-2))) ^ ((a>>>13) | (a<<(32-13))) ^
                           ((a>>>22) | (a<<(32-22)))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;

                    h = g;
                    g = f;
                    f = e;
                    e = (d + t1) | 0;
                    d = c;
                    c = b;
                    b = a;
                    a = (t1 + t2) | 0;
                }

                h0 = (h0 + a) | 0;
                h1 = (h1 + b) | 0;
                h2 = (h2 + c) | 0;
                h3 = (h3 + d) | 0;
                h4 = (h4 + e) | 0;
                h5 = (h5 + f) | 0;
                h6 = (h6 + g) | 0;
                h7 = (h7 + h) | 0;

                off += 64;
                len -= 64;
            }
        }

        blocks(m);

        var i, bytesLeft = m.length % 64,
        bitLenHi = (m.length / 0x20000000) | 0,
        bitLenLo = m.length << 3,
        numZeros = (bytesLeft < 56) ? 56 : 120,
        p = m.slice(m.length - bytesLeft, m.length);

        p.push(0x80);
        for (i = bytesLeft + 1; i < numZeros; i++) { p.push(0); }
        p.push((bitLenHi >>> 24) & 0xff);
        p.push((bitLenHi >>> 16) & 0xff);
        p.push((bitLenHi >>> 8)  & 0xff);
        p.push((bitLenHi >>> 0)  & 0xff);
        p.push((bitLenLo >>> 24) & 0xff);
        p.push((bitLenLo >>> 16) & 0xff);
        p.push((bitLenLo >>> 8)  & 0xff);
        p.push((bitLenLo >>> 0)  & 0xff);

        blocks(p);

        return [
            (h0 >>> 24) & 0xff, (h0 >>> 16) & 0xff, (h0 >>> 8) & 0xff, (h0 >>> 0) & 0xff,
            (h1 >>> 24) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, (h1 >>> 0) & 0xff,
            (h2 >>> 24) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 8) & 0xff, (h2 >>> 0) & 0xff,
            (h3 >>> 24) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 8) & 0xff, (h3 >>> 0) & 0xff,
            (h4 >>> 24) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 8) & 0xff, (h4 >>> 0) & 0xff,
            (h5 >>> 24) & 0xff, (h5 >>> 16) & 0xff, (h5 >>> 8) & 0xff, (h5 >>> 0) & 0xff,
            (h6 >>> 24) & 0xff, (h6 >>> 16) & 0xff, (h6 >>> 8) & 0xff, (h6 >>> 0) & 0xff,
            (h7 >>> 24) & 0xff, (h7 >>> 16) & 0xff, (h7 >>> 8) & 0xff, (h7 >>> 0) & 0xff
        ];
    }

    function PBKDF2_HMAC_SHA256_OneIter(password, salt, dkLen) {
        // compress password if it's longer than hash block length
        password = (password.length <= 64) ? password : SHA256(password);

        var innerLen = 64 + salt.length + 4;
        var inner = new Array(innerLen);
        var outerKey = new Array(64);

        var i;
        var dk = [];

        // inner = (password ^ ipad) || salt || counter
        for (i = 0; i < 64; i++) { inner[i] = 0x36; }
        for (i = 0; i < password.length; i++) { inner[i] ^= password[i]; }
        for (i = 0; i < salt.length; i++) { inner[64 + i] = salt[i]; }
        for (i = innerLen - 4; i < innerLen; i++) { inner[i] = 0; }

        // outerKey = password ^ opad
        for (i = 0; i < 64; i++) outerKey[i] = 0x5c;
        for (i = 0; i < password.length; i++) outerKey[i] ^= password[i];

        // increments counter inside inner
        function incrementCounter() {
            for (var i = innerLen - 1; i >= innerLen - 4; i--) {
                inner[i]++;
                if (inner[i] <= 0xff) return;
                inner[i] = 0;
            }
        }

        // output blocks = SHA256(outerKey || SHA256(inner)) ...
        while (dkLen >= 32) {
            incrementCounter();
            dk = dk.concat(SHA256(outerKey.concat(SHA256(inner))));
            dkLen -= 32;
        }
        if (dkLen > 0) {
            incrementCounter();
            dk = dk.concat(SHA256(outerKey.concat(SHA256(inner))).slice(0, dkLen));
        }

        return dk;
    }

    // The following is an adaptation of scryptsy
    // See: https://www.npmjs.com/package/scryptsy
    function blockmix_salsa8(BY, Yi, r, x, _X) {
        var i;

        arraycopy(BY, (2 * r - 1) * 16, _X, 0, 16);
        for (i = 0; i < 2 * r; i++) {
            blockxor(BY, i * 16, _X, 16);
            salsa20_8(_X, x);
            arraycopy(_X, 0, BY, Yi + (i * 16), 16);
        }

        for (i = 0; i < r; i++) {
            arraycopy(BY, Yi + (i * 2) * 16, BY, (i * 16), 16);
        }

        for (i = 0; i < r; i++) {
            arraycopy(BY, Yi + (i * 2 + 1) * 16, BY, (i + r) * 16, 16);
        }
    }

    function R(a, b) {
        return (a << b) | (a >>> (32 - b));
    }

    function salsa20_8(B, x) {
        arraycopy(B, 0, x, 0, 16);

        for (var i = 8; i > 0; i -= 2) {
            x[ 4] ^= R(x[ 0] + x[12], 7);
            x[ 8] ^= R(x[ 4] + x[ 0], 9);
            x[12] ^= R(x[ 8] + x[ 4], 13);
            x[ 0] ^= R(x[12] + x[ 8], 18);
            x[ 9] ^= R(x[ 5] + x[ 1], 7);
            x[13] ^= R(x[ 9] + x[ 5], 9);
            x[ 1] ^= R(x[13] + x[ 9], 13);
            x[ 5] ^= R(x[ 1] + x[13], 18);
            x[14] ^= R(x[10] + x[ 6], 7);
            x[ 2] ^= R(x[14] + x[10], 9);
            x[ 6] ^= R(x[ 2] + x[14], 13);
            x[10] ^= R(x[ 6] + x[ 2], 18);
            x[ 3] ^= R(x[15] + x[11], 7);
            x[ 7] ^= R(x[ 3] + x[15], 9);
            x[11] ^= R(x[ 7] + x[ 3], 13);
            x[15] ^= R(x[11] + x[ 7], 18);
            x[ 1] ^= R(x[ 0] + x[ 3], 7);
            x[ 2] ^= R(x[ 1] + x[ 0], 9);
            x[ 3] ^= R(x[ 2] + x[ 1], 13);
            x[ 0] ^= R(x[ 3] + x[ 2], 18);
            x[ 6] ^= R(x[ 5] + x[ 4], 7);
            x[ 7] ^= R(x[ 6] + x[ 5], 9);
            x[ 4] ^= R(x[ 7] + x[ 6], 13);
            x[ 5] ^= R(x[ 4] + x[ 7], 18);
            x[11] ^= R(x[10] + x[ 9], 7);
            x[ 8] ^= R(x[11] + x[10], 9);
            x[ 9] ^= R(x[ 8] + x[11], 13);
            x[10] ^= R(x[ 9] + x[ 8], 18);
            x[12] ^= R(x[15] + x[14], 7);
            x[13] ^= R(x[12] + x[15], 9);
            x[14] ^= R(x[13] + x[12], 13);
            x[15] ^= R(x[14] + x[13], 18);
        }

        for (var i = 0; i < 16; ++i) {
            B[i] += x[i];
        }
    }

    // naive approach... going back to loop unrolling may yield additional performance
    function blockxor(S, Si, D, len) {
        for (var i = 0; i < len; i++) {
            D[i] ^= S[Si + i]
        }
    }

    function arraycopy(src, srcPos, dest, destPos, length) {
        while (length--) {
            dest[destPos++] = src[srcPos++];
        }
    }

    function checkBufferish(o) {
        if (!o || typeof(o.length) !== 'number') { return false; }

        for (var i = 0; i < o.length; i++) {
            var v = o[i];
            if (typeof(v) !== 'number' || v % 1 || v < 0 || v >= 256) {
                return false;
            }
        }

        return true;
    }

    function ensureInteger(value, name) {
        if (typeof(value) !== "number" || (value % 1)) { throw new Error('invalid ' + name); }
        return value;
    }

    // N = Cpu cost, r = Memory cost, p = parallelization cost
    // callback(error, progress, key)
    function _scrypt(password, salt, N, r, p, dkLen, callback) {

        N = ensureInteger(N, 'N');
        r = ensureInteger(r, 'r');
        p = ensureInteger(p, 'p');

        dkLen = ensureInteger(dkLen, 'dkLen');

        if (N === 0 || (N & (N - 1)) !== 0) { throw new Error('N must be power of 2'); }

        if (N > MAX_VALUE / 128 / r) { throw new Error('N too large'); }
        if (r > MAX_VALUE / 128 / p) { throw new Error('r too large'); }

        if (!checkBufferish(password)) {
            throw new Error('password must be an array or buffer');
        }
        password = Array.prototype.slice.call(password);

        if (!checkBufferish(salt)) {
            throw new Error('salt must be an array or buffer');
        }
        salt = Array.prototype.slice.call(salt);

        var b = PBKDF2_HMAC_SHA256_OneIter(password, salt, p * 128 * r);
        var B = new Uint32Array(p * 32 * r)
        for (var i = 0; i < B.length; i++) {
            var j = i * 4;
            B[i] = ((b[j + 3] & 0xff) << 24) |
                   ((b[j + 2] & 0xff) << 16) |
                   ((b[j + 1] & 0xff) << 8) |
                   ((b[j + 0] & 0xff) << 0);
        }

        var XY = new Uint32Array(64 * r);
        var V = new Uint32Array(32 * r * N);

        var Yi = 32 * r;

        // scratch space
        var x = new Uint32Array(16);       // salsa20_8
        var _X = new Uint32Array(16);      // blockmix_salsa8

        var totalOps = p * N * 2;
        var currentOp = 0;
        var lastPercent10 = null;

        // Set this to true to abandon the scrypt on the next step
        var stop = false;

        // State information
        var state = 0;
        var i0 = 0, i1;
        var Bi;

        // How many blockmix_salsa8 can we do per step?
        var limit = callback ? parseInt(1000 / r): 0xffffffff;

        // Trick from scrypt-async; if there is a setImmediate shim in place, use it
        var nextTick = (typeof(setImmediate) !== 'undefined') ? setImmediate : setTimeout;

        // This is really all I changed; making scryptsy a state machine so we occasionally
        // stop and give other evnts on the evnt loop a chance to run. ~RicMoo
        var incrementalSMix = function() {
            if (stop) {
                return callback(new Error('cancelled'), currentOp / totalOps);
            }

            var steps;

            switch (state) {
                case 0:
                    // for (var i = 0; i < p; i++)...
                    Bi = i0 * 32 * r;

                    arraycopy(B, Bi, XY, 0, Yi);                       // ROMix - 1

                    state = 1;                                         // Move to ROMix 2
                    i1 = 0;

                    // Fall through

                case 1:

                    // Run up to 1000 steps of the first inner smix loop
                    steps = N - i1;
                    if (steps > limit) { steps = limit; }
                    for (var i = 0; i < steps; i++) {                  // ROMix - 2
                        arraycopy(XY, 0, V, (i1 + i) * Yi, Yi)         // ROMix - 3
                        blockmix_salsa8(XY, Yi, r, x, _X);             // ROMix - 4
                    }

                    // for (var i = 0; i < N; i++)
                    i1 += steps;
                    currentOp += steps;

                    if (callback) {
                        // Call the callback with the progress (optionally stopping us)
                        var percent10 = parseInt(1000 * currentOp / totalOps);
                        if (percent10 !== lastPercent10) {
                            stop = callback(null, currentOp / totalOps);
                            if (stop) { break; }
                            lastPercent10 = percent10;
                        }
                    }

                    if (i1 < N) { break; }

                    i1 = 0;                                          // Move to ROMix 6
                    state = 2;

                    // Fall through

                case 2:

                    // Run up to 1000 steps of the second inner smix loop
                    steps = N - i1;
                    if (steps > limit) { steps = limit; }
                    for (var i = 0; i < steps; i++) {                // ROMix - 6
                        var offset = (2 * r - 1) * 16;             // ROMix - 7
                        var j = XY[offset] & (N - 1);
                        blockxor(V, j * Yi, XY, Yi);                 // ROMix - 8 (inner)
                        blockmix_salsa8(XY, Yi, r, x, _X);           // ROMix - 9 (outer)
                    }

                    // for (var i = 0; i < N; i++)...
                    i1 += steps;
                    currentOp += steps;

                    // Call the callback with the progress (optionally stopping us)
                    if (callback) {
                        var percent10 = parseInt(1000 * currentOp / totalOps);
                        if (percent10 !== lastPercent10) {
                            stop = callback(null, currentOp / totalOps);
                            if (stop) { break; }
                            lastPercent10 = percent10;
                        }
                    }

                    if (i1 < N) { break; }

                    arraycopy(XY, 0, B, Bi, Yi);                     // ROMix - 10

                    // for (var i = 0; i < p; i++)...
                    i0++;
                    if (i0 < p) {
                        state = 0;
                        break;
                    }

                    b = [];
                    for (var i = 0; i < B.length; i++) {
                        b.push((B[i] >>  0) & 0xff);
                        b.push((B[i] >>  8) & 0xff);
                        b.push((B[i] >> 16) & 0xff);
                        b.push((B[i] >> 24) & 0xff);
                    }

                    var derivedKey = PBKDF2_HMAC_SHA256_OneIter(password, b, dkLen);

                    // Send the result to the callback
                    if (callback) { callback(null, 1.0, derivedKey); }

                    // Done; don't break (which would reschedule)
                    return derivedKey;
            }

            // Schedule the next steps
            if (callback) { nextTick(incrementalSMix); }
        }

        // Run the smix state machine until completion
        if (!callback) {
            while (true) {
                var derivedKey = incrementalSMix();
                if (derivedKey != undefined) { return derivedKey; }
            }
        }

        // Bootstrap the async incremental smix
        incrementalSMix();
    }

    var lib = {
        scrypt: function(password, salt, N, r, p, dkLen, progressCallback) {
            return new Promise(function(resolve, reject) {
                var lastProgress = 0;
                if (progressCallback) { progressCallback(0); }
                _scrypt(password, salt, N, r, p, dkLen, function(error, progress, key) {
                    if (error) {
                        reject(error);
                    } else if (key) {
                        if (progressCallback && lastProgress !== 1) {
                            progressCallback(1);
                        }
                        resolve(new Uint8Array(key));
                    } else if (progressCallback && progress !== lastProgress) {
                        lastProgress = progress;
                        return progressCallback(progress);
                    }
                });
            });
        },
        syncScrypt: function(password, salt, N, r, p, dkLen) {
            return new Uint8Array(_scrypt(password, salt, N, r, p, dkLen));
        }
    };

    // node.js
    if (typeof(exports) !== 'undefined') {
       module.exports = lib;

    // RequireJS/AMD
    // http://www.requirejs.org/docs/api.html
    // https://github.com/amdjs/amdjs-api/wiki/AMD
    } else if (typeof(define) === 'function' && define.amd) {
        define(lib);

    // Web Browsers
    } else if (root) {

        // If there was an existing library "scrypt", make sure it is still available
        if (root.scrypt) {
            root._scrypt = root.scrypt;
        }

        root.scrypt = lib;
    }

})(this);

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

function WT_ScryptUtf8Bytes(text) {
  var binary = WT_Utf8Encode(WT_String(text));
  var result = [];
  var i;

  for (i = 0; i < binary.length; i += 1) {
    result.push(binary.charCodeAt(i) & 255);
  }

  return result;
}

function WT_Run(text, salt) {
  var passwordBytes = WT_ScryptUtf8Bytes(text);
  var saltBytes = WT_ScryptUtf8Bytes(salt);
  var derived = scrypt.syncScrypt(
    passwordBytes,
    saltBytes,
    16,
    1,
    1,
    4
  );
  var hex = '';
  var i;

  for (i = 0; i < derived.length; i += 1) {
    hex += WT_HexByte(derived[i] & 255);
  }

  return "Hex" === 'Base64'
    ? WT_Base64Encode(WT_HexDecode(hex))
    : hex;
}

WScript.Echo(String(WT_Run("password", "salt")));
