import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

export const buildSm4EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  return {
    description: 'WT-JS_SM4',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'key', comment: '参数2' },
      { name: 'iv', comment: '参数3' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('key')}, ${quoteParam('iv')})`,
    script: `${EASY_BINARY_HELPERS}

function WT_IsHex32(value) {
  return /^[0-9a-fA-F]{32}$/.test(value);
}

function WT_Sm4NormalizeHex(value, label) {
  var clean = WT_String(value).replace(/\\s+/g, '');
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

  if (${JSON.stringify(params.mode)} === 'cbc') {
    options.mode = 'cbc';
    options.iv = WT_Sm4NormalizeHex(iv, 'SM4 iv');
  }

  return options;
}

function WT_Run(text, key, iv) {
  var normalizedKey = WT_Sm4NormalizeHex(key, 'SM4 key');
  var options = WT_Sm4Options(iv);

  if (${params.isEncrypt ? 'true' : 'false'}) {
    var encrypted = sm4.encrypt(String(text), normalizedKey, options);
    return ${JSON.stringify(params.outputEncoding)} === 'Base64'
      ? WT_Sm4HexToBase64(encrypted)
      : encrypted;
  }

  var input = ${JSON.stringify(params.outputEncoding)} === 'Base64'
    ? WT_Sm4Base64ToHex(String(text))
    : String(text);
  return sm4.decrypt(input, normalizedKey, options);
}`,
  }
}
