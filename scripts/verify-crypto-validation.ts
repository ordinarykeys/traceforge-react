import { DEFAULT_SCRIPT_PARAMS, generateExportArtifact } from "../src/lib/crypto";
import { previewCrypto } from "../src/lib/cryptoPreview";
import { validateCryptoParams, type CryptoValidationTarget } from "../src/lib/cryptoValidation";
import type { ScriptParams } from "../src/services/codeLoader";
import { installLocalPackageFetch } from "./_cryptoRegressionSupport";

type ValidationCase = {
  name: string;
  params: ScriptParams;
  target: CryptoValidationTarget;
  expectedMessagePart: string;
};

const withParams = (overrides: Partial<ScriptParams>): ScriptParams => ({
  ...DEFAULT_SCRIPT_PARAMS,
  input: "Hello WT",
  outputFormat: "Hex",
  outputEncoding: "Base64",
  ...overrides,
});

const cases: ValidationCase[] = [
  {
    name: "aes_invalid_key_length",
    params: withParams({
      type: "aes",
      key: "short-key",
      iv: "0123456789abcdef",
      mode: "CBC",
      padding: "Pkcs7",
      keyEncoding: "Utf8",
      ivEncoding: "Utf8",
      outputEncoding: "Base64",
      isEncrypt: true,
    }),
    target: "preview",
    expectedMessagePart: "AES key",
  },
  {
    name: "aes_invalid_iv_length_for_export",
    params: withParams({
      type: "aes",
      key: "0123456789abcdef",
      iv: "12345678",
      mode: "CBC",
      padding: "Pkcs7",
      keyEncoding: "Utf8",
      ivEncoding: "Utf8",
      outputEncoding: "Base64",
      isEncrypt: true,
    }),
    target: "js_source",
    expectedMessagePart: "AES IV",
  },
  {
    name: "rsa_missing_public_key",
    params: withParams({
      type: "rsa",
      publicKey: "",
      privateKey: "",
      isEncrypt: true,
    }),
    target: "preview",
    expectedMessagePart: "RSA public key",
  },
  {
    name: "rsa_sign_missing_signature",
    params: withParams({
      type: "rsa-sign",
      subType: "SHA256",
      publicKey: "-----BEGIN PUBLIC KEY-----x-----END PUBLIC KEY-----",
      signature: "",
      isEncrypt: false,
    }),
    target: "preview",
    expectedMessagePart: "Signature",
  },
  {
    name: "hmac_missing_key",
    params: withParams({
      type: "hmac",
      subType: "HMAC-SHA256",
      key: "",
    }),
    target: "js_source",
    expectedMessagePart: "HMAC key",
  },
  {
    name: "scrypt_invalid_cost_factor",
    params: withParams({
      type: "scrypt",
      input: "password",
      salt: "salt",
      keySize: 32,
      costFactor: 15,
      blockSizeFactor: 1,
      parallelism: 1,
    }),
    target: "preview",
    expectedMessagePart: "scrypt N",
  },
  {
    name: "protobuf_invalid_json",
    params: withParams({
      type: "protobuf",
      input: "{bad json}",
      isEncrypt: false,
    }),
    target: "preview",
    expectedMessagePart: "Protobuf JSON input",
  },
  {
    name: "protobuf_invalid_hex_source",
    params: withParams({
      type: "protobuf",
      input: "0xz1",
      protobufInputFormat: "hex",
      isEncrypt: true,
    }),
    target: "js_source",
    expectedMessagePart: "Protobuf input",
  },
  {
    name: "sm4_invalid_key",
    params: withParams({
      type: "sm4",
      key: "short",
      iv: "0123456789abcdef",
      mode: "cbc",
      outputEncoding: "Hex",
      isEncrypt: true,
    }),
    target: "preview",
    expectedMessagePart: "SM4 key",
  },
  {
    name: "xor_invalid_initial_key",
    params: withParams({
      type: "xor-chain",
      xorInitialKey: 999,
      isEncrypt: true,
    }),
    target: "preview",
    expectedMessagePart: "XOR initial key",
  },
  {
    name: "base64url_invalid_decode_input",
    params: withParams({
      type: "base64url",
      input: "abc$",
      isEncrypt: false,
    }),
    target: "preview",
    expectedMessagePart: "Base64URL",
  },
  {
    name: "url_invalid_decode_input",
    params: withParams({
      type: "url",
      input: "%",
      isEncrypt: false,
    }),
    target: "preview",
    expectedMessagePart: "URL",
  },
];

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectFailureMessage = async (item: ValidationCase) => {
  const result = validateCryptoParams(item.params, item.target);
  assert(!result.ok, `${item.name} unexpectedly passed validation`);
  assert(
    result.message.includes(item.expectedMessagePart),
    `${item.name} validation message mismatch\nexpected to include: ${item.expectedMessagePart}\nactual: ${result.message}`,
  );

  try {
    if (item.target === "preview") {
      await previewCrypto(item.params);
    } else {
      await generateExportArtifact(item.params, item.target);
    }
    throw new Error(`${item.name} unexpectedly passed runtime integration`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(item.expectedMessagePart),
      `${item.name} integration message mismatch\nexpected to include: ${item.expectedMessagePart}\nactual: ${message}`,
    );
  }
};

async function main() {
  installLocalPackageFetch();

  for (const item of cases) {
    await expectFailureMessage(item);
    console.log(`PASS ${item.name}`);
  }

  console.log(`All crypto validation cases passed (${cases.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
