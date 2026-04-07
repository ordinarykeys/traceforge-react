import nobleBlake2Source from '@noble/hashes/blake2.js?raw'
import nobleBlake3Source from '@noble/hashes/blake3.js?raw'
import nobleSha3Source from '@noble/hashes/sha3.js?raw'
import nobleBlakeHelpersSource from '../vendor/noble-hashes/_blake.js?raw'
import nobleMdSource from '@noble/hashes/_md.js?raw'
import nobleU64Source from '../vendor/noble-hashes/_u64.js?raw'
import nobleUtilsSource from '@noble/hashes/utils.js?raw'
import nobleSha2Source from '@noble/hashes/sha2.js?raw'
import nobleHmacSource from '@noble/hashes/hmac.js?raw'
import noblePbkdf2Source from '@noble/hashes/pbkdf2.js?raw'
import nobleScryptSource from '@noble/hashes/scrypt.js?raw'
import forgeBundleSource from 'node-forge/dist/forge.min.js?raw'
import sm2BundleSource from 'sm-crypto/dist/sm2.js?raw'
import sm3BundleSource from 'sm-crypto/dist/sm3.js?raw'
import sm4BundleSource from 'sm-crypto/dist/sm4.js?raw'
import { buildEasyLanguageTemplate } from './easyLanguageGenerators/common'
import { getEasyLanguageRunner } from './easyLanguageGenerators'
import { getEasyLanguageRuntimeBundle } from './easyLanguageRuntimeBundles'

const cache: Record<string, string> = {}

const CRYPTO_JS_TYPES = new Set([
  'md5',
  'sha',
  'ripemd160',
  'hmac',
  'aes',
  'des',
  '3des',
  'rc4',
  'rabbit',
  'pbkdf2',
  'evpkdf',
  'utf16',
])

const EASY_LANGUAGE_CRYPTO_JS_TYPES = new Set([
  ...CRYPTO_JS_TYPES,
  'aes-gcm',
])

const NOBLE_BLAKE_TYPES = new Set([
  'blake2s',
  'blake2b',
  'blake3',
])

const NOBLE_SHA3_TYPES = new Set([
  'keccak256',
  'sha3-256',
])

const NOBLE_SCRYPT_TYPES = new Set([
  'scrypt',
])

const FORGE_TYPES = new Set([
  'rsa',
  'rsa-sign',
])

const SM_CRYPTO_TYPES = new Set([
  'sm2',
  'sm2-sign',
  'sm3',
  'sm4',
])

const HMAC_FUNCTIONS: Record<string, string> = {
  'HMAC-MD5': 'HmacMD5',
  'HMAC-SHA1': 'HmacSHA1',
  'HMAC-SHA224': 'HmacSHA224',
  'HMAC-SHA256': 'HmacSHA256',
  'HMAC-SHA384': 'HmacSHA384',
  'HMAC-SHA512': 'HmacSHA512',
  'HMAC-SHA3': 'HmacSHA3',
  'HMAC-RIPEMD160': 'HmacRIPEMD160',
}

const HMAC_SOURCE_FILES: Record<string, string[]> = {
  'HMAC-MD5': ['md5.js', 'hmac.js'],
  'HMAC-SHA1': ['sha1.js', 'hmac.js'],
  'HMAC-SHA224': ['sha256.js', 'sha224.js', 'hmac.js'],
  'HMAC-SHA256': ['sha256.js', 'hmac.js'],
  'HMAC-SHA384': ['x64-core.js', 'sha512.js', 'sha384.js', 'hmac.js'],
  'HMAC-SHA512': ['x64-core.js', 'sha512.js', 'hmac.js'],
  'HMAC-SHA3': ['x64-core.js', 'sha3.js', 'hmac.js'],
  'HMAC-RIPEMD160': ['ripemd160.js', 'hmac.js'],
}

export interface CipherOptions {
  mode?: string
  padding?: string
  keyEncoding?: string
  ivEncoding?: string
  outputEncoding?: string
  rsaPadding?: string
}

export interface ScriptParams {
  type: string
  subType: string
  outputFormat: string
  isEncrypt: boolean
  input: string
  key: string
  iv: string
  mode: string
  padding: string
  keyEncoding: string
  ivEncoding: string
  outputEncoding: string
  rsaPadding: string
  salt: string
  keySize: number
  iterations: number
  costFactor: number
  blockSizeFactor: number
  parallelism: number
  publicKey: string
  privateKey: string
  signature: string
  sm2CipherMode: number
  userId: string
  protobufInputFormat: 'hex' | 'base64'
  xorInitialKey: number
}

interface ScriptBuildParams extends ScriptParams {
  includeExampleValues: boolean
}

const DEFAULT_VALUES: ScriptParams = {
  type: 'md5',
  subType: 'SHA256',
  outputFormat: 'Hex',
  isEncrypt: true,
  input: 'Hello World',
  key: '1234567890123456',
  iv: '1234567890123456',
  mode: 'CBC',
  padding: 'Pkcs7',
  keyEncoding: 'Utf8',
  ivEncoding: 'Utf8',
  outputEncoding: 'Base64',
  rsaPadding: 'OAEP',
  salt: 'salt',
  keySize: 256,
  iterations: 1000,
  costFactor: 16384,
  blockSizeFactor: 8,
  parallelism: 1,
  publicKey: '',
  privateKey: '',
  signature: '',
  sm2CipherMode: 1,
  userId: '1234567812345678',
  protobufInputFormat: 'hex',
  xorInitialKey: 0,
}

const RUNTIME_COMPAT_HELPERS = `function utf8ToBytes(text) {
  var encoded = unescape(encodeURIComponent(text));
  var bytes = new Uint8Array(encoded.length);
  for (var i = 0; i < encoded.length; i += 1) {
    bytes[i] = encoded.charCodeAt(i);
  }
  return bytes;
}

function bytesToUtf8(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(binary));
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  if (typeof btoa === 'function') {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  throw new Error('Base64 encoding is not available in this runtime');
}

function base64ToBytes(value) {
  var binary = '';

  if (typeof Buffer !== 'undefined') {
    binary = Buffer.from(value, 'base64').toString('binary');
  } else if (typeof atob === 'function') {
    binary = atob(value);
  } else {
    throw new Error('Base64 decoding is not available in this runtime');
  }

  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}`

const WEB_CRYPTO_COMPAT_HELPERS = `${RUNTIME_COMPAT_HELPERS}

function getWebCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }

  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto;
  }

  if (typeof require === 'function') {
    try {
      var nodeCrypto = require('crypto');
      if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
        return nodeCrypto.webcrypto;
      }
    } catch (error) {
      // Ignore Node fallback lookup failures.
    }
  }

  throw new Error('Web Crypto API is not available in this runtime');
}`

const getBasePath = (): string => {
  if (import.meta.env?.PROD) {
    return './package'
  }
  return '/package'
}

const loadPackageFile = async (filename: string): Promise<string> => {
  if (cache[filename]) {
    return cache[filename]
  }

  const response = await fetch(`${getBasePath()}/${filename}`)
  if (!response.ok) {
    throw new Error(`Failed to load ${filename}`)
  }

  let content = await response.text()
  
  // Guardrail: Ensure we didn't fetch the index.html fallback
  if (content.trim().toLowerCase().startsWith('<!doctype') || content.trim().toLowerCase().startsWith('<html')) {
    throw new Error(`Failed to load ${filename}: Received HTML instead of JS. Please ensure the library files in /public/package are present.`);
  }

  if (filename === 'crypto-js.js') {
    content = content.replace(
      '}(this, function () {',
      '}(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this), function () {'
    )
  }

  cache[filename] = content
  return content
}

const sanitizeCryptoJsCoreSource = (source: string): string => {
  return source
    .replace(/^;\(function\s*\(root,\s*factory\)\s*\{[\s\S]*?\}\(this,\s*function\s*\(\)\s*\{\s*/m, '')
    .replace(/\s*return CryptoJS;\s*\n?\}\)\);\s*$/m, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    .trim()
}

const sanitizeCryptoJsModuleSource = (source: string): string => {
  return source
    .replace(/^;\(function\s*\(root,\s*factory[^)]*\)\s*\{[\s\S]*?\}\(this,\s*function\s*\(CryptoJS\)\s*\{\s*/m, '')
    .replace(/\s*return CryptoJS(?:\.[A-Za-z0-9_$]+)*;\s*\n?\}\)\);\s*$/m, '')
    .replace(/\s*\}\)\);\s*$/m, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    .trim()
}

const getCryptoJsSourceFiles = (params: ScriptBuildParams): string[] => {
  switch (params.type) {
    case 'md5':
      return ['core.js', 'md5.js']
    case 'sha':
      switch (params.subType) {
        case 'SHA1':
          return ['core.js', 'enc-base64.js', 'sha1.js']
        case 'SHA224':
          return ['core.js', 'enc-base64.js', 'sha256.js', 'sha224.js']
        case 'SHA256':
          return ['core.js', 'enc-base64.js', 'sha256.js']
        case 'SHA384':
          return ['core.js', 'enc-base64.js', 'x64-core.js', 'sha512.js', 'sha384.js']
        case 'SHA512':
          return ['core.js', 'enc-base64.js', 'x64-core.js', 'sha512.js']
        case 'SHA3':
          return ['core.js', 'enc-base64.js', 'x64-core.js', 'sha3.js']
        default:
          return ['core.js', 'enc-base64.js', 'sha256.js']
      }
    case 'ripemd160':
      return ['core.js', 'enc-base64.js', 'ripemd160.js']
    case 'hmac':
      return ['core.js', 'enc-base64.js', ...(HMAC_SOURCE_FILES[params.subType] ?? HMAC_SOURCE_FILES['HMAC-SHA256'])]
    case 'aes':
      return ['core.js', 'enc-base64.js', 'cipher-core.js', 'mode-cfb.js', 'mode-ctr.js', 'mode-ecb.js', 'mode-ofb.js', 'pad-ansix923.js', 'pad-iso10126.js', 'pad-iso97971.js', 'pad-nopadding.js', 'pad-zeropadding.js', 'aes.js']
    case 'des':
      return ['core.js', 'enc-base64.js', 'cipher-core.js', 'mode-cfb.js', 'mode-ctr.js', 'mode-ecb.js', 'mode-ofb.js', 'pad-ansix923.js', 'pad-iso10126.js', 'pad-iso97971.js', 'pad-nopadding.js', 'pad-zeropadding.js', 'tripledes.js']
    case '3des':
      return ['core.js', 'enc-base64.js', 'cipher-core.js', 'mode-cfb.js', 'mode-ctr.js', 'mode-ecb.js', 'mode-ofb.js', 'pad-ansix923.js', 'pad-iso10126.js', 'pad-iso97971.js', 'pad-nopadding.js', 'pad-zeropadding.js', 'tripledes.js']
    case 'rc4':
      return ['core.js', 'enc-base64.js', 'cipher-core.js', 'rc4.js']
    case 'rabbit':
      return ['core.js', 'enc-base64.js', 'cipher-core.js', 'rabbit.js']
    case 'pbkdf2':
      return ['core.js', 'enc-base64.js', 'sha256.js', 'hmac.js', 'pbkdf2.js']
    case 'evpkdf':
      return ['core.js', 'enc-base64.js', 'md5.js', 'evpkdf.js']
    case 'utf16':
      return ['core.js', 'enc-utf16.js']
    default:
      return ['crypto-js.js']
  }
}

const loadCryptoJsBundle = async (params: ScriptBuildParams): Promise<string> => {
  const files = getCryptoJsSourceFiles(params)
  const cacheKey = `crypto-js:${files.join('|')}`
  if (cache[cacheKey]) {
    return cache[cacheKey]
  }

  if (files.length === 1 && files[0] === 'crypto-js.js') {
    cache[cacheKey] = await loadPackageFile('crypto-js.js')
    return cache[cacheKey]
  }

  const sources = await Promise.all(files.map((file) => loadPackageFile(file)))
  const bundle = sources
    .map((source, index) => index === 0 ? sanitizeCryptoJsCoreSource(source) : sanitizeCryptoJsModuleSource(source))
    .join('\n\n')

  cache[cacheKey] = bundle
  return bundle
}

const sanitizeModuleSource = (source: string): string => {
  return source
    .replace(/^import\s+.+$/gm, '')
    .replace(/^export\s+\{[^}]+\};?$/gm, '')
    .replace(/^export\s+default\s+.+$/gm, '')
    .replace(/^export\s+\*\s+from\s+.+$/gm, '')
    .replace(/\bexport\s+/g, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    .trim()
}

const buildNobleBlakeBundle = (): string => {
  const utils = sanitizeModuleSource(nobleUtilsSource)
  const u64 = sanitizeModuleSource(nobleU64Source)
  const blakeHelpers = sanitizeModuleSource(nobleBlakeHelpersSource)
  const blake2 = sanitizeModuleSource(nobleBlake2Source)
  const blake3 = sanitizeModuleSource(nobleBlake3Source)

  return [
    '(function (global) {',
    utils,
    u64,
    blakeHelpers,
    'const SHA256_IV = Uint32Array.from([',
    '  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,',
    ']);',
    blake2,
    blake3,
    'global.NobleBlake = {',
    '  blake2b: blake2b,',
    '  blake2s: blake2s,',
    '  blake3: blake3,',
    '  bytesToHex: bytesToHex,',
    '};',
    '}(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this)));',
  ].join('\n\n')
}

const loadNobleBlakeBundle = async (): Promise<string> => {
  if (!cache['noble-blake-bundle']) {
    cache['noble-blake-bundle'] = buildNobleBlakeBundle()
  }
  return cache['noble-blake-bundle']
}

const buildNobleSha3Bundle = (): string => {
  const utils = sanitizeModuleSource(nobleUtilsSource)
  const u64 = sanitizeModuleSource(nobleU64Source)
  const sha3 = sanitizeModuleSource(nobleSha3Source)

  return [
    '(function (global) {',
    utils,
    u64,
    sha3,
    'global.NobleSha3 = {',
    '  keccak_256: keccak_256,',
    '  sha3_256: sha3_256,',
    '  bytesToHex: bytesToHex,',
    '};',
    '}(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this)));',
  ].join('\n\n')
}

const loadNobleSha3Bundle = async (): Promise<string> => {
  if (!cache['noble-sha3-bundle']) {
    cache['noble-sha3-bundle'] = buildNobleSha3Bundle()
  }
  return cache['noble-sha3-bundle']
}

const buildNobleScryptBundle = (): string => {
  const utils = sanitizeModuleSource(nobleUtilsSource)
  const md = sanitizeModuleSource(nobleMdSource)
  const u64 = sanitizeModuleSource(nobleU64Source)
  const sha2 = sanitizeModuleSource(nobleSha2Source)
  const hmac = sanitizeModuleSource(nobleHmacSource)
  const pbkdf2 = sanitizeModuleSource(noblePbkdf2Source)
  const scrypt = sanitizeModuleSource(nobleScryptSource)

  return [
    '(function (global) {',
    utils,
    md,
    u64,
    sha2,
    hmac,
    pbkdf2,
    scrypt,
    'global.NobleScrypt = {',
    '  scryptAsync: scryptAsync,',
    '  bytesToHex: bytesToHex,',
    '};',
    '}(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this)));',
  ].join('\n\n')
}

const loadNobleScryptBundle = async (): Promise<string> => {
  if (!cache['noble-scrypt-bundle']) {
    cache['noble-scrypt-bundle'] = buildNobleScryptBundle()
  }
  return cache['noble-scrypt-bundle']
}

const loadForgeBundle = async (): Promise<string> => {
  if (!cache['forge-bundle']) {
    cache['forge-bundle'] = forgeBundleSource
  }
  return cache['forge-bundle']
}

const loadSmCryptoBundle = async (type: string): Promise<string> => {
  const cacheKey = `sm-crypto-${type}`
  if (!cache[cacheKey]) {
    cache[cacheKey] = type === 'sm2'
      ? sm2BundleSource
      : type === 'sm3'
        ? sm3BundleSource
        : sm4BundleSource
  }
  return cache[cacheKey]
}

export const generateFullCode = async (
  type: string,
  subType: string,
  outputFormat: string,
  isEncrypt: boolean,
  options?: CipherOptions
): Promise<string> => {
  return buildScript({
    ...DEFAULT_VALUES,
    type,
    subType,
    outputFormat,
    isEncrypt,
    mode: options?.mode ?? DEFAULT_VALUES.mode,
    padding: options?.padding ?? DEFAULT_VALUES.padding,
    keyEncoding: options?.keyEncoding ?? DEFAULT_VALUES.keyEncoding,
    ivEncoding: options?.ivEncoding ?? DEFAULT_VALUES.ivEncoding,
    outputEncoding: options?.outputEncoding ?? DEFAULT_VALUES.outputEncoding,
    rsaPadding: options?.rsaPadding ?? DEFAULT_VALUES.rsaPadding,
    includeExampleValues: false,
  })
}

export const generateFullCodeWithValues = async (
  params: ScriptParams
): Promise<string> => {
  return buildScript({
    ...DEFAULT_VALUES,
    ...params,
    includeExampleValues: true,
  })
}

export const generateEasyLanguageRuntimeScript = async (
  params: ScriptParams
): Promise<string | null> => {
  const mergedParams: ScriptBuildParams = {
    ...DEFAULT_VALUES,
    ...params,
    includeExampleValues: false,
  }

  const runner = getEasyLanguageRunner(mergedParams)
  if (!runner) {
    return null
  }

  const runtimeBundle = getEasyLanguageRuntimeBundle(mergedParams.type)
  if (runtimeBundle) {
    return `${runtimeBundle}\n\n${runner.script}`
  }

  if (EASY_LANGUAGE_CRYPTO_JS_TYPES.has(mergedParams.type)) {
    const bundle = await loadCryptoJsBundle(
      mergedParams.type === 'aes-gcm'
        ? { ...mergedParams, type: 'aes' }
        : mergedParams
    )
    return `${bundle}\n\n${runner.script}`
  }

  return runner.script
}

export const generateEasyLanguageCodeWithValues = async (
  params: ScriptParams
): Promise<string> => {
  const mergedParams: ScriptBuildParams = {
    ...DEFAULT_VALUES,
    ...params,
    includeExampleValues: false,
  }

  const runtimeRunner = getEasyLanguageRunner(mergedParams)
  if (!runtimeRunner) {
    return `; 当前算法暂不支持生成易语言脚本
; 类型: ${mergedParams.type}
; 目前仅支持基于 CryptoJS 的算法，例如 MD5 / SHA / HMAC / AES / DES / 3DES / RC4 / Rabbit / PBKDF2 / EvpKDF / UTF-16`
  }

  const runtimeScript = await generateEasyLanguageRuntimeScript(mergedParams)
  if (!runtimeScript) {
    return `; 当前算法暂不支持生成易语言脚本
; 类型: ${mergedParams.type}`
  }

  return buildEasyLanguageTemplate(runtimeScript, runtimeRunner)
}

async function buildScript(params: ScriptBuildParams): Promise<string> {
  if (CRYPTO_JS_TYPES.has(params.type)) {
    const bundle = await loadCryptoJsBundle(params)
    return appendEasyLanguageAdapter(params, `${buildHeader(params.type, true)}${bundle}\n\n${buildCryptoJsUsage(params)}`)
  }

  if (NOBLE_BLAKE_TYPES.has(params.type)) {
    const bundle = await loadNobleBlakeBundle()
    return appendEasyLanguageAdapter(params, `${buildHeader(params.type, true)}${bundle}\n\n${buildBlakeUsage(params)}`)
  }

  if (NOBLE_SHA3_TYPES.has(params.type)) {
    const bundle = await loadNobleSha3Bundle()
    return appendEasyLanguageAdapter(params, `${buildHeader(params.type, true)}${bundle}\n\n${buildSha3Usage(params)}`)
  }

  if (NOBLE_SCRYPT_TYPES.has(params.type)) {
    const bundle = await loadNobleScryptBundle()
    return appendEasyLanguageAdapter(params, `${buildHeader(params.type, true)}${bundle}\n\n${buildScryptUsage(params)}`)
  }

  if (FORGE_TYPES.has(params.type)) {
    const bundle = await loadForgeBundle()
    return appendEasyLanguageAdapter(params, `${buildHeader(params.type, true)}${bundle}\n\n${buildForgeUsage(params)}`)
  }

  if (SM_CRYPTO_TYPES.has(params.type)) {
    const bundle = await loadSmCryptoBundle(params.type === 'sm2-sign' ? 'sm2' : params.type)
    return appendEasyLanguageAdapter(params, `${buildHeader(params.type, true)}${bundle}\n\n${buildSmCryptoUsage(params)}`)
  }

  const simpleScript = buildSimpleScript(params)
  if (simpleScript) {
    return appendEasyLanguageAdapter(params, `${buildHeader(params.type, false)}${simpleScript}`)
  }

  return buildUnsupportedScript(params)
}

function appendEasyLanguageAdapter(params: ScriptBuildParams, script: string): string {
  const runner = getEasyLanguageRunner(params)
  if (!runner?.script) {
    return script
  }
  return `${script}\n\n// EasyLanguage adapter\n${runner.script}`
}

function buildHeader(type: string, includesBundledSource: boolean): string {
  const lines = [
    `// Auto generated for: ${type}`,
    includesBundledSource
      ? '// Self-contained: includes local bundled source from this project.'
      : '// Self-contained: pure JavaScript implementation.',
    '// You can copy this file directly and run it without loading extra files.',
    '',
  ]
  return lines.join('\n')
}

function buildExampleBlock(params: ScriptBuildParams, lines: string[]): string {
  const header = params.includeExampleValues
    ? '// Example: current values from the UI'
    : '// Example: replace these values with your own'

  return [header, ...lines].join('\n')
}

function buildCryptoJsUsage(params: ScriptBuildParams): string {
  switch (params.type) {
    case 'md5':
      return buildMd5Script(params)
    case 'sha':
      return buildShaScript(params)
    case 'ripemd160':
      return buildRipemd160Script(params)
    case 'hmac':
      return buildHmacScript(params)
    case 'aes':
    case 'des':
    case '3des':
      return buildBlockCipherScript(params)
    case 'rc4':
    case 'rabbit':
      return buildStreamCipherScript(params)
    case 'pbkdf2':
      return buildPbkdf2Script(params)
    case 'evpkdf':
      return buildEvpkdfScript(params)
    case 'utf16':
      return buildUtf16Script(params)
    default:
      return buildUnsupportedScript(params)
  }
}

function buildBlakeUsage(params: ScriptBuildParams): string {
  const hashName = params.type === 'blake2b' ? 'blake2b' : params.type === 'blake3' ? 'blake3' : 'blake2s'

  return `${RUNTIME_COMPAT_HELPERS}

function blakeHash(text, outputFormat) {
  var bytes = NobleBlake.${hashName}(utf8ToBytes(text));
  return outputFormat === 'Base64'
    ? bytesToBase64(bytes)
    : NobleBlake.bytesToHex(bytes);
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = blakeHash(text, outputFormat);',
  'console.log(result);',
])}`
}

function buildScryptUsage(params: ScriptBuildParams): string {
  return `${RUNTIME_COMPAT_HELPERS}

async function scryptDerive(password, options) {
  options = options || {};
  var result = await NobleScrypt.scryptAsync(password, options.salt || '', {
    N: options.costFactor || 16384,
    r: options.blockSizeFactor || 8,
    p: options.parallelism || 1,
    dkLen: Math.max(1, Math.floor((options.keySize || 256) / 8))
  });
  return (options.outputFormat || 'Hex') === 'Base64'
    ? bytesToBase64(result)
    : NobleScrypt.bytesToHex(result);
}

(async function () {
${buildExampleBlock(params, [
  `  var password = ${JSON.stringify(params.input)};`,
  `  var options = ${JSON.stringify({ salt: params.salt, keySize: params.keySize, costFactor: params.costFactor, blockSizeFactor: params.blockSizeFactor, parallelism: params.parallelism, outputFormat: params.outputFormat }, null, 2).replace(/\n/g, '\n  ')};`,
  '  var result = await scryptDerive(password, options);',
  '  console.log(result);',
])}
})().catch(console.error);`
}

function buildSha3Usage(params: ScriptBuildParams): string {
  const hashName = params.type === 'keccak256' ? 'keccak_256' : 'sha3_256'

  return `${RUNTIME_COMPAT_HELPERS}

function hashText(text, outputFormat) {
  var bytes = NobleSha3.${hashName}(utf8ToBytes(text));
  return outputFormat === 'Base64'
    ? bytesToBase64(bytes)
    : NobleSha3.bytesToHex(bytes);
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = hashText(text, outputFormat);',
  'console.log(result);',
])}`
}

function buildForgeUsage(params: ScriptBuildParams): string {
  if (params.type === 'rsa') {
    const action = params.isEncrypt ? 'rsaEncrypt' : 'rsaDecrypt'
    const inputVar = params.isEncrypt ? 'text' : 'ciphertext'
    const keyVar = params.isEncrypt ? 'publicKeyPem' : 'privateKeyPem'

    return `${RUNTIME_COMPAT_HELPERS}

function bytesToHexString(bytes) {
  return Array.from(bytes, function (byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

function base64OrHexToBytes(value, inputFormat) {
  return inputFormat === 'Hex'
    ? forge.util.hexToBytes(value)
    : forge.util.decode64(value);
}

function getMaxEncryptLength(publicKey, padding) {
  var keyBytes = publicKey.n.bitLength() / 8;
  return padding === 'OAEP' ? keyBytes - 66 : keyBytes - 11;
}

function rsaEncrypt(text, publicKeyPem, options) {
  options = options || {};
  var publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  var bytes = forge.util.encodeUtf8(text);
  var maxLen = getMaxEncryptLength(publicKey, options.padding || 'OAEP');
  var chunks = [];

  for (var i = 0; i < bytes.length; i += maxLen) {
    var chunk = bytes.substring(i, i + maxLen);
    var encrypted = (options.padding || 'OAEP') === 'OAEP'
      ? publicKey.encrypt(chunk, 'RSA-OAEP', { md: forge.md.sha256.create(), mgf1: { md: forge.md.sha256.create() } })
      : publicKey.encrypt(chunk, 'RSAES-PKCS1-V1_5');
    chunks.push(encrypted);
  }

  var merged = chunks.join('');
  return (options.outputFormat || 'Base64') === 'Hex'
    ? forge.util.bytesToHex(merged)
    : forge.util.encode64(merged);
}

function rsaDecrypt(ciphertext, privateKeyPem, options) {
  options = options || {};
  var privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  var encrypted = base64OrHexToBytes(ciphertext, options.inputFormat || 'Base64');
  var keyBytes = privateKey.n.bitLength() / 8;
  var chunks = [];

  for (var i = 0; i < encrypted.length; i += keyBytes) {
    var chunk = encrypted.substring(i, i + keyBytes);
    var decrypted = (options.padding || 'OAEP') === 'OAEP'
      ? privateKey.decrypt(chunk, 'RSA-OAEP', { md: forge.md.sha256.create(), mgf1: { md: forge.md.sha256.create() } })
      : privateKey.decrypt(chunk, 'RSAES-PKCS1-V1_5');
    chunks.push(decrypted);
  }

  return forge.util.decodeUtf8(chunks.join(''));
}

${buildExampleBlock(params, [
  `var ${inputVar} = ${JSON.stringify(params.input)};`,
  `var publicKeyPem = ${JSON.stringify(params.publicKey)};`,
  `var privateKeyPem = ${JSON.stringify(params.privateKey)};`,
  `var options = ${JSON.stringify({
    padding: params.rsaPadding,
    outputFormat: params.outputFormat,
    inputFormat: params.outputFormat,
  }, null, 2)};`,
  `var result = ${action}(${inputVar}, ${keyVar}, options);`,
  'console.log(result);',
])}`
  }

  return `${RUNTIME_COMPAT_HELPERS}

function createMessageDigest(algorithm) {
  switch (algorithm) {
    case 'SHA1':
      return forge.md.sha1.create();
    case 'SHA384':
      return forge.md.sha384.create();
    case 'SHA512':
      return forge.md.sha512.create();
    case 'MD5':
      return forge.md.md5.create();
    default:
      return forge.md.sha256.create();
  }
}

function rsaSign(text, privateKeyPem, options) {
  options = options || {};
  var privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  var md = createMessageDigest(options.algorithm || 'SHA256');
  md.update(text, 'utf8');
  var signature = privateKey.sign(md);
  return (options.outputFormat || 'Base64') === 'Hex'
    ? forge.util.bytesToHex(signature)
    : forge.util.encode64(signature);
}

function rsaVerify(text, signature, publicKeyPem, options) {
  options = options || {};
  var publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  var md = createMessageDigest(options.algorithm || 'SHA256');
  md.update(text, 'utf8');
  var bytes = (options.inputFormat || 'Base64') === 'Hex'
    ? forge.util.hexToBytes(signature)
    : forge.util.decode64(signature);
  return publicKey.verify(md.digest().bytes(), bytes);
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var publicKeyPem = ${JSON.stringify(params.publicKey)};`,
  `var privateKeyPem = ${JSON.stringify(params.privateKey)};`,
  `var signature = ${JSON.stringify(params.signature)};`,
  `var options = ${JSON.stringify({
    algorithm: params.subType,
    outputFormat: params.outputFormat,
    inputFormat: params.outputFormat,
  }, null, 2)};`,
  params.isEncrypt
    ? 'var result = rsaSign(text, privateKeyPem, options);'
    : 'var result = rsaVerify(text, signature, publicKeyPem, options);',
  'console.log(result);',
])}`
}

function buildSmCryptoUsage(params: ScriptBuildParams): string {
  if (params.type === 'sm3') {
    return `${RUNTIME_COMPAT_HELPERS}

function hexToBytes(hex) {
  var clean = hex.replace(/\\s+/g, '');
  var bytes = new Uint8Array(clean.length / 2);
  for (var i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function sm3Hash(text, outputFormat) {
  var hash = sm3(text);
  return outputFormat === 'Base64' ? bytesToBase64(hexToBytes(hash)) : hash;
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = sm3Hash(text, outputFormat);',
  'console.log(result);',
])}`
  }

  if (params.type === 'sm4') {
    return `${RUNTIME_COMPAT_HELPERS}

function hexToBytes(hex) {
  var clean = hex.replace(/\\s+/g, '');
  var bytes = new Uint8Array(clean.length / 2);
  for (var i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, function (byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

function normalizeSm4Hex(value, label) {
  var clean = (value || '').replace(/\\s+/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(clean)) {
    return clean.toLowerCase();
  }

  var bytes = utf8ToBytes(String(value || ''));
  if (bytes.length !== 16) {
    throw new Error(label + ' must be 16-byte UTF-8 text or 32-character hex');
  }
  return bytesToHex(bytes);
}

function sm4Encrypt(text, key, options) {
  options = options || {};
  var mode = (options.mode || 'ecb').toLowerCase();
  var normalizedKey = normalizeSm4Hex(key, 'SM4 key');
  var normalizedIv = mode === 'cbc' ? normalizeSm4Hex(options.iv || '', 'SM4 iv') : '';
  var encrypted = mode === 'cbc' && options.iv
    ? sm4.encrypt(text, normalizedKey, { mode: 'cbc', iv: normalizedIv })
    : sm4.encrypt(text, normalizedKey);
  return (options.outputFormat || 'Hex') === 'Base64'
    ? bytesToBase64(hexToBytes(encrypted))
    : encrypted;
}

function sm4Decrypt(ciphertext, key, options) {
  options = options || {};
  var mode = (options.mode || 'ecb').toLowerCase();
  var normalizedKey = normalizeSm4Hex(key, 'SM4 key');
  var normalizedIv = mode === 'cbc' ? normalizeSm4Hex(options.iv || '', 'SM4 iv') : '';
  var input = (options.inputFormat || 'Hex') === 'Base64'
    ? Array.from(base64ToBytes(ciphertext), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('')
    : ciphertext;
  return mode === 'cbc' && options.iv
    ? sm4.decrypt(input, normalizedKey, { mode: 'cbc', iv: normalizedIv })
    : sm4.decrypt(input, normalizedKey);
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var key = ${JSON.stringify(params.key)};`,
  `var options = ${JSON.stringify({
    mode: params.mode,
    iv: params.iv,
    outputFormat: params.outputEncoding,
    inputFormat: params.outputEncoding,
  }, null, 2)};`,
  `var result = ${params.isEncrypt ? 'sm4Encrypt' : 'sm4Decrypt'}(value, key, options);`,
  'console.log(result);',
])}`
  }

  if (params.type === 'sm2') {
    return `${RUNTIME_COMPAT_HELPERS}

function sm2Encrypt(text, publicKey, options) {
  options = options || {};
  return sm2.doEncrypt(text, publicKey, options.cipherMode === 0 ? 0 : 1);
}

function sm2Decrypt(ciphertext, privateKey, options) {
  options = options || {};
  return sm2.doDecrypt(ciphertext, privateKey, options.cipherMode === 0 ? 0 : 1);
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var publicKey = ${JSON.stringify(params.publicKey)};`,
  `var privateKey = ${JSON.stringify(params.privateKey)};`,
  `var options = ${JSON.stringify({ cipherMode: params.sm2CipherMode }, null, 2)};`,
  `var result = ${params.isEncrypt ? 'sm2Encrypt(value, publicKey, options)' : 'sm2Decrypt(value, privateKey, options)'};`,
  'console.log(result);',
])}`
  }

  return `${RUNTIME_COMPAT_HELPERS}

function sm2Sign(text, privateKey, options) {
  options = options || {};
  return sm2.doSignature(text, privateKey, {
    userId: options.userId || '1234567812345678',
    der: true,
  });
}

function sm2Verify(text, signature, publicKey, options) {
  options = options || {};
  return sm2.doVerifySignature(text, signature, publicKey, {
    userId: options.userId || '1234567812345678',
    der: true,
  });
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var publicKey = ${JSON.stringify(params.publicKey)};`,
  `var privateKey = ${JSON.stringify(params.privateKey)};`,
  `var signature = ${JSON.stringify(params.signature)};`,
  `var options = ${JSON.stringify({ userId: params.userId }, null, 2)};`,
  params.isEncrypt
    ? 'var result = sm2Sign(text, privateKey, options);'
    : 'var result = sm2Verify(text, signature, publicKey, options);',
  'console.log(result);',
])}`
}

function buildMd5Script(params: ScriptBuildParams): string {
  return `function md5Hash(text) {
  var hash = CryptoJS.MD5(text).toString();
  return {
    lower: hash.toLowerCase(),
    upper: hash.toUpperCase(),
    lower16: hash.substring(8, 24).toLowerCase(),
    upper16: hash.substring(8, 24).toUpperCase()
  };
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  'var result = md5Hash(text);',
  "console.log('32 lower:', result.lower);",
  "console.log('32 upper:', result.upper);",
  "console.log('16 lower:', result.lower16);",
  "console.log('16 upper:', result.upper16);",
])}`
}

function buildShaScript(params: ScriptBuildParams): string {
  return `function shaHash(text, algorithm, outputFormat) {
  var hash = CryptoJS[algorithm](text);
  return hash.toString(CryptoJS.enc[outputFormat]);
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var algorithm = ${JSON.stringify(params.subType)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = shaHash(text, algorithm, outputFormat);',
  'console.log(result);',
])}`
}

function buildRipemd160Script(params: ScriptBuildParams): string {
  return `function ripemd160Hash(text, outputFormat) {
  var hash = CryptoJS.RIPEMD160(text);
  return hash.toString(CryptoJS.enc[outputFormat]);
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = ripemd160Hash(text, outputFormat);',
  'console.log(result);',
])}`
}

function buildHmacScript(params: ScriptBuildParams): string {
  const functionName = HMAC_FUNCTIONS[params.subType]
  if (!functionName) {
    return buildUnsupportedScript(params)
  }

  return `function hmacHash(text, key, outputFormat) {
  var hash = CryptoJS.${functionName}(text, key);
  return hash.toString(CryptoJS.enc[outputFormat]);
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var key = ${JSON.stringify(params.key)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = hmacHash(text, key, outputFormat);',
  'console.log(result);',
])}`
}

function buildBlockCipherScript(params: ScriptBuildParams): string {
  const algorithm = params.type === 'aes' ? 'AES' : params.type === 'des' ? 'DES' : 'TripleDES'
  const exampleVar = params.isEncrypt ? 'text' : 'ciphertext'
  const action = params.isEncrypt ? 'encryptBlockCipher' : 'decryptBlockCipher'

  return `function getCryptoJsEncoder(name) {
  var encoder = CryptoJS.enc[name];
  if (!encoder) {
    throw new Error('Unsupported encoder: ' + name);
  }
  return encoder;
}

function encryptBlockCipher(algorithm, text, key, options) {
  options = options || {};
  var mode = options.mode || 'CBC';
  var padding = options.padding || 'Pkcs7';
  var keyEncoding = options.keyEncoding || 'Utf8';
  var ivEncoding = options.ivEncoding || 'Utf8';
  var outputEncoding = options.outputEncoding || 'Base64';
  var keyBytes = getCryptoJsEncoder(keyEncoding).parse(key);
  var cryptoOptions = {
    mode: CryptoJS.mode[mode],
    padding: CryptoJS.pad[padding]
  };

  if (mode !== 'ECB') {
    cryptoOptions.iv = getCryptoJsEncoder(ivEncoding).parse(options.iv || '');
  }

  var encrypted = CryptoJS[algorithm].encrypt(text, keyBytes, cryptoOptions);
  if (outputEncoding === 'Hex') {
    return encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  }
  return encrypted.toString();
}

function decryptBlockCipher(algorithm, ciphertext, key, options) {
  options = options || {};
  var mode = options.mode || 'CBC';
  var padding = options.padding || 'Pkcs7';
  var keyEncoding = options.keyEncoding || 'Utf8';
  var ivEncoding = options.ivEncoding || 'Utf8';
  var inputEncoding = options.outputEncoding || 'Base64';
  var keyBytes = getCryptoJsEncoder(keyEncoding).parse(key);
  var cryptoOptions = {
    mode: CryptoJS.mode[mode],
    padding: CryptoJS.pad[padding]
  };

  if (mode !== 'ECB') {
    cryptoOptions.iv = getCryptoJsEncoder(ivEncoding).parse(options.iv || '');
  }

  var cipherInput = inputEncoding === 'Hex'
    ? CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Hex.parse(ciphertext) })
    : ciphertext;

  var decrypted = CryptoJS[algorithm].decrypt(cipherInput, keyBytes, cryptoOptions);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

${buildExampleBlock(params, [
  `var ${exampleVar} = ${JSON.stringify(params.input)};`,
  `var key = ${JSON.stringify(params.key)};`,
  `var options = ${JSON.stringify({
    iv: params.iv,
    mode: params.mode,
    padding: params.padding,
    keyEncoding: params.keyEncoding,
    ivEncoding: params.ivEncoding,
    outputEncoding: params.outputEncoding,
  }, null, 2)};`,
  `var result = ${action}(${JSON.stringify(algorithm)}, ${exampleVar}, key, options);`,
  'console.log(result);',
])}`
}

function buildStreamCipherScript(params: ScriptBuildParams): string {
  const algorithm = params.type === 'rc4' ? 'RC4' : 'Rabbit'
  const action = params.isEncrypt ? 'encryptStreamCipher' : 'decryptStreamCipher'
  const exampleVar = params.isEncrypt ? 'text' : 'ciphertext'

  return `function getCryptoJsEncoder(name) {
  var encoder = CryptoJS.enc[name];
  if (!encoder) {
    throw new Error('Unsupported encoder: ' + name);
  }
  return encoder;
}

function encryptStreamCipher(algorithm, text, key, options) {
  options = options || {};
  var keyEncoding = options.keyEncoding || 'Utf8';
  var keyBytes = getCryptoJsEncoder(keyEncoding).parse(key);
  var encrypted = CryptoJS[algorithm].encrypt(text, keyBytes);
  return encrypted.toString();
}

function decryptStreamCipher(algorithm, ciphertext, key, options) {
  options = options || {};
  var keyEncoding = options.keyEncoding || 'Utf8';
  var keyBytes = getCryptoJsEncoder(keyEncoding).parse(key);
  var decrypted = CryptoJS[algorithm].decrypt(ciphertext, keyBytes);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

${buildExampleBlock(params, [
  `var ${exampleVar} = ${JSON.stringify(params.input)};`,
  `var key = ${JSON.stringify(params.key)};`,
  `var options = ${JSON.stringify({ keyEncoding: params.keyEncoding }, null, 2)};`,
  `var result = ${action}(${JSON.stringify(algorithm)}, ${exampleVar}, key, options);`,
  'console.log(result);',
])}`
}

function buildPbkdf2Script(params: ScriptBuildParams): string {
  return `function pbkdf2Derive(password, options) {
  options = options || {};
  var salt = options.salt || '';
  var keySize = options.keySize || 256;
  var iterations = options.iterations || 1000;
  var outputFormat = options.outputFormat || 'Hex';
  var key = CryptoJS.PBKDF2(password, salt, {
    keySize: keySize / 32,
    iterations: iterations
  });
  return key.toString(CryptoJS.enc[outputFormat]);
}

${buildExampleBlock(params, [
  `var password = ${JSON.stringify(params.input)};`,
  `var options = ${JSON.stringify({
    salt: params.salt,
    keySize: params.keySize,
    iterations: params.iterations,
    outputFormat: params.outputFormat,
  }, null, 2)};`,
  'var result = pbkdf2Derive(password, options);',
  'console.log(result);',
])}`
}

function buildEvpkdfScript(params: ScriptBuildParams): string {
  return `function evpkdfDerive(password, options) {
  options = options || {};
  var salt = options.salt || '';
  var keySize = options.keySize || 256;
  var iterations = options.iterations || 1000;
  var outputFormat = options.outputFormat || 'Hex';
  var key = CryptoJS.EvpKDF(password, salt, {
    keySize: keySize / 32,
    iterations: iterations
  });
  return key.toString(CryptoJS.enc[outputFormat]);
}

${buildExampleBlock(params, [
  `var password = ${JSON.stringify(params.input)};`,
  `var options = ${JSON.stringify({
    salt: params.salt,
    keySize: params.keySize,
    iterations: params.iterations,
    outputFormat: params.outputFormat,
  }, null, 2)};`,
  'var result = evpkdfDerive(password, options);',
  'console.log(result);',
])}`
}

function buildUtf16Script(params: ScriptBuildParams): string {
  const action = params.isEncrypt ? 'encodeUtf16' : 'decodeUtf16'
  const inputVar = params.isEncrypt ? 'text' : 'utf16Text'
  return `function encodeUtf16(text, encodingName) {
  var encoder = CryptoJS.enc[encodingName || 'Utf16'];
  if (!encoder) {
    throw new Error('Unsupported encoder: ' + encodingName);
  }
  return encoder.stringify(CryptoJS.enc.Utf8.parse(text));
}

function decodeUtf16(text, encodingName) {
  var encoder = CryptoJS.enc[encodingName || 'Utf16'];
  if (!encoder) {
    throw new Error('Unsupported encoder: ' + encodingName);
  }
  return CryptoJS.enc.Utf8.stringify(encoder.parse(text)).replace(/\\u0000+$/g, '');
}

${buildExampleBlock(params, [
  `var ${inputVar} = ${JSON.stringify(params.input)};`,
  `var result = ${action}(${inputVar}, ${JSON.stringify(params.keyEncoding)});`,
  'console.log(result);',
])}`
}

function buildSimpleScript(params: ScriptBuildParams): string {
  switch (params.type) {
    case 'base64':
      return `${RUNTIME_COMPAT_HELPERS}

function base64Encode(text) {
  return bytesToBase64(utf8ToBytes(text));
}

function base64Decode(text) {
  return bytesToUtf8(base64ToBytes(text));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'base64Encode' : 'base64Decode'}(value);`,
  'console.log(result);',
])}`
    case 'base64url':
      return `${RUNTIME_COMPAT_HELPERS}

function base64UrlEncode(text) {
  var base64 = bytesToBase64(utf8ToBytes(text));
  return base64.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
  var base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return bytesToUtf8(base64ToBytes(base64));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'base64UrlEncode' : 'base64UrlDecode'}(value);`,
  'console.log(result);',
])}`
    case 'hex':
      return `${RUNTIME_COMPAT_HELPERS}

function hexEncode(text) {
  return Array.from(utf8ToBytes(text), function (byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

function hexDecode(hex) {
  var clean = hex.replace(/\\s+/g, '');
  var bytes = new Uint8Array(clean.length / 2);
  for (var i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytesToUtf8(bytes);
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'hexEncode' : 'hexDecode'}(value);`,
  'console.log(result);',
])}`
    case 'url':
      return `${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'encodeURIComponent' : 'decodeURIComponent'}(value);`,
  'console.log(result);',
])}`
    case 'unicode':
      return `function unicodeEscape(text) {
  return text.split('').map(function (char) {
    var code = char.charCodeAt(0);
    return code > 127 ? '\\\\u' + code.toString(16).padStart(4, '0') : char;
  }).join('');
}

function unicodeUnescape(text) {
  return text.replace(/\\\\u([0-9a-fA-F]{4})/g, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'unicodeEscape' : 'unicodeUnescape'}(value);`,
  'console.log(result);',
])}`
    case 'html':
      return `function htmlEntityEncode(text) {
  return text.split('').map(function (char) {
    var code = char.charCodeAt(0);
    if (code > 127 || char === '<' || char === '>' || char === '&' || char === '"' || char === "'") {
      return '&#' + code + ';';
    }
    return char;
  }).join('');
}

function htmlEntityDecode(text) {
  return text
    .replace(/&#(\\d+);/g, function (_, dec) { return String.fromCharCode(parseInt(dec, 10)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'htmlEntityEncode' : 'htmlEntityDecode'}(value);`,
  'console.log(result);',
])}`
    case 'base58':
      return `${RUNTIME_COMPAT_HELPERS}

var BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(text) {
  var bytes = utf8ToBytes(text);
  var digits = [0];

  for (var i = 0; i < bytes.length; i += 1) {
    var carry = bytes[i];
    for (var j = 0; j < digits.length; j += 1) {
      var value = digits[j] * 256 + carry;
      digits[j] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  var result = '';
  for (var k = 0; k < bytes.length && bytes[k] === 0; k += 1) {
    result += '1';
  }
  for (var index = digits.length - 1; index >= 0; index -= 1) {
    result += BASE58_ALPHABET[digits[index]];
  }
  return result;
}

function base58Decode(text) {
  var bytes = [0];
  for (var i = 0; i < text.length; i += 1) {
    var value = BASE58_ALPHABET.indexOf(text[i]);
    if (value < 0) {
      throw new Error('Invalid Base58 character: ' + text[i]);
    }
    var carry = value;
    for (var j = 0; j < bytes.length; j += 1) {
      var current = bytes[j] * 58 + carry;
      bytes[j] = current & 255;
      carry = current >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }

  var output = new Uint8Array(bytes.length);
  for (var k = 0; k < bytes.length; k += 1) {
    output[k] = bytes[bytes.length - 1 - k];
  }
  return bytesToUtf8(output);
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'base58Encode' : 'base58Decode'}(value);`,
  'console.log(result);',
])}`
    case 'base32':
      return `${RUNTIME_COMPAT_HELPERS}

var BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(text) {
  var bytes = utf8ToBytes(text);
  var bits = 0;
  var value = 0;
  var output = '';

  for (var i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  while (output.length % 8 !== 0) {
    output += '=';
  }
  return output;
}

function base32Decode(text) {
  var clean = text.toUpperCase().replace(/=+$/, '');
  var bits = 0;
  var value = 0;
  var bytes = [];

  for (var i = 0; i < clean.length; i += 1) {
    var index = BASE32_ALPHABET.indexOf(clean[i]);
    if (index < 0) {
      throw new Error('Invalid Base32 character: ' + clean[i]);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return bytesToUtf8(new Uint8Array(bytes));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'base32Encode' : 'base32Decode'}(value);`,
  'console.log(result);',
])}`
    case 'base85':
      return `${RUNTIME_COMPAT_HELPERS}

function base85Encode(text) {
  var bytes = utf8ToBytes(text);
  var output = '';

  for (var i = 0; i < bytes.length; i += 4) {
    var chunk = bytes.slice(i, i + 4);
    if (chunk.length === 4 && chunk[0] === 0 && chunk[1] === 0 && chunk[2] === 0 && chunk[3] === 0) {
      output += 'z';
      continue;
    }
    var value = 0;
    for (var j = 0; j < 4; j += 1) {
      value = value * 256 + (chunk[j] || 0);
    }
    var encoded = new Array(5);
    for (var k = 4; k >= 0; k -= 1) {
      encoded[k] = String.fromCharCode((value % 85) + 33);
      value = Math.floor(value / 85);
    }
    output += encoded.slice(0, chunk.length + 1).join('');
  }

  return output;
}

function base85Decode(text) {
  var clean = text.replace(/\\s+/g, '');
  var bytes = [];
  var chunk = '';

  function flush(value, isFinal) {
    var padded = value.padEnd(5, 'u');
    var num = 0;
    for (var i = 0; i < 5; i += 1) {
      var code = padded.charCodeAt(i) - 33;
      if (code < 0 || code > 84) throw new Error('Invalid Base85 character: ' + padded[i]);
      num = num * 85 + code;
    }
    var block = [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255];
    bytes.push.apply(bytes, block.slice(0, isFinal ? value.length - 1 : 4));
  }

  for (var i = 0; i < clean.length; i += 1) {
    var char = clean[i];
    if (char === 'z') {
      if (chunk.length) throw new Error('Invalid Base85 sequence');
      bytes.push(0, 0, 0, 0);
      continue;
    }
    chunk += char;
    if (chunk.length === 5) {
      flush(chunk, false);
      chunk = '';
    }
  }

  if (chunk.length) {
    if (chunk.length === 1) throw new Error('Invalid Base85 tail');
    flush(chunk, true);
  }

  return bytesToUtf8(new Uint8Array(bytes));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'base85Encode' : 'base85Decode'}(value);`,
  'console.log(result);',
])}`
    case 'base91':
      return `${RUNTIME_COMPAT_HELPERS}

var BASE91_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_\`{|}~"';
var BASE91_DECODER = Object.fromEntries(BASE91_ALPHABET.split('').map(function (char, index) { return [char, index]; }));

function base91Encode(text) {
  var bytes = utf8ToBytes(text);
  var b = 0;
  var n = 0;
  var output = '';

  for (var i = 0; i < bytes.length; i += 1) {
    b |= bytes[i] << n;
    n += 8;
    if (n > 13) {
      var value = b & 8191;
      if (value > 88) {
        b >>= 13;
        n -= 13;
      } else {
        value = b & 16383;
        b >>= 14;
        n -= 14;
      }
      output += BASE91_ALPHABET[value % 91] + BASE91_ALPHABET[Math.floor(value / 91)];
    }
  }

  if (n) {
    output += BASE91_ALPHABET[b % 91];
    if (n > 7 || b > 90) output += BASE91_ALPHABET[Math.floor(b / 91)];
  }

  return output;
}

function base91Decode(text) {
  var bytes = [];
  var value = -1;
  var b = 0;
  var n = 0;
  var clean = text.replace(/\\s+/g, '');

  for (var i = 0; i < clean.length; i += 1) {
    var decoded = BASE91_DECODER[clean[i]];
    if (decoded === undefined) throw new Error('Invalid Base91 character: ' + clean[i]);
    if (value < 0) {
      value = decoded;
      continue;
    }
    value += decoded * 91;
    b |= value << n;
    n += (value & 8191) > 88 ? 13 : 14;
    while (n > 7) {
      bytes.push(b & 255);
      b >>= 8;
      n -= 8;
    }
    value = -1;
  }

  if (value >= 0) {
    bytes.push((b | (value << n)) & 255);
  }

  return bytesToUtf8(new Uint8Array(bytes));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var result = ${params.isEncrypt ? 'base91Encode' : 'base91Decode'}(value);`,
  'console.log(result);',
])}`
    case 'crc32':
      return `${RUNTIME_COMPAT_HELPERS}

function crc32(text, outputFormat) {
  var bytes = utf8ToBytes(text);
  var crc = 0 ^ -1;

  for (var i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (var j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  var result = (crc ^ -1) >>> 0;
  if (outputFormat === 'Base64') {
    return bytesToBase64(new Uint8Array([
      (result >>> 24) & 255,
      (result >>> 16) & 255,
      (result >>> 8) & 255,
      result & 255
    ]));
  }
  return result.toString(16).padStart(8, '0');
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = crc32(text, outputFormat);',
  'console.log(result);',
])}`
    case 'crc16':
      return `${RUNTIME_COMPAT_HELPERS}

function crc16(text, outputFormat) {
  var bytes = utf8ToBytes(text);
  var crc = 0xffff;

  for (var i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (var j = 0; j < 8; j += 1) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xa001;
      } else {
        crc >>>= 1;
      }
    }
  }

  crc &= 0xffff;
  if (outputFormat === 'Base64') {
    return bytesToBase64(new Uint8Array([(crc >>> 8) & 255, crc & 255]));
  }
  return crc.toString(16).padStart(4, '0');
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = crc16(text, outputFormat);',
  'console.log(result);',
])}`
    case 'adler32':
      return `${RUNTIME_COMPAT_HELPERS}

function adler32(text, outputFormat) {
  var bytes = utf8ToBytes(text);
  var a = 1;
  var b = 0;

  for (var i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }

  var result = (((b << 16) | a) >>> 0);
  if (outputFormat === 'Base64') {
    return bytesToBase64(new Uint8Array([
      (result >>> 24) & 255,
      (result >>> 16) & 255,
      (result >>> 8) & 255,
      result & 255
    ]));
  }
  return result.toString(16).padStart(8, '0');
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = adler32(text, outputFormat);',
  'console.log(result);',
])}`
    case 'fnv1a':
      return `${RUNTIME_COMPAT_HELPERS}

function fnv1a(text, outputFormat) {
  var bytes = utf8ToBytes(text);
  var hash = 0x811c9dc5;

  for (var i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  if (outputFormat === 'Base64') {
    return bytesToBase64(new Uint8Array([
      (hash >>> 24) & 255,
      (hash >>> 16) & 255,
      (hash >>> 8) & 255,
      hash & 255
    ]));
  }
  return hash.toString(16).padStart(8, '0');
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = fnv1a(text, outputFormat);',
  'console.log(result);',
])}`
    case 'murmurhash3':
      return `${RUNTIME_COMPAT_HELPERS}

function murmurhash3(text, outputFormat, seed) {
  var data = utf8ToBytes(text);
  var remainder = data.length & 3;
  var bytes = data.length - remainder;
  var hash = seed || 0;
  var c1 = 0xcc9e2d51;
  var c2 = 0x1b873593;
  var i = 0;

  while (i < bytes) {
    var k =
      (data[i] & 255) |
      ((data[i + 1] & 255) << 8) |
      ((data[i + 2] & 255) << 16) |
      ((data[i + 3] & 255) << 24);
    i += 4;

    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);

    hash ^= k;
    hash = (hash << 13) | (hash >>> 19);
    hash = (Math.imul(hash, 5) + 0xe6546b64) | 0;
  }

  var k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (data[i + 2] & 255) << 16;
    case 2:
      k1 ^= (data[i + 1] & 255) << 8;
    case 1:
      k1 ^= data[i] & 255;
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      hash ^= k1;
  }

  hash ^= data.length;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  var result = hash >>> 0;
  if (outputFormat === 'Base64') {
    return bytesToBase64(new Uint8Array([
      (result >>> 24) & 255,
      (result >>> 16) & 255,
      (result >>> 8) & 255,
      result & 255
    ]));
  }
  return result.toString(16).padStart(8, '0');
}

${buildExampleBlock(params, [
  `var text = ${JSON.stringify(params.input)};`,
  `var outputFormat = ${JSON.stringify(params.outputFormat)};`,
  'var result = murmurhash3(text, outputFormat, 0);',
  'console.log(result);',
])}`
    case 'aes-gcm':
      return `${WEB_CRYPTO_COMPAT_HELPERS}

function parseBytes(value, encoding) {
  if (encoding === 'Utf8') return utf8ToBytes(value);
  if (encoding === 'Hex') {
    var clean = value.replace(/\\s+/g, '');
    var hexBytes = new Uint8Array(clean.length / 2);
    for (var i = 0; i < clean.length; i += 2) {
      hexBytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return hexBytes;
  }
  if (encoding === 'Base64') {
    return base64ToBytes(value);
  }
  throw new Error('Unsupported encoding: ' + encoding);
}

function stringifyBytes(bytes, encoding) {
  if (encoding === 'Hex') {
    return Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }
  return bytesToBase64(bytes);
}

async function aesGcmEncrypt(text, key, options) {
  options = options || {};
  var webCrypto = getWebCrypto();
  var cryptoKey = await webCrypto.subtle.importKey(
    'raw',
    parseBytes(key, options.keyEncoding || 'Utf8'),
    'AES-GCM',
    false,
    ['encrypt']
  );
  var encrypted = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: parseBytes(options.iv || '', options.ivEncoding || 'Utf8') },
    cryptoKey,
    utf8ToBytes(text)
  );
  return stringifyBytes(new Uint8Array(encrypted), options.outputEncoding || 'Base64');
}

async function aesGcmDecrypt(ciphertext, key, options) {
  options = options || {};
  var webCrypto = getWebCrypto();
  var cryptoKey = await webCrypto.subtle.importKey(
    'raw',
    parseBytes(key, options.keyEncoding || 'Utf8'),
    'AES-GCM',
    false,
    ['decrypt']
  );
  var decrypted = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: parseBytes(options.iv || '', options.ivEncoding || 'Utf8') },
    cryptoKey,
    parseBytes(ciphertext, options.outputEncoding || 'Base64')
  );
  return bytesToUtf8(new Uint8Array(decrypted));
}

(async function () {
${buildExampleBlock(params, [
  `  var value = ${JSON.stringify(params.input)};`,
  `  var key = ${JSON.stringify(params.key)};`,
  `  var options = ${JSON.stringify({ keyEncoding: params.keyEncoding, iv: params.iv, ivEncoding: params.ivEncoding, outputEncoding: params.outputEncoding }, null, 2).replace(/\n/g, '\n  ')};`,
  `  var result = await ${params.isEncrypt ? 'aesGcmEncrypt' : 'aesGcmDecrypt'}(value, key, options);`,
  '  console.log(result);',
])}
})().catch(console.error);`
    case 'xxtea':
      return `${RUNTIME_COMPAT_HELPERS}

function toUint32Array(bytes, includeLength) {
  var length = bytes.length;
  var n = Math.ceil(length / 4);
  var result = new Uint32Array(includeLength ? n + 1 : n);
  for (var i = 0; i < length; i += 1) {
    result[i >>> 2] |= bytes[i] << ((i & 3) << 3);
  }
  if (includeLength) result[n] = length;
  return result;
}

function toBytes(data, includeLength) {
  var length = data.length * 4;
  if (includeLength) length = data[data.length - 1];
  var bytes = new Uint8Array(length);
  for (var i = 0; i < length; i += 1) {
    bytes[i] = (data[i >>> 2] >>> ((i & 3) << 3)) & 255;
  }
  return bytes;
}

function fixKey(keyBytes) {
  var fixed = new Uint8Array(16);
  fixed.set(keyBytes.subarray(0, 16));
  return toUint32Array(fixed, false);
}

function xxteaEncryptArray(data, key) {
  var n = data.length - 1;
  if (n < 1) return data;
  var z = data[n], y = data[0], sum = 0, delta = 0x9e3779b9, q = Math.floor(6 + 52 / (n + 1));
  while (q-- > 0) {
    sum = (sum + delta) >>> 0;
    var e = (sum >>> 2) & 3;
    for (var p = 0; p < n; p += 1) {
      y = data[p + 1];
      var mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0;
      z = data[p] = (data[p] + mx) >>> 0;
    }
    y = data[0];
    var lastMx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(n & 3) ^ e] ^ z))) >>> 0;
    z = data[n] = (data[n] + lastMx) >>> 0;
  }
  return data;
}

function xxteaDecryptArray(data, key) {
  var n = data.length - 1;
  if (n < 1) return data;
  var z = data[n], y = data[0], delta = 0x9e3779b9, q = Math.floor(6 + 52 / (n + 1)), sum = (q * delta) >>> 0;
  while (sum !== 0) {
    var e = (sum >>> 2) & 3;
    for (var p = n; p > 0; p -= 1) {
      z = data[p - 1];
      var mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0;
      y = data[p] = (data[p] - mx) >>> 0;
    }
    z = data[n];
    var firstMx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[e] ^ z))) >>> 0;
    y = data[0] = (data[0] - firstMx) >>> 0;
    sum = (sum - delta) >>> 0;
  }
  return data;
}

function bytesToHex(bytes) {
  return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
}

function hexToBytes(hex) {
  var clean = hex.replace(/\\s+/g, '');
  var bytes = new Uint8Array(clean.length / 2);
  for (var i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function xxteaEncrypt(text, key, outputEncoding) {
  var data = toUint32Array(utf8ToBytes(text), true);
  var encrypted = xxteaEncryptArray(data, fixKey(utf8ToBytes(key)));
  var bytes = toBytes(encrypted, false);
  return outputEncoding === 'Hex' ? bytesToHex(bytes) : bytesToBase64(bytes);
}

function xxteaDecrypt(ciphertext, key, inputEncoding) {
  var bytes = inputEncoding === 'Hex'
    ? hexToBytes(ciphertext)
    : base64ToBytes(ciphertext);
  var decrypted = xxteaDecryptArray(toUint32Array(bytes, false), fixKey(utf8ToBytes(key)));
  return bytesToUtf8(toBytes(decrypted, true));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var key = ${JSON.stringify(params.key)};`,
  `var result = ${params.isEncrypt ? 'xxteaEncrypt' : 'xxteaDecrypt'}(value, key, ${JSON.stringify(params.outputEncoding)});`,
  'console.log(result);',
])}`
    case 'tea':
    case 'xtea': {
      const encryptRounds = params.type === 'tea'
        ? `sum = (sum + delta) >>> 0;
      v0 = (v0 + ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0;
      v1 = (v1 + ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0;`
        : `v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + keyWords[sum & 3]))) >>> 0;
      sum = (sum + delta) >>> 0;
      v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + keyWords[(sum >>> 11) & 3]))) >>> 0;`
      const decryptRounds = params.type === 'tea'
        ? `v1 = (v1 - ((((v0 << 4) >>> 0) + keyWords[2]) ^ (v0 + sum) ^ (((v0 >>> 5) + keyWords[3]) >>> 0))) >>> 0;
      v0 = (v0 - ((((v1 << 4) >>> 0) + keyWords[0]) ^ (v1 + sum) ^ (((v1 >>> 5) + keyWords[1]) >>> 0))) >>> 0;
      sum = (sum - delta) >>> 0;`
        : `v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + keyWords[(sum >>> 11) & 3]))) >>> 0;
      sum = (sum - delta) >>> 0;
      v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + keyWords[sum & 3]))) >>> 0;`

      return `${RUNTIME_COMPAT_HELPERS}

function teaPad(bytes) {
  var blockSize = 8;
  var padding = blockSize - (bytes.length % blockSize || blockSize);
  var result = new Uint8Array(bytes.length + padding);
  result.set(bytes);
  result.fill(padding, bytes.length);
  return result;
}

function teaUnpad(bytes) {
  if (!bytes.length) return bytes;
  var padding = bytes[bytes.length - 1];
  if (padding <= 0 || padding > 8) return bytes;
  return bytes.slice(0, bytes.length - padding);
}

function teaKeyWords(key) {
  var keyBytes = new Uint8Array(16);
  keyBytes.set(utf8ToBytes(key).slice(0, 16));
  var words = new Uint32Array(4);
  for (var i = 0; i < 4; i += 1) {
    words[i] =
      ((keyBytes[i * 4] << 24) >>> 0) |
      ((keyBytes[i * 4 + 1] << 16) >>> 0) |
      ((keyBytes[i * 4 + 2] << 8) >>> 0) |
      (keyBytes[i * 4 + 3] >>> 0);
  }
  return words;
}

function teaBytesToHex(bytes) {
  return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
}

function teaHexToBytes(hex) {
  var clean = hex.replace(/\\s+/g, '');
  var bytes = new Uint8Array(clean.length / 2);
  for (var i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function teaOutput(bytes, format) {
  return format === 'Hex' ? teaBytesToHex(bytes) : bytesToBase64(bytes);
}

function teaInput(ciphertext, format) {
  return format === 'Hex'
    ? teaHexToBytes(ciphertext)
    : base64ToBytes(ciphertext);
}

function teaEncrypt(text, key, outputFormat) {
  var keyWords = teaKeyWords(key);
  var data = teaPad(utf8ToBytes(text));
  var out = new Uint8Array(data.length);
  var delta = 0x9e3779b9;

  for (var offset = 0; offset < data.length; offset += 8) {
    var v0 =
      ((data[offset] << 24) >>> 0) |
      ((data[offset + 1] << 16) >>> 0) |
      ((data[offset + 2] << 8) >>> 0) |
      data[offset + 3];
    var v1 =
      ((data[offset + 4] << 24) >>> 0) |
      ((data[offset + 5] << 16) >>> 0) |
      ((data[offset + 6] << 8) >>> 0) |
      data[offset + 7];
    var sum = 0;

    for (var i = 0; i < 32; i += 1) {
      ${encryptRounds}
    }

    out[offset] = (v0 >>> 24) & 255;
    out[offset + 1] = (v0 >>> 16) & 255;
    out[offset + 2] = (v0 >>> 8) & 255;
    out[offset + 3] = v0 & 255;
    out[offset + 4] = (v1 >>> 24) & 255;
    out[offset + 5] = (v1 >>> 16) & 255;
    out[offset + 6] = (v1 >>> 8) & 255;
    out[offset + 7] = v1 & 255;
  }

  return teaOutput(out, outputFormat || 'Base64');
}

function teaDecrypt(ciphertext, key, inputFormat) {
  var keyWords = teaKeyWords(key);
  var data = teaInput(ciphertext, inputFormat || 'Base64');
  var out = new Uint8Array(data.length);
  var delta = 0x9e3779b9;

  for (var offset = 0; offset < data.length; offset += 8) {
    var v0 =
      ((data[offset] << 24) >>> 0) |
      ((data[offset + 1] << 16) >>> 0) |
      ((data[offset + 2] << 8) >>> 0) |
      data[offset + 3];
    var v1 =
      ((data[offset + 4] << 24) >>> 0) |
      ((data[offset + 5] << 16) >>> 0) |
      ((data[offset + 6] << 8) >>> 0) |
      data[offset + 7];
    var sum = (delta * 32) >>> 0;

    for (var i = 0; i < 32; i += 1) {
      ${decryptRounds}
    }

    out[offset] = (v0 >>> 24) & 255;
    out[offset + 1] = (v0 >>> 16) & 255;
    out[offset + 2] = (v0 >>> 8) & 255;
    out[offset + 3] = v0 & 255;
    out[offset + 4] = (v1 >>> 24) & 255;
    out[offset + 5] = (v1 >>> 16) & 255;
    out[offset + 6] = (v1 >>> 8) & 255;
    out[offset + 7] = v1 & 255;
  }

  return bytesToUtf8(teaUnpad(out));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var key = ${JSON.stringify(params.key)};`,
  `var result = ${params.isEncrypt ? 'teaEncrypt' : 'teaDecrypt'}(value, key, ${JSON.stringify(params.outputEncoding)});`,
  'console.log(result);',
])}`
    }
    case 'xor-chain':
      return `${RUNTIME_COMPAT_HELPERS}

function xorChainEncrypt(text, initialKey) {
  var bytes = utf8ToBytes(text);
  var encrypted = [];
  var key = initialKey || 0;

  for (var i = 0; i < bytes.length; i += 1) {
    var encryptedByte = bytes[i] ^ key;
    encrypted.push(encryptedByte);
    key = encryptedByte;
  }

  return bytesToBase64(new Uint8Array(encrypted));
}

function xorChainDecrypt(ciphertext, initialKey) {
  var bytes = base64ToBytes(ciphertext);

  var decrypted = [];
  var key = initialKey || 0;
  for (var j = 0; j < bytes.length; j += 1) {
    var decryptedByte = bytes[j] ^ key;
    decrypted.push(decryptedByte);
    key = bytes[j];
  }

  return bytesToUtf8(new Uint8Array(decrypted));
}

${buildExampleBlock(params, [
  `var value = ${JSON.stringify(params.input)};`,
  `var initialKey = ${JSON.stringify(params.xorInitialKey)};`,
  `var result = ${params.isEncrypt ? 'xorChainEncrypt' : 'xorChainDecrypt'}(value, initialKey);`,
  'console.log(result);',
])}`
    default:
      return ''
  }
}

function buildUnsupportedScript(params: ScriptBuildParams): string {
  return `// Unsupported self-contained code generation
// Type: ${params.type}
// This algorithm is not backed by the local CryptoJS bundle and does not have a built-in pure JS generator yet.
// The in-app encrypt/decrypt result still works, but "Generate Code" for this type is not available right now.
`
}
