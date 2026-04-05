import { buildAdler32EasyLanguageRunner } from './adler32'
import { buildAesEasyLanguageRunner } from './aes'
import { buildAesGcmEasyLanguageRunner } from './aesGcm'
import { buildBase32EasyLanguageRunner } from './base32'
import { buildBase58EasyLanguageRunner } from './base58'
import { buildBase64EasyLanguageRunner } from './base64'
import { buildBase64UrlEasyLanguageRunner } from './base64url'
import { buildBase85EasyLanguageRunner } from './base85'
import { buildBase91EasyLanguageRunner } from './base91'
import { buildBlake2bEasyLanguageRunner } from './blake2b'
import { buildBlake2sEasyLanguageRunner } from './blake2s'
import { buildBlake3EasyLanguageRunner } from './blake3'
import { buildCrc16EasyLanguageRunner } from './crc16'
import { buildCrc32EasyLanguageRunner } from './crc32'
import { buildDesEasyLanguageRunner } from './des'
import { buildEvpkdfEasyLanguageRunner } from './evpkdf'
import { buildFnv1aEasyLanguageRunner } from './fnv1a'
import { buildHmacEasyLanguageRunner } from './hmac'
import { buildHexEasyLanguageRunner } from './hex'
import { buildHtmlEasyLanguageRunner } from './html'
import { buildMd5EasyLanguageRunner } from './md5'
import { buildMurmurhash3EasyLanguageRunner } from './murmurhash3'
import { buildPbkdf2EasyLanguageRunner } from './pbkdf2'
import { buildKeccak256EasyLanguageRunner } from './keccak256'
import { buildProtobufEasyLanguageRunner } from './protobuf'
import { buildRabbitEasyLanguageRunner } from './rabbit'
import { buildRc4EasyLanguageRunner } from './rc4'
import { buildRipemd160EasyLanguageRunner } from './ripemd160'
import { buildRsaEasyLanguageRunnerEntry } from './rsa'
import { buildRsaSignEasyLanguageRunnerEntry } from './rsaSign'
import { buildShaEasyLanguageRunner } from './sha'
import { buildSha3256EasyLanguageRunner } from './sha3256'
import { buildSm3EasyLanguageRunner } from './sm3'
import { buildSm2EasyLanguageRunnerEntry } from './sm2'
import { buildSm2SignEasyLanguageRunnerEntry } from './sm2Sign'
import { buildSm4EasyLanguageRunner } from './sm4'
import { buildScryptEasyLanguageRunner } from './scrypt'
import { buildTeaEasyLanguageRunner } from './tea'
import { buildTripleDesEasyLanguageRunner } from './tripleDes'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'
import { buildUnicodeEasyLanguageRunner } from './unicode'
import { buildUrlEasyLanguageRunner } from './url'
import { buildUtf16EasyLanguageRunner } from './utf16'
import { buildXteaEasyLanguageRunner } from './xtea'
import { buildXorChainEasyLanguageRunner } from './xorChain'
import { buildXxteaEasyLanguageRunner } from './xxtea'

type EasyLanguageBuilder = (params: EasyLanguageScriptParams) => EasyLanguageRunner

const EASY_LANGUAGE_BUILDERS: Record<string, EasyLanguageBuilder> = {
  md5: buildMd5EasyLanguageRunner,
  sha: buildShaEasyLanguageRunner,
  ripemd160: buildRipemd160EasyLanguageRunner,
  crc32: buildCrc32EasyLanguageRunner,
  crc16: buildCrc16EasyLanguageRunner,
  adler32: buildAdler32EasyLanguageRunner,
  fnv1a: buildFnv1aEasyLanguageRunner,
  murmurhash3: buildMurmurhash3EasyLanguageRunner,
  blake2s: buildBlake2sEasyLanguageRunner,
  blake2b: buildBlake2bEasyLanguageRunner,
  blake3: buildBlake3EasyLanguageRunner,
  keccak256: buildKeccak256EasyLanguageRunner,
  'sha3-256': buildSha3256EasyLanguageRunner,
  sm3: buildSm3EasyLanguageRunner,
  sm2: buildSm2EasyLanguageRunnerEntry,
  'sm2-sign': buildSm2SignEasyLanguageRunnerEntry,
  hmac: buildHmacEasyLanguageRunner,
  aes: buildAesEasyLanguageRunner,
  'aes-gcm': buildAesGcmEasyLanguageRunner,
  tea: buildTeaEasyLanguageRunner,
  xtea: buildXteaEasyLanguageRunner,
  des: buildDesEasyLanguageRunner,
  '3des': buildTripleDesEasyLanguageRunner,
  rc4: buildRc4EasyLanguageRunner,
  rabbit: buildRabbitEasyLanguageRunner,
  xxtea: buildXxteaEasyLanguageRunner,
  sm4: buildSm4EasyLanguageRunner,
  rsa: buildRsaEasyLanguageRunnerEntry,
  'rsa-sign': buildRsaSignEasyLanguageRunnerEntry,
  pbkdf2: buildPbkdf2EasyLanguageRunner,
  evpkdf: buildEvpkdfEasyLanguageRunner,
  scrypt: buildScryptEasyLanguageRunner,
  base64: buildBase64EasyLanguageRunner,
  base64url: buildBase64UrlEasyLanguageRunner,
  base58: buildBase58EasyLanguageRunner,
  base32: buildBase32EasyLanguageRunner,
  base85: buildBase85EasyLanguageRunner,
  base91: buildBase91EasyLanguageRunner,
  hex: buildHexEasyLanguageRunner,
  url: buildUrlEasyLanguageRunner,
  utf16: buildUtf16EasyLanguageRunner,
  unicode: buildUnicodeEasyLanguageRunner,
  html: buildHtmlEasyLanguageRunner,
  protobuf: buildProtobufEasyLanguageRunner,
  'xor-chain': buildXorChainEasyLanguageRunner,
}

export const getEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner | null => {
  const builder = EASY_LANGUAGE_BUILDERS[params.type]
  return builder ? builder(params) : null
}
