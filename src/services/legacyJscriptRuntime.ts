export const LEGACY_JS_BASIC_POLYFILLS = `if (!Array.isArray) {
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
}`;

export const LEGACY_JS_BASE64_POLYFILLS = `var WT_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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
}`;

export const LEGACY_JS_TYPED_ARRAY_POLYFILLS = `if (typeof ArrayBuffer === 'undefined') {
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
}`;

export const LEGACY_JS_CRYPTO_POLYFILLS = [
  LEGACY_JS_BASIC_POLYFILLS,
  LEGACY_JS_BASE64_POLYFILLS,
  LEGACY_JS_TYPED_ARRAY_POLYFILLS,
].join('\n\n');
