import { createHash, createHmac } from "node:crypto";

import { previewCrypto } from "../src/lib/cryptoPreview";
import type { ScriptParams } from "../src/services/codeLoader";
import {
  buildCryptoRegressionSamples,
  protobufHex,
  sampleText,
  simpleText,
} from "./_cryptoRegressionFixtures";
import { normalize } from "./_cryptoRegressionSupport";

type PreviewCase = {
  name: string;
  verify: () => Promise<void>;
};

const roundTripTypes = new Set([
  "aes",
  "aes-gcm",
  "tea",
  "xtea",
  "des",
  "3des",
  "rc4",
  "rabbit",
  "xxtea",
  "sm4",
  "xor-chain",
  "rsa",
  "sm2",
  "base64",
  "base64url",
  "base58",
  "base32",
  "base85",
  "base91",
  "hex",
  "url",
  "utf16",
  "unicode",
  "html",
]);

const expectedByName: Record<string, string> = {
  md5_lower32: createHash("md5").update(simpleText, "utf8").digest("hex"),
  sha_sha1: createHash("sha1").update(simpleText, "utf8").digest("hex"),
  sha_sha256: createHash("sha256").update(simpleText, "utf8").digest("hex"),
  sha_sha512: createHash("sha512").update(simpleText, "utf8").digest("hex"),
  ripemd160_hex: createHash("ripemd160").update(simpleText, "utf8").digest("hex"),
  hmac_hmac_sha256: createHmac("sha256", "hmac-secret").update(sampleText, "utf8").digest("hex"),
};

const previewOutput = async (params: ScriptParams) => normalize((await previewCrypto(params)).output);

const assertEqual = (name: string, actual: string, expected: string) => {
  if (actual !== expected) {
    throw new Error(`${name} mismatch\nexpected: ${expected}\nactual:   ${actual}`);
  }
};

const assertTruthy = (name: string, actual: string) => {
  if (!actual) {
    throw new Error(`${name} returned empty output`);
  }
};

const createRoundTripCase = (name: string, params: ScriptParams): PreviewCase => ({
  name,
  verify: async () => {
    const cipher = await previewOutput(params);
    assertTruthy(`${name}_encrypt`, cipher);

    const plain = await previewOutput({
      ...params,
      input: cipher,
      isEncrypt: false,
    });

    assertEqual(`${name}_decrypt`, plain, params.input);
  },
});

const createSignatureCase = (name: string, params: ScriptParams): PreviewCase => ({
  name,
  verify: async () => {
    const signature = await previewOutput(params);
    assertTruthy(`${name}_sign`, signature);

    const verified = await previewOutput({
      ...params,
      isEncrypt: false,
      signature,
    });

    assertEqual(`${name}_verify`, verified, "true");
  },
});

const createDirectCase = (name: string, params: ScriptParams): PreviewCase => ({
  name,
  verify: async () => {
    const result = await previewOutput(params);
    assertTruthy(name, result);

    const expected = expectedByName[name];
    if (expected) {
      assertEqual(name, result, expected);
    }

    if (name === "protobuf_encode_hex") {
      assertEqual(name, result, protobufHex.toLowerCase());
    }

    if (name === "protobuf_parse_hex") {
      const parsed = JSON.parse(result) as Record<string, unknown>;
      if (String(parsed.field_1) !== "150" || parsed.field_2 !== "test") {
        throw new Error(`${name} parse mismatch\nactual: ${result}`);
      }
    }
  },
});

async function main() {
  const samples = await buildCryptoRegressionSamples();
  const cases: PreviewCase[] = samples.map((sample) => {
    if (sample.params.type === "rsa-sign" || sample.params.type === "sm2-sign") {
      return createSignatureCase(sample.name, sample.params);
    }

    if (roundTripTypes.has(sample.params.type)) {
      return createRoundTripCase(sample.name, sample.params);
    }

    return createDirectCase(sample.name, sample.params);
  });

  const failures: Array<{ name: string; error: string }> = [];

  for (const item of cases) {
    try {
      await item.verify();
      console.log(`PASS ${item.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ name: item.name, error: message });
      console.error(`FAIL ${item.name}`);
      console.error(message);
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} preview regression case(s) failed`);
  }

  console.log(`All crypto preview cases passed (${cases.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
