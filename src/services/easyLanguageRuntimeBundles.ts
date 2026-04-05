import blake2bSource from 'blakejs/blake2b.js?raw'
import blake2sSource from 'blakejs/blake2s.js?raw'
import blakeJsUtilSource from 'blakejs/util.js?raw'
import blake3BundleSource from 'blake3-js/dist/main.js?raw'
import jsSha3Source from 'js-sha3/src/sha3.js?raw'
import jsrsasignBundleSource from 'jsrsasign/lib/jsrsasign.js?raw'
import sm2BundleSource from 'sm-crypto/dist/sm2.js?raw'
import sm4BundleSource from 'sm-crypto/dist/sm4.js?raw'
import scryptBundleSource from 'scrypt-js/scrypt.js?raw'

import {
  LEGACY_JS_BASIC_POLYFILLS,
  LEGACY_JS_CRYPTO_POLYFILLS,
} from './legacyJscriptRuntime'

const bundleCache: Record<string, string> = {}

const LEGACY_JS_ITERATOR_POLYFILLS = `if (typeof Symbol === 'undefined') {
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
}`

const stripSourceMapComment = (source: string): string => {
  return source.replace(/^\/\/# sourceMappingURL=.*$/gm, '').trim()
}

const stripLegacyTrailingCommas = (source: string): string => {
  return source.replace(/,(\s*[}\]])/g, '$1')
}

const escapeLegacyNonAscii = (source: string): string => {
  return source.replace(/[\u0080-\uFFFF]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}

const normalizeLegacyRegexWildcards = (source: string): string => {
  return source.replace(/\[\^\]\*/g, '[\\s\\S]*')
}

const toLegacyVarSource = (source: string): string => {
  return stripSourceMapComment(source)
    .replace(/\bconst\b/g, 'var')
    .replace(/\blet\b/g, 'var')
}

const patchLegacyBlake2bSource = (source: string): string => {
  return toLegacyVarSource(source)
    .replace(
      '  v[a] = o0\n  v[a + 1] = o1',
      '  v[a] = o0 >>> 0\n  v[a + 1] = o1 >>> 0'
    )
    .replace(
      '  v[a] = o0\n  v[a + 1] = o1',
      '  v[a] = o0 >>> 0\n  v[a + 1] = o1 >>> 0'
    )
    .replace(
      '  return arr[i] ^ (arr[i + 1] << 8) ^ (arr[i + 2] << 16) ^ (arr[i + 3] << 24)',
      '  return (arr[i] ^ (arr[i + 1] << 8) ^ (arr[i + 2] << 16) ^ (arr[i + 3] << 24)) >>> 0'
    )
    .replace('  v[d] = xor1', '  v[d] = xor1 >>> 0')
    .replace('  v[d + 1] = xor0', '  v[d + 1] = xor0 >>> 0')
    .replace('  v[b] = (xor0 >>> 24) ^ (xor1 << 8)', '  v[b] = ((xor0 >>> 24) ^ (xor1 << 8)) >>> 0')
    .replace('  v[b + 1] = (xor1 >>> 24) ^ (xor0 << 8)', '  v[b + 1] = ((xor1 >>> 24) ^ (xor0 << 8)) >>> 0')
    .replace('  v[d] = (xor0 >>> 16) ^ (xor1 << 16)', '  v[d] = ((xor0 >>> 16) ^ (xor1 << 16)) >>> 0')
    .replace('  v[d + 1] = (xor1 >>> 16) ^ (xor0 << 16)', '  v[d + 1] = ((xor1 >>> 16) ^ (xor0 << 16)) >>> 0')
    .replace('  v[b] = (xor1 >>> 31) ^ (xor0 << 1)', '  v[b] = ((xor1 >>> 31) ^ (xor0 << 1)) >>> 0')
    .replace('  v[b + 1] = (xor0 >>> 31) ^ (xor1 << 1)', '  v[b + 1] = ((xor0 >>> 31) ^ (xor1 << 1)) >>> 0')
    .replace('    v[i] = ctx.h[i]', '    v[i] = ctx.h[i] >>> 0')
    .replace('    v[i + 16] = BLAKE2B_IV32[i]', '    v[i + 16] = BLAKE2B_IV32[i] >>> 0')
    .replace('  v[24] = v[24] ^ ctx.t', '  v[24] = (v[24] ^ ctx.t) >>> 0')
    .replace('  v[25] = v[25] ^ (ctx.t / 0x100000000)', '  v[25] = (v[25] ^ (ctx.t / 0x100000000)) >>> 0')
    .replace('    v[28] = ~v[28]', '    v[28] = (~v[28]) >>> 0')
    .replace('    v[29] = ~v[29]', '    v[29] = (~v[29]) >>> 0')
    .replace('    m[i] = B2B_GET32(ctx.b, 4 * i)', '    m[i] = B2B_GET32(ctx.b, 4 * i) >>> 0')
    .replace('    ctx.h[i] = ctx.h[i] ^ v[i] ^ v[i + 16]', '    ctx.h[i] = (ctx.h[i] ^ v[i] ^ v[i + 16]) >>> 0')
    .replace(/(\b(?:v|m|ctx\.h)\[[^\]]+\])\s*=\s*([^;\n]+)/g, '$1 = ($2) >>> 0')
}

const patchJsSha3Source = (source: string): string => {
  return source.replace(
    /var isView = \(ARRAY_BUFFER && \(root\.JS_SHA3_NO_ARRAY_BUFFER_IS_VIEW \|\| !ArrayBuffer\.isView\)\)\s*\? function \(obj\) \{\s*return typeof obj === 'object' && obj\.buffer && obj\.buffer\.constructor === ArrayBuffer;\s*\}\s*:\s*ArrayBuffer\.isView;/,
    `var isView = (ARRAY_BUFFER && (root.JS_SHA3_NO_ARRAY_BUFFER_IS_VIEW || !ArrayBuffer.isView))
    ? function (obj) {
        return typeof obj === 'object' && obj.buffer && obj.buffer.constructor === ArrayBuffer;
      }
    : function () {
        return false;
      };`
  )
}

const patchLegacyDefaultKeywords = (source: string): string => {
  return source
    .replace(/\.default\b/g, '["default"]')
    .replace(/\.return\b/g, '["return"]')
    .replace(/([\{,])default:/g, '$1"default":')
}

const patchLegacyBlake3Source = (source: string): string => {
  return patchLegacyDefaultKeywords(stripSourceMapComment(source))
    .replace(
      'n.xor=function(t,n){for(var e=[],r=0;r<32;r++)e+=t[r]==n[r]?"0":"1";return e}',
      'n.xor=function(t,n){for(var e=[],r=0;r<32;r++)e+=t.charAt(r)==n.charAt(r)?"0":"1";return e}'
    )
    .replace(
      'n.or=function(t,n){for(var e=[],r=0;r<32;r++)e+="1"===t[r]||"1"===n[r]?"1":"0";return e}',
      'n.or=function(t,n){for(var e=[],r=0;r<32;r++)e+="1"===t.charAt(r)||"1"===n.charAt(r)?"1":"0";return e}'
    )
    .replace(
      'n.and=function(t,n){for(var e=[],r=0;r<32;r++)e+="1"===t[r]&&"1"===n[r]?"1":"0";return e}',
      'n.and=function(t,n){for(var e=[],r=0;r<32;r++)e+="1"===t.charAt(r)&&"1"===n.charAt(r)?"1":"0";return e}'
    )
    .replace(
      'n.or64=function(t,n){for(var e=[],r=0;r<64;r++)e+="1"===t[r]||"1"===n[r]?"1":"0";return e}',
      'n.or64=function(t,n){for(var e=[],r=0;r<64;r++)e+="1"===t.charAt(r)||"1"===n.charAt(r)?"1":"0";return e}'
    )
    .replace(
      'n.and64=function(t,n){for(var e=[],r=0;r<64;r++)e+="1"===t[r]&&"1"===n[r]?"1":"0";return e}',
      'n.and64=function(t,n){for(var e=[],r=0;r<64;r++)e+="1"===t.charAt(r)&&"1"===n.charAt(r)?"1":"0";return e}'
    )
}

const buildJsSha3Bundle = (): string => {
  if (!bundleCache['js-sha3']) {
    bundleCache['js-sha3'] = `var window = this;\n${patchJsSha3Source(jsSha3Source)}`
  }
  return bundleCache['js-sha3']
}

const buildSm4Bundle = (): string => {
  if (!bundleCache.sm4) {
    bundleCache.sm4 = `${LEGACY_JS_BASIC_POLYFILLS}\n${patchLegacyDefaultKeywords(sm4BundleSource)}`
  }
  return bundleCache.sm4
}

const buildSm2Bundle = (): string => {
  if (!bundleCache.sm2) {
    bundleCache.sm2 = `${LEGACY_JS_CRYPTO_POLYFILLS}\n${patchLegacyDefaultKeywords(sm2BundleSource)}`
  }
  return bundleCache.sm2
}

const buildScryptBundle = (): string => {
  if (!bundleCache.scrypt) {
    bundleCache.scrypt = `${LEGACY_JS_CRYPTO_POLYFILLS}\n${toLegacyVarSource(scryptBundleSource)}`
  }
  return bundleCache.scrypt
}

const buildBlakeJsBundle = (type: 'blake2s' | 'blake2b'): string => {
  const cacheKey = `blakejs:${type}`
  if (bundleCache[cacheKey]) {
    return bundleCache[cacheKey]
  }

  const moduleName = type === 'blake2s' ? 'WT_BLAKE2S_MODULE' : 'WT_BLAKE2B_MODULE'
  const globalName = type === 'blake2s' ? 'WT_BLAKE2S' : 'WT_BLAKE2B'
  const source = type === 'blake2s' ? toLegacyVarSource(blake2sSource) : patchLegacyBlake2bSource(blake2bSource)

  bundleCache[cacheKey] = [
    LEGACY_JS_CRYPTO_POLYFILLS,
    'var WT_Console = typeof console !== "undefined" ? console : { log: function () {}, error: function () {} };',
    'var WT_BLAKEJS_UTIL_MODULE = { exports: {} };',
    '(function (module, exports, console) {',
    toLegacyVarSource(blakeJsUtilSource),
    '}(WT_BLAKEJS_UTIL_MODULE, WT_BLAKEJS_UTIL_MODULE.exports, WT_Console));',
    'function WT_BLAKEJS_REQUIRE(path) {',
    "  if (path === './util') {",
    '    return WT_BLAKEJS_UTIL_MODULE.exports;',
    '  }',
    "  throw new Error('Unsupported BLAKEJS module: ' + path);",
    '}',
    `var ${moduleName} = { exports: {} };`,
    '(function (require, module, exports, console) {',
    source,
    `}(WT_BLAKEJS_REQUIRE, ${moduleName}, ${moduleName}.exports, WT_Console));`,
    `var ${globalName} = ${moduleName}.exports;`,
  ].join('\n\n')

  return bundleCache[cacheKey]
}

const buildJsrsasignBundle = (): string => {
  if (!bundleCache.jsrsasign) {
    const legacySource = escapeLegacyNonAscii(
      stripLegacyTrailingCommas(
        normalizeLegacyRegexWildcards(stripSourceMapComment(jsrsasignBundleSource))
      )
    )

    bundleCache.jsrsasign = [
      LEGACY_JS_BASIC_POLYFILLS,
      'var exports = {};',
      'var module = { exports: exports };',
      legacySource,
    ].join('\n\n')
  }
  return bundleCache.jsrsasign
}

const buildBlake3Bundle = (): string => {
  if (!bundleCache.blake3) {
    bundleCache.blake3 = [
      LEGACY_JS_CRYPTO_POLYFILLS,
      LEGACY_JS_ITERATOR_POLYFILLS,
      'var module = { exports: {} };',
      'var exports = module.exports;',
      patchLegacyBlake3Source(blake3BundleSource),
      'var WT_BLAKE3 = module.exports;',
    ].join('\n\n')
  }
  return bundleCache.blake3
}

export const getEasyLanguageRuntimeBundle = (type: string): string | null => {
  switch (type) {
    case 'blake2s':
      return buildBlakeJsBundle('blake2s')
    case 'blake2b':
      return buildBlakeJsBundle('blake2b')
    case 'blake3':
      return buildBlake3Bundle()
    case 'keccak256':
    case 'sha3-256':
      return buildJsSha3Bundle()
    case 'sm2':
    case 'sm2-sign':
      return buildSm2Bundle()
    case 'sm4':
      return buildSm4Bundle()
    case 'scrypt':
      return buildScryptBundle()
    case 'rsa':
    case 'rsa-sign':
      return buildJsrsasignBundle()
    default:
      return null
  }
}
