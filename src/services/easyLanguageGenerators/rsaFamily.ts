import { quoteParam } from './common'
import { EASY_BINARY_HELPERS } from './simpleHelpers'
import type { EasyLanguageRunner, EasyLanguageScriptParams } from './types'

const buildRsaCommonHelpers = (params: EasyLanguageScriptParams) => {
  const cipherAlg = params.rsaPadding === 'OAEP' ? 'RSAOAEP256' : 'RSA'
  const signAlgMap: Record<string, string> = {
    SHA256: 'SHA256withRSA',
    SHA1: 'SHA1withRSA',
    SHA384: 'SHA384withRSA',
    SHA512: 'SHA512withRSA',
    MD5: 'MD5withRSA',
  }
  const signAlg = signAlgMap[params.subType] || 'SHA256withRSA'

  return `${EASY_BINARY_HELPERS}

function WT_RsaNormalizePem(value, label) {
  var text = WT_String(value).replace(/\\r\\n?/g, '\\n').replace(/^\\s+|\\s+$/g, '');
  if (text.indexOf('-----BEGIN ') !== 0) {
    throw new Error(label + ' must be a PEM key');
  }
  return text;
}

function WT_RsaGetPublicKey(value) {
  return KEYUTIL.getKey(WT_RsaNormalizePem(value, 'RSA publicKey'));
}

function WT_RsaGetPrivateKey(value) {
  return KEYUTIL.getKey(WT_RsaNormalizePem(value, 'RSA privateKey'));
}

function WT_RsaKeySizeBytes(key) {
  return Math.ceil(key.n.bitLength() / 8);
}

function WT_RsaUtf8Units(text) {
  var value = WT_String(text);
  var parts = [];
  var index = 0;

  while (index < value.length) {
    var code = value.charCodeAt(index);
    if (0xd800 <= code && code <= 0xdbff && index + 1 < value.length) {
      var next = value.charCodeAt(index + 1);
      if (0xdc00 <= next && next <= 0xdfff) {
        parts.push(value.substr(index, 2));
        index += 2;
        continue;
      }
    }

    parts.push(value.charAt(index));
    index += 1;
  }

  return parts;
}

function WT_RsaSplitUtf8(text, maxBytes) {
  var units = WT_RsaUtf8Units(text);
  var parts = [];
  var chunk = '';
  var size = 0;
  var i;

  for (i = 0; i < units.length; i += 1) {
    var unit = units[i];
    var unitBytes = WT_Utf8Encode(unit).length;

    if (unitBytes > maxBytes) {
      throw new Error('RSA input contains a character that exceeds the block size');
    }

    if (size + unitBytes > maxBytes && chunk.length > 0) {
      parts.push(chunk);
      chunk = unit;
      size = unitBytes;
    } else {
      chunk += unit;
      size += unitBytes;
    }
  }

  if (chunk.length || !parts.length) {
    parts.push(chunk);
  }

  return parts;
}

function WT_RsaNormalizeHex(value) {
  return WT_String(value).replace(/\\s+/g, '').toLowerCase();
}

function WT_RsaCipherHex(cipherText, format) {
  return format === 'Base64'
    ? b64tohex(WT_String(cipherText))
    : WT_RsaNormalizeHex(cipherText);
}

function WT_RsaCipherOutput(cipherHex, format) {
  return format === 'Base64'
    ? hex2b64(cipherHex)
    : cipherHex;
}

function WT_RsaEncryptLong(text, publicKey) {
  var key = WT_RsaGetPublicKey(publicKey);
  var maxBytes = ${params.rsaPadding === 'OAEP' ? 'WT_RsaKeySizeBytes(key) - 66' : 'WT_RsaKeySizeBytes(key) - 11'};
  var parts = WT_RsaSplitUtf8(text, maxBytes);
  var cipherHex = '';
  var i;

  for (i = 0; i < parts.length; i += 1) {
    cipherHex += KJUR.crypto.Cipher.encrypt(parts[i], key, ${JSON.stringify(cipherAlg)});
  }

  return WT_RsaCipherOutput(cipherHex, ${JSON.stringify(params.outputFormat)});
}

function WT_RsaDecryptLong(cipherText, privateKey) {
  var key = WT_RsaGetPrivateKey(privateKey);
  var cipherHex = WT_RsaCipherHex(cipherText, ${JSON.stringify(params.outputFormat)});
  var blockHexLength = WT_RsaKeySizeBytes(key) * 2;
  var output = '';
  var i;

  for (i = 0; i < cipherHex.length; i += blockHexLength) {
    var blockHex = cipherHex.substr(i, blockHexLength);
    if (!blockHex) {
      continue;
    }
    output += KJUR.crypto.Cipher.decrypt(blockHex, key, ${JSON.stringify(cipherAlg)});
  }

  return output;
}

function WT_RsaSignHex(text, privateKey) {
  var signer = new KJUR.crypto.Signature({ alg: ${JSON.stringify(signAlg)} });
  signer.init(WT_RsaGetPrivateKey(privateKey));
  signer.updateString(WT_String(text));
  return signer.sign();
}

function WT_RsaVerify(text, signature, publicKey) {
  var verifier = new KJUR.crypto.Signature({ alg: ${JSON.stringify(signAlg)} });
  var signatureHex = ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? b64tohex(WT_String(signature))
    : WT_RsaNormalizeHex(signature);
  verifier.init(WT_RsaGetPublicKey(publicKey));
  verifier.updateString(WT_String(text));
  return String(verifier.verify(signatureHex));
}`
}

export const buildRsaEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  const commonHelpers = buildRsaCommonHelpers(params)

  if (params.isEncrypt) {
    return {
      description: 'WT-JS_RSA',
      parameters: [
        { name: 'text', comment: '参数1' },
        { name: 'publicKey', comment: '参数2' },
      ],
      evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('publicKey')})`,
      script: `${commonHelpers}

function WT_Run(text, publicKey) {
  return WT_RsaEncryptLong(text, publicKey);
}`,
    }
  }

  return {
    description: 'WT-JS_RSA',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'privateKey', comment: '参数2' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('privateKey')})`,
    script: `${commonHelpers}

function WT_Run(text, privateKey) {
  return WT_RsaDecryptLong(text, privateKey);
}`,
  }
}

export const buildRsaSignEasyLanguageRunner = (params: EasyLanguageScriptParams): EasyLanguageRunner => {
  const commonHelpers = buildRsaCommonHelpers(params)

  if (params.isEncrypt) {
    return {
      description: 'WT-JS_RSA_SIGN',
      parameters: [
        { name: 'text', comment: '参数1' },
        { name: 'privateKey', comment: '参数2' },
      ],
      evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('privateKey')})`,
      script: `${commonHelpers}

function WT_Run(text, privateKey) {
  var signatureHex = WT_RsaSignHex(text, privateKey);
  return ${JSON.stringify(params.outputFormat)} === 'Base64'
    ? hex2b64(signatureHex)
    : signatureHex;
}`,
    }
  }

  return {
    description: 'WT-JS_RSA_SIGN',
    parameters: [
      { name: 'text', comment: '参数1' },
      { name: 'signature', comment: '参数2' },
      { name: 'publicKey', comment: '参数3' },
    ],
    evalExpression: `WT_Run(${quoteParam('text')}, ${quoteParam('signature')}, ${quoteParam('publicKey')})`,
    script: `${commonHelpers}

function WT_Run(text, signature, publicKey) {
  return WT_RsaVerify(text, signature, publicKey);
}`,
  }
}
