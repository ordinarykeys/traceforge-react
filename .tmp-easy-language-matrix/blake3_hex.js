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

if (typeof Symbol === 'undefined') {
  Symbol = { iterator: '@@iterator', toStringTag: '@@toStringTag' };
}

function WT_CreateIterator(target) {
  var index = 0;
  return {
    next: function () {
      if (index < target.length) {
        return { value: target[index++], done: false };
      }
      return { value: void 0, done: true };
    },
    'return': function () {
      return { done: true };
    }
  };
}

if (!Array.prototype[Symbol.iterator]) {
  Array.prototype[Symbol.iterator] = function () {
    return WT_CreateIterator(this);
  };
}

var module = { exports: {} };

var exports = module.exports;

module.exports=function(t){var n={};function e(r){if(n[r])return n[r].exports;var i=n[r]={i:r,l:!1,exports:{}};return t[r].call(i.exports,i,i.exports,e),i.l=!0,i.exports}return e.m=t,e.c=n,e.d=function(t,n,r){e.o(t,n)||Object.defineProperty(t,n,{enumerable:!0,get:r})},e.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},e.t=function(t,n){if(1&n&&(t=e(t)),8&n)return t;if(4&n&&"object"==typeof t&&t&&t.__esModule)return t;var r=Object.create(null);if(e.r(r),Object.defineProperty(r,"default",{enumerable:!0,value:t}),2&n&&"string"!=typeof t)for(var i in t)e.d(r,i,function(n){return t[n]}.bind(null,i));return r},e.n=function(t){var n=t&&t.__esModule?function(){return t["default"]}:function(){return t};return e.d(n,"a",n),n},e.o=function(t,n){return Object.prototype.hasOwnProperty.call(t,n)},e.p="/",e(e.s=3)}([function(t,n,e){"use strict";function r(t){return t>4294967295&&(t-=4294967296),t.toString(2).padStart(32,"0")}function i(t){return parseInt(t,2)}Object.defineProperty(n,"__esModule",{value:!0}),n.intu8=function(t){t>255&&(t-=256);return t.toString(2).padStart(8,"0")},n.intu32=r,n.intu64=function(t){return t.toString(2).padStart(64,"0")},n.bitwiseShift=function(t,n){for(var e=arguments.length>2&&void 0!==arguments[2]?arguments[2]:64,r=t.substring(0,e-n),i=0;i<n;i++)r="0"+r;return r},n.u64u32=function(t){return t.substring(32,64)},n.wrappingAdd=function(t,n){var e=i(t)+i(n);e>4294967295&&(e-=4294967296);return r(e)},n.u32hex=function(t){return parseInt(t,2).toString(16).padStart(2,"0")},n.u64int=function(t){return parseInt(t,2)},n.u32int=i,n.u8hex=function(t){return t.toString(16).padStart(2,"0")},n.rotateRight=function(t,n){return t.substring(32-n)+t.substring(0,32-n)},n.xor=function(t,n){for(var e=[],r=0;r<32;r++)e+=t.charAt(r)==n.charAt(r)?"0":"1";return e},n.or=function(t,n){for(var e=[],r=0;r<32;r++)e+="1"===t.charAt(r)||"1"===n.charAt(r)?"1":"0";return e},n.and=function(t,n){for(var e=[],r=0;r<32;r++)e+="1"===t.charAt(r)&&"1"===n.charAt(r)?"1":"0";return e},n.or64=function(t,n){for(var e=[],r=0;r<64;r++)e+="1"===t.charAt(r)||"1"===n.charAt(r)?"1":"0";return e},n.and64=function(t,n){for(var e=[],r=0;r<64;r++)e+="1"===t.charAt(r)&&"1"===n.charAt(r)?"1":"0";return e},n.first_8_words=function(t){return t.slice(0,8)},n.words_from_little_endian_bytes=function(t){for(var n=[],e=0;e<t.length;e+=4){if(void 0===t[e]||void 0===t[e+1]||void 0===t[e+2]||void 0===t[e+3])return n;n.push(t[e+3].toString(2).padStart(8,"0")+t[e+2].toString(2).padStart(8,"0")+t[e+1].toString(2).padStart(8,"0")+t[e].toString(2).padStart(8,"0"))}return n},n.little_endian_bytes_from_words=function(t){for(var n=new Uint8Array(4*t.length),e=0;e<n.length;e+=4)n[e]=parseInt(t[e].substring(24,32),2),n[e+1]=parseInt(t[e].substring(16,24),2),n[e+2]=parseInt(t[e].substring(8,16),2),n[e+3]=parseInt(t[e].substring(0,8),2);return n},n.chunkArray=function(t,n){for(var e=[],r=0;r<t.length;r+=chunk)e.push(array.slice(r,r+chunk));return e}},function(t,n,e){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.g=i,n.round=u,n.permute=o,n["default"]=function(t,n,e,i,l){var c=[t[0],t[1],t[2],t[3],t[4],t[5],t[6],t[7],a[0],a[1],a[2],a[3],(0,r.u64u32)(e),(0,r.u64u32)((0,r.bitwiseShift)(e,32)),i,l];c=u(c,n),n=o(n,s),c=u(c,n),n=o(n,s),c=u(c,n),n=o(n,s),c=u(c,n),n=o(n,s),c=u(c,n),n=o(n,s),c=u(c,n),n=o(n,s),c=u(c,n);for(var f=0;f<8;f++)c[f]=(0,r.xor)(c[f],c[f+8]),c[f+8]=(0,r.xor)(c[f+8],t[f]);return c};var r=e(0);function i(t,n,e,i,u,o,a){return t[n]=(0,r.wrappingAdd)((0,r.wrappingAdd)(t[n],t[e]),o),t[u]=(0,r.rotateRight)((0,r.xor)(t[u],t[n]),16),t[i]=(0,r.wrappingAdd)(t[i],t[u]),t[e]=(0,r.rotateRight)((0,r.xor)(t[e],t[i]),12),t[n]=(0,r.wrappingAdd)((0,r.wrappingAdd)(t[n],t[e]),a),t[u]=(0,r.rotateRight)((0,r.xor)(t[u],t[n]),8),t[i]=(0,r.wrappingAdd)(t[i],t[u]),t[e]=(0,r.rotateRight)((0,r.xor)(t[e],t[i]),7),t}function u(t,n){var e=t.slice(0);return e=i(e,0,4,8,12,n[0],n[1]),e=i(e,1,5,9,13,n[2],n[3]),e=i(e,2,6,10,14,n[4],n[5]),e=i(e,3,7,11,15,n[6],n[7]),e=i(e,0,5,10,15,n[8],n[9]),e=i(e,1,6,11,12,n[10],n[11]),e=i(e,2,7,8,13,n[12],n[13]),e=i(e,3,4,9,14,n[14],n[15])}function o(t,n){for(var e=[],r=0;r<16;r++)e[r]=t[n[r]];return e}var a=[(0,r.intu32)(1779033703),(0,r.intu32)(3144134277),(0,r.intu32)(1013904242),(0,r.intu32)(2773480762),(0,r.intu32)(1359893119),(0,r.intu32)(2600822924),(0,r.intu32)(528734635),(0,r.intu32)(1541459225)],s=[2,6,3,10,7,0,4,13,1,11,12,5,9,14,15,8]},function(t,n,e){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n["default"]=void 0;var r,i=(r=e(1))&&r.__esModule?r:{"default":r},u=e(0);function o(t){return function(t){if(Array.isArray(t)){for(var n=0,e=new Array(t.length);n<t.length;n++)e[n]=t[n];return e}}(t)||function(t){if(Symbol.iterator in Object(t)||"[object Arguments]"===Object.prototype.toString.call(t))return Array.from(t)}(t)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance")}()}function a(t,n){for(var e=0;e<n.length;e++){var r=n[e];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(t,r.key,r)}}var s=(0,u.intu32)(8),l=function(){function t(n,e,r,i,u){!function(t,n){if(!(t instanceof n))throw new TypeError("Cannot call a class as a function")}(this,t),this.input_chaining_value=n,this.block_words=e,this.counter=r,this.block_len=i,this.flags=u}var n,e,r;return n=t,(e=[{key:"chaining_value",value:function(){return(0,u.first_8_words)((0,i["default"])(this.input_chaining_value,this.block_words,this.counter,this.block_len,this.flags))}},{key:"root_output_bytes",value:function(t){for(var n=0,e=[];e.length<t;){var r=(0,i["default"])(this.input_chaining_value,this.block_words,(0,u.intu64)(n),this.block_len,(0,u.or)(this.flags,s)),a=!0,l=!1,c=void 0;try{for(var f,h=r[Symbol.iterator]();!(a=(f=h.next()).done);a=!0){var d=f.value;e=[].concat(o(e),o((0,u.little_endian_bytes_from_words)([d])))}}catch(t){l=!0,c=t}finally{try{a||null==h["return"]||h["return"]()}finally{if(l)throw c}}n+=1}return e.slice(0,t)}}])&&a(n.prototype,e),r&&a(n,r),t}();n["default"]=l},function(t,n,e){"use strict";var r=e(4);t.exports=r["default"]},function(t,n,e){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n["default"]=void 0;var r=e(0),i=o(e(5)),u=o(e(2));function o(t){return t&&t.__esModule?t:{"default":t}}function a(t,n){for(var e=0;e<n.length;e++){var r=n[e];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(t,r.key,r)}}function s(t){return function(t){if(Array.isArray(t)){for(var n=0,e=new Array(t.length);n<t.length;n++)e[n]=t[n];return e}}(t)||function(t){if(Symbol.iterator in Object(t)||"[object Arguments]"===Object.prototype.toString.call(t))return Array.from(t)}(t)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance")}()}var l=(0,r.intu32)(64),c=(0,r.intu32)(4),f=[(0,r.intu32)(1779033703),(0,r.intu32)(3144134277),(0,r.intu32)(1013904242),(0,r.intu32)(2773480762),(0,r.intu32)(1359893119),(0,r.intu32)(2600822924),(0,r.intu32)(528734635),(0,r.intu32)(1541459225)],h=(0,r.intu32)(16),d=(0,r.intu32)(32),_=(0,r.intu32)(64);function v(t,n,e,i){var o=[].concat(s(t.slice(0,8)),s(n.slice(0,8)));return new u["default"](e,o,(0,r.intu64)(0),l,(0,r.or)(c,i))}function p(t){for(var n=new Uint8Array(t.length),e=0;e<t.length;++e)n[e]=t.charCodeAt(e);return n}var g=function(){function t(n,e){!function(t,n){if(!(t instanceof n))throw new TypeError("Cannot call a class as a function")}(this,t),this.chunk_state=new i["default"](n,0,e),this.key=n,this.cv_stack=[],this.cv_stack_len=0,this.flags=e}var n,e,u;return n=t,u=[{key:"newRegular",value:function(){return new t(f,(0,r.intu32)(0))}},{key:"newKeyed",value:function(n){return"string"==typeof n?n=p(n):input=new Uint8Array(n),new t((0,r.words_from_little_endian_bytes)(n),h)}},{key:"newDeriveKey",value:function(n){var e=new t(f,d);e.update(n);var i=e.finalize(32,"bytes");return new t((0,r.words_from_little_endian_bytes)(i),_)}}],(e=[{key:"pushStack",value:function(t){this.cv_stack[this.cv_stack_len]=t,this.cv_stack_len+=1}},{key:"popStack",value:function(){return this.cv_stack_len-=1,this.cv_stack[this.cv_stack_len]}},{key:"addChunkChainingValue",value:function(t,n){for(;(0,r.u64int)(n)%2==0;)e=this.popStack(),i=t,u=this.key,o=this.flags,t=v(e,i,u,o).chaining_value(),n=(0,r.bitwiseShift)(n,1);var e,i,u,o;return this.pushStack(t),n}},{key:"update",value:function(t){for(t="string"==typeof t?p(t):new Uint8Array(t);t.length;){if(1024==this.chunk_state.len()){var n=this.chunk_state.output().chaining_value(),e=(0,r.intu64)(this.chunk_state.chunk_counter+1);this.addChunkChainingValue(n,e),this.chunk_state=new i["default"](this.key,(0,r.u64int)(e),this.flags)}var u=1024-this.chunk_state.len(),o=Math.min(u,t.length);this.chunk_state.update(t.slice(0,o)),t=o===t.length?[]:t.slice(o)}return this}},{key:"finalize",value:function(){for(var t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:32,n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"hex",e=this.chunk_state.output(),i=this.cv_stack_len;i>0;)i-=1,e=v(this.cv_stack[i],e.chaining_value(),this.key,this.flags);var u=e.root_output_bytes(t);return"hex"==n?u.map(r.u8hex).join(""):u}}])&&a(n.prototype,e),u&&a(n,u),t}();n["default"]=g},function(t,n,e){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n["default"]=void 0;var r=e(0),i=o(e(1)),u=o(e(2));function o(t){return t&&t.__esModule?t:{"default":t}}function a(t,n){for(var e=0;e<n.length;e++){var r=n[e];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(t,r.key,r)}}var s=(0,r.intu32)(1),l=(0,r.intu32)(2),c=function(){function t(n,e,i){!function(t,n){if(!(t instanceof n))throw new TypeError("Cannot call a class as a function")}(this,t),this.chaining_value=n,this.chunk_counter=e,(this.block=[]).length=64,this.block.fill((0,r.intu32)(0)),this.block_len=0,this.blocks_compressed=0,this.flags=i}var n,e,o;return n=t,(e=[{key:"len",value:function(){return 64*this.blocks_compressed+this.block_len}},{key:"start_flag",value:function(){return 0===this.blocks_compressed?s:(0,r.intu32)(0)}},{key:"update",value:function(t){for(;t.length;){if(64==this.block_len){var n=(0,r.words_from_little_endian_bytes)(this.block);this.chaining_value=(0,r.first_8_words)((0,i["default"])(this.chaining_value,n,(0,r.intu64)(this.chunk_counter),(0,r.intu32)(64),(0,r.or)(this.flags,this.start_flag()))),this.blocks_compressed+=1,(this.block=[]).length=64,this.block.fill((0,r.intu32)(0)),this.block_len=0}for(var e=64-this.block_len,u=Math.min(e,t.length),o=0;o<u;o++){var a=o+this.block_len;this.block[a]=t[o]}this.block_len+=u,t=u===t.length?[]:t.slice(u)}}},{key:"output",value:function(){var t=(0,r.words_from_little_endian_bytes)(this.block),n=new u["default"](this.chaining_value,t,(0,r.intu64)(this.chunk_counter),(0,r.intu32)(this.block_len),(0,r.or)((0,r.or)(this.flags,this.start_flag()),l));return n}}])&&a(n.prototype,e),o&&a(n,o),t}();n["default"]=c}]);

var WT_BLAKE3 = module.exports;

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
  if ("blake3" === 'blake2s') {
    return WT_BLAKE2S.blake2s(WT_String(text));
  }

  if ("blake3" === 'blake2b') {
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
