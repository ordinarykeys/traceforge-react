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
!function(r,n){"object"==typeof exports&&"object"==typeof module?module.exports=n():"function"==typeof define&&define.amd?define([],n):"object"==typeof exports?exports.sm4=n():r.sm4=n()}("undefined"!=typeof self?self:this,function(){return function(r){function n(e){if(t[e])return t[e].exports;var o=t[e]={i:e,l:!1,exports:{}};return r[e].call(o.exports,o,o.exports,n),o.l=!0,o.exports}var t={};return n.m=r,n.c=t,n.d=function(r,t,e){n.o(r,t)||Object.defineProperty(r,t,{configurable:!1,enumerable:!0,get:e})},n.n=function(r){var t=r&&r.__esModule?function(){return r["default"]}:function(){return r};return n.d(t,"a",t),t},n.o=function(r,n){return Object.prototype.hasOwnProperty.call(r,n)},n.p="",n(n.s=7)}({7:function(r,n,t){"use strict";function e(r){if(Array.isArray(r)){for(var n=0,t=Array(r.length);n<r.length;n++)t[n]=r[n];return t}return Array.from(r)}function o(r){for(var n=[],t=0,e=r.length;t<e;t+=2)n.push(parseInt(r.substr(t,2),16));return n}function i(r){return r.map(function(r){return r=r.toString(16),1===r.length?"0"+r:r}).join("")}function u(r){for(var n=[],t=0,e=r.length;t<e;t++){var o=r.codePointAt(t);if(o<=127)n.push(o);else if(o<=2047)n.push(192|o>>>6),n.push(128|63&o);else if(o<=55295||o>=57344&&o<=65535)n.push(224|o>>>12),n.push(128|o>>>6&63),n.push(128|63&o);else{if(!(o>=65536&&o<=1114111))throw n.push(o),new Error("input is not supported");t++,n.push(240|o>>>18&28),n.push(128|o>>>12&63),n.push(128|o>>>6&63),n.push(128|63&o)}}return n}function f(r){for(var n=[],t=0,e=r.length;t<e;t++)r[t]>=240&&r[t]<=247?(n.push(String.fromCodePoint(((7&r[t])<<18)+((63&r[t+1])<<12)+((63&r[t+2])<<6)+(63&r[t+3]))),t+=3):r[t]>=224&&r[t]<=239?(n.push(String.fromCodePoint(((15&r[t])<<12)+((63&r[t+1])<<6)+(63&r[t+2]))),t+=2):r[t]>=192&&r[t]<=223?(n.push(String.fromCodePoint(((31&r[t])<<6)+(63&r[t+1]))),t++):n.push(String.fromCodePoint(r[t]));return n.join("")}function s(r,n){var t=31&n;return r<<t|r>>>32-t}function c(r){return(255&w[r>>>24&255])<<24|(255&w[r>>>16&255])<<16|(255&w[r>>>8&255])<<8|255&w[255&r]}function p(r){return r^s(r,2)^s(r,10)^s(r,18)^s(r,24)}function a(r){return r^s(r,13)^s(r,23)}function h(r,n,t){for(var e=new Array(4),o=new Array(4),i=0;i<4;i++)o[0]=255&r[4*i],o[1]=255&r[4*i+1],o[2]=255&r[4*i+2],o[3]=255&r[4*i+3],e[i]=o[0]<<24|o[1]<<16|o[2]<<8|o[3];for(var u,f=0;f<32;f+=4)u=e[1]^e[2]^e[3]^t[f+0],e[0]^=p(c(u)),u=e[2]^e[3]^e[0]^t[f+1],e[1]^=p(c(u)),u=e[3]^e[0]^e[1]^t[f+2],e[2]^=p(c(u)),u=e[0]^e[1]^e[2]^t[f+3],e[3]^=p(c(u));for(var s=0;s<16;s+=4)n[s]=e[3-s/4]>>>24&255,n[s+1]=e[3-s/4]>>>16&255,n[s+2]=e[3-s/4]>>>8&255,n[s+3]=255&e[3-s/4]}function l(r,n,t){for(var e=new Array(4),o=new Array(4),i=0;i<4;i++)o[0]=255&r[0+4*i],o[1]=255&r[1+4*i],o[2]=255&r[2+4*i],o[3]=255&r[3+4*i],e[i]=o[0]<<24|o[1]<<16|o[2]<<8|o[3];e[0]^=2746333894,e[1]^=1453994832,e[2]^=1736282519,e[3]^=2993693404;for(var u,f=0;f<32;f+=4)u=e[1]^e[2]^e[3]^m[f+0],n[f+0]=e[0]^=a(c(u)),u=e[2]^e[3]^e[0]^m[f+1],n[f+1]=e[1]^=a(c(u)),u=e[3]^e[0]^e[1]^m[f+2],n[f+2]=e[2]^=a(c(u)),u=e[0]^e[1]^e[2]^m[f+3],n[f+3]=e[3]^=a(c(u));if(t===d)for(var s,p=0;p<16;p++)s=n[p],n[p]=n[31-p],n[31-p]=s}function v(r,n,t){var s=arguments.length>3&&void 0!==arguments[3]?arguments[3]:{},c=s.padding,p=void 0===c?"pkcs#7":c,a=s.mode,v=s.iv,w=void 0===v?[]:v,m=s.output,b=void 0===m?"string":m;if("cbc"===a&&("string"==typeof w&&(w=o(w)),16!==w.length))throw new Error("iv is invalid");if("string"==typeof n&&(n=o(n)),16!==n.length)throw new Error("key is invalid");if(r="string"==typeof r?t!==d?u(r):o(r):[].concat(e(r)),("pkcs#5"===p||"pkcs#7"===p)&&t!==d)for(var A=y-r.length%y,x=0;x<A;x++)r.push(A);var j=new Array(g);l(n,j,t);for(var P=[],k=w,S=r.length,C=0;S>=y;){var E=r.slice(C,C+16),O=new Array(16);if("cbc"===a)for(var _=0;_<y;_++)t!==d&&(E[_]^=k[_]);h(E,O,j);for(var I=0;I<y;I++)"cbc"===a&&t===d&&(O[I]^=k[I]),P[C+I]=O[I];"cbc"===a&&(k=t!==d?O:E),S-=y,C+=y}if(("pkcs#5"===p||"pkcs#7"===p)&&t===d){for(var M=P.length,q=P[M-1],z=1;z<=q;z++)if(P[M-z]!==q)throw new Error("padding is invalid");P.splice(M-q,q)}return"array"!==b?t!==d?i(P):f(P):P}var d=0,g=32,y=16,w=[214,144,233,254,204,225,61,183,22,182,20,194,40,251,44,5,43,103,154,118,42,190,4,195,170,68,19,38,73,134,6,153,156,66,80,244,145,239,152,122,51,84,11,67,237,207,172,98,228,179,28,169,201,8,232,149,128,223,148,250,117,143,63,166,71,7,167,252,243,115,23,186,131,89,60,25,230,133,79,168,104,107,129,178,113,100,218,139,248,235,15,75,112,86,157,53,30,36,14,94,99,88,209,162,37,34,124,59,1,33,120,135,212,0,70,87,159,211,39,82,76,54,2,231,160,196,200,158,234,191,138,210,64,199,56,181,163,247,242,206,249,97,21,161,224,174,93,164,155,52,26,85,173,147,50,48,245,140,177,227,29,246,226,46,130,102,202,96,192,41,35,171,13,83,78,111,213,219,55,69,222,253,142,47,3,255,106,114,109,108,91,81,141,27,175,146,187,221,188,127,17,217,92,65,31,16,90,216,10,193,49,136,165,205,123,189,45,116,208,18,184,229,180,176,137,105,151,74,12,150,119,126,101,185,241,9,197,110,198,132,24,240,125,236,58,220,77,32,121,238,95,62,215,203,57,72],m=[462357,472066609,943670861,1415275113,1886879365,2358483617,2830087869,3301692121,3773296373,4228057617,404694573,876298825,1347903077,1819507329,2291111581,2762715833,3234320085,3705924337,4177462797,337322537,808926789,1280531041,1752135293,2223739545,2695343797,3166948049,3638552301,4110090761,269950501,741554753,1213159005,1684763257];r.exports={encrypt:function(r,n,t){return v(r,n,1,t)},decrypt:function(r,n,t){return v(r,n,0,t)}}}})});

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

function WT_IsHex32(value) {
  return /^[0-9a-fA-F]{32}$/.test(value);
}

function WT_Sm4NormalizeHex(value, label) {
  var clean = WT_String(value).replace(/\s+/g, '');
  var binary;

  if (WT_IsHex32(clean)) {
    return clean.toLowerCase();
  }

  binary = WT_Utf8Encode(WT_String(value));
  if (binary.length !== 16) {
    throw new Error(label + ' must be 16-byte UTF-8 text or 32-character hex');
  }

  return WT_HexEncode(binary);
}

function WT_Sm4HexToBase64(hex) {
  return WT_Base64Encode(WT_HexDecode(hex));
}

function WT_Sm4Base64ToHex(base64Text) {
  return WT_HexEncode(WT_Base64Decode(base64Text));
}

function WT_Sm4Options(iv) {
  var options = {};

  if ("ecb" === 'cbc') {
    options.mode = 'cbc';
    options.iv = WT_Sm4NormalizeHex(iv, 'SM4 iv');
  }

  return options;
}

function WT_Run(text, key, iv) {
  var normalizedKey = WT_Sm4NormalizeHex(key, 'SM4 key');
  var options = WT_Sm4Options(iv);

  if (true) {
    var encrypted = sm4.encrypt(String(text), normalizedKey, options);
    return "Hex" === 'Base64'
      ? WT_Sm4HexToBase64(encrypted)
      : encrypted;
  }

  var input = "Hex" === 'Base64'
    ? WT_Sm4Base64ToHex(String(text))
    : String(text);
  return sm4.decrypt(input, normalizedKey, options);
}

WScript.Echo(String(WT_Run("Hello <>&\"' 123", "0123456789abcdef", "")));
