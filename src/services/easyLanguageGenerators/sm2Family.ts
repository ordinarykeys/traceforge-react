import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

const SM2_COMMON_HELPERS = `${EASY_BINARY_HELPERS}

function WT_Sm2NormalizeHex(value, label) {
  var clean = WT_String(value).replace(/\\s+/g, '');

  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(label + ' must be hex');
  }

  if (clean.length % 2 !== 0) {
    clean = '0' + clean;
  }

  return clean.toLowerCase();
}

function WT_Sm2LeftPad(value, length) {
  var output = WT_String(value);
  while (output.length < length) {
    output = '0' + output;
  }
  return output;
}

function WT_Sm2NormalizePublicKey(value) {
  var clean = WT_Sm2NormalizeHex(value, 'SM2 publicKey');

  if (clean.length === 128) {
    return '04' + clean;
  }

  if (clean.length === 130 && clean.substr(0, 2) === '04') {
    return clean;
  }

  throw new Error('SM2 publicKey must be 128 or 130 hex characters');
}

function WT_Sm2NormalizePrivateKey(value) {
  var clean = WT_Sm2NormalizeHex(value, 'SM2 privateKey');

  if (clean.length !== 64) {
    throw new Error('SM2 privateKey must be 64 hex characters');
  }

  return clean;
}

function WT_Sm2EncodeLength(length) {
  var hex = length.toString(16);

  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }

  if (length < 128) {
    return hex;
  }

  return (128 + (hex.length / 2)).toString(16) + hex;
}

function WT_Sm2ReadLength(hex, index) {
  var first = parseInt(hex.substr(index, 2), 16);

  if (first < 128) {
    return {
      value: first,
      next: index + 2
    };
  }

  var byteCount = first & 127;
  var value = parseInt(hex.substr(index + 2, byteCount * 2), 16);

  return {
    value: value,
    next: index + 2 + byteCount * 2
  };
}

function WT_Sm2DerInteger(hex) {
  var clean = WT_Sm2NormalizeHex(hex, 'SM2 signature');
  clean = clean.replace(/^0+/, '');

  if (!clean) {
    clean = '00';
  }

  if (clean.length % 2 !== 0) {
    clean = '0' + clean;
  }

  if (parseInt(clean.substr(0, 2), 16) >= 128) {
    clean = '00' + clean;
  }

  return '02' + WT_Sm2EncodeLength(clean.length / 2) + clean;
}

function WT_Sm2RawToDer(rawSignature) {
  var clean = WT_Sm2NormalizeHex(rawSignature, 'SM2 signature');

  if (clean.length !== 128) {
    throw new Error('SM2 raw signature must be 128 hex characters');
  }

  var body = WT_Sm2DerInteger(clean.substr(0, 64)) + WT_Sm2DerInteger(clean.substr(64, 64));
  return '30' + WT_Sm2EncodeLength(body.length / 2) + body;
}

function WT_Sm2DerToRaw(signature) {
  var clean = WT_Sm2NormalizeHex(signature, 'SM2 signature');
  var pos;
  var rLength;
  var sLength;
  var r;
  var s;

  if (clean.length === 128) {
    return clean;
  }

  if (clean.substr(0, 2) !== '30') {
    throw new Error('SM2 DER signature must start with 30');
  }

  pos = WT_Sm2ReadLength(clean, 2).next;
  if (clean.substr(pos, 2) !== '02') {
    throw new Error('Invalid SM2 DER signature');
  }

  rLength = WT_Sm2ReadLength(clean, pos + 2);
  r = clean.substr(rLength.next, rLength.value * 2);
  pos = rLength.next + rLength.value * 2;

  if (clean.substr(pos, 2) !== '02') {
    throw new Error('Invalid SM2 DER signature');
  }

  sLength = WT_Sm2ReadLength(clean, pos + 2);
  s = clean.substr(sLength.next, sLength.value * 2);

  r = r.replace(/^0+/, '');
  s = s.replace(/^0+/, '');

  return WT_Sm2LeftPad(r || '0', 64) + WT_Sm2LeftPad(s || '0', 64);
}`

export const buildSm2EasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  const encryptMode = params.sm2CipherMode === 0 ? 0 : 1

  if (params.isEncrypt) {
    return {
      description: 'WT-JS_SM2',
      parameters: [
        { name: 'text', comment: '参数1' },
        { name: 'publicKey', comment: '参数2' },
      ],
      evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('publicKey')})`,
      script: `${SM2_COMMON_HELPERS}

function WT_Run(text, publicKey) {
  return sm2.doEncrypt(String(text), WT_Sm2NormalizePublicKey(publicKey), ${encryptMode});
}`,
    }
  }

  return {
    description: 'WT-JS_SM2',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'privateKey', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('privateKey')})`,
    script: `${SM2_COMMON_HELPERS}

function WT_Run(text, privateKey) {
  return sm2.doDecrypt(String(text), WT_Sm2NormalizePrivateKey(privateKey), ${encryptMode});
}`,
  }
}

export const buildSm2SignEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  if (params.isEncrypt) {
    return {
      description: 'WT-JS_SM2_SIGN',
      parameters: [
        { name: 'text', comment: '参数1' },
        { name: 'privateKey', comment: '参数2' },
        { name: 'userId', comment: '参数3' },
      ],
      evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('privateKey')}, ${quoteParam('userId')})`,
      script: `${SM2_COMMON_HELPERS}

function WT_Run(text, privateKey, userId) {
  var rawSignature = sm2.doSignature(String(text), WT_Sm2NormalizePrivateKey(privateKey), {
    userId: WT_String(userId || ${JSON.stringify(params.userId || '1234567812345678')}),
    der: false
  });

  return WT_Sm2RawToDer(rawSignature);
}`,
    }
  }

  return {
    description: 'WT-JS_SM2_SIGN',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'signature', comment: '参数2' },
      { name: 'publicKey', comment: '参数3' },
      { name: 'userId', comment: '参数4' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('signature')}, ${quoteParam('publicKey')}, ${quoteParam('userId')})`,
    script: `${SM2_COMMON_HELPERS}

function WT_Run(text, signature, publicKey, userId) {
  var rawSignature = WT_Sm2DerToRaw(signature);
  return String(sm2.doVerifySignature(String(text), rawSignature, WT_Sm2NormalizePublicKey(publicKey), {
    userId: WT_String(userId || ${JSON.stringify(params.userId || '1234567812345678')}),
    der: false
  }));
}`,
  }
}
