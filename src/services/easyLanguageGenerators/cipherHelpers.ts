import { quoteParam } from './common'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildBlockCipherEasyLanguageRunner = (
  params: EasyLanguageScriptParams,
  algorithm: 'AES' | 'DES' | 'TripleDES',
  description: string
): EasyLanguageRunner => {
  return {
    description,
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'key', comment: '参数2' },
      { name: 'iv', comment: '参数3' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('key')}, ${quoteParam('iv')})`,
    script: `function WT_ParseEncoder(name) {
  return CryptoJS.enc[name || 'Utf8'];
}

function WT_Run(text, key, iv) {
  var keyBytes = WT_ParseEncoder(${JSON.stringify(params.keyEncoding)}).parse(String(key));
  var options = {
    mode: CryptoJS.mode[${JSON.stringify(params.mode)}],
    padding: CryptoJS.pad[${JSON.stringify(params.padding)}]
  };

  if (${JSON.stringify(params.mode)} !== 'ECB') {
    options.iv = WT_ParseEncoder(${JSON.stringify(params.ivEncoding)}).parse(String(iv || ''));
  }

  if (${params.isEncrypt ? 'true' : 'false'}) {
    var encrypted = CryptoJS.${algorithm}.encrypt(String(text), keyBytes, options);
    return ${JSON.stringify(params.outputEncoding)} === 'Hex'
      ? encrypted.ciphertext.toString(CryptoJS.enc.Hex)
      : encrypted.toString();
  }

  var cipherInput = ${JSON.stringify(params.outputEncoding)} === 'Hex'
    ? CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Hex.parse(String(text)) })
    : String(text);
  var decrypted = CryptoJS.${algorithm}.decrypt(cipherInput, keyBytes, options);
  return decrypted.toString(CryptoJS.enc.Utf8);
}`,
  }
}

export const buildStreamCipherEasyLanguageRunner = (
  params: EasyLanguageScriptParams,
  algorithm: 'RC4' | 'Rabbit',
  description: string
): EasyLanguageRunner => {
  return {
    description,
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'key', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('key')})`,
    script: `function WT_ParseEncoder(name) {
  return CryptoJS.enc[name || 'Utf8'];
}

function WT_Run(text, key) {
  var keyBytes = WT_ParseEncoder(${JSON.stringify(params.keyEncoding)}).parse(String(key));
  if (${params.isEncrypt ? 'true' : 'false'}) {
    return CryptoJS.${algorithm}.encrypt(String(text), keyBytes).toString();
  }
  return CryptoJS.${algorithm}.decrypt(String(text), keyBytes).toString(CryptoJS.enc.Utf8);
}`,
  }
}
