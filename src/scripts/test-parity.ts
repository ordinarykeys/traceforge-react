import { createHash, createHmac } from 'node:crypto';
import { previewCrypto } from '../lib/cryptoPreview.ts';
import { DEFAULT_SCRIPT_PARAMS } from '../lib/crypto.ts';

const simpleText = 'abc';
const sampleText = 'Hello <>&"\' 123';
const fixedKey = '0123456789abcdef';
const fixedIv = '0123456789abcdef';
const expectedHashes: Record<string, string> = {
  md5_lower32: createHash('md5').update(simpleText, 'utf8').digest('hex'),
  sha_sha1: createHash('sha1').update(simpleText, 'utf8').digest('hex'),
  sha_sha256: createHash('sha256').update(simpleText, 'utf8').digest('hex'),
  sha_sha512: createHash('sha512').update(simpleText, 'utf8').digest('hex'),
  ripemd160_hex: createHash('ripemd160').update(simpleText, 'utf8').digest('hex'),
  hmac_hmac_sha256: createHmac('sha256', 'hmac-secret').update(sampleText, 'utf8').digest('hex'),
};

const normalize = (text: string) => text.toLowerCase().trim();

async function main() {
  console.log('--- Lumo Coding Crypto Parity Test (Legacy Methodology) ---');
  let passCount = 0;
  let failCount = 0;

  const runTest = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passCount++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err instanceof Error ? err.message : String(err)}`);
      failCount++;
    }
  };

  const withParams = (overrides: any) => ({
    ...DEFAULT_SCRIPT_PARAMS,
    input: sampleText,
    outputFormat: 'Hex',
    outputEncoding: 'Base64',
    ...overrides,
  });

  // 1. Direct Hash Comparisons
  for (const [key, expected] of Object.entries(expectedHashes)) {
    await runTest(key, async () => {
      const parts = key.split('_');
      const type = parts[0];
      const subType = parts[1]?.toUpperCase();
      const params = withParams({ 
        type, 
        input: key.includes('hmac') ? sampleText : simpleText,
        subType: subType?.startsWith('HMAC') ? subType : (type === 'hmac' ? 'HMAC-SHA256' : subType),
        key: 'hmac-secret' 
      });
      const actual = normalize((await previewCrypto(params)).output);
      if (actual !== expected) throw new Error(`Mismatch!\nExp: ${expected}\nAct: ${actual}`);
    });
  }

  // 2. Symmetric Round-trip
  const symmetricCases = [
    { name: 'aes_cbc', params: withParams({ type: 'aes', mode: 'CBC', key: fixedKey, iv: fixedIv, isEncrypt: true }) },
    { name: 'des_cbc', params: withParams({ type: 'des', mode: 'CBC', key: '12345678', iv: '12345678', isEncrypt: true }) },
    { name: 'sm4_ecb', params: withParams({ type: 'sm4', mode: 'ecb', key: fixedKey, isEncrypt: true }) },
    { name: 'rc4', params: withParams({ type: 'rc4', key: fixedKey, isEncrypt: true }) },
    { name: 'xor_chain', params: withParams({ type: 'xor-chain', xorInitialKey: 77, isEncrypt: true }) },
    { name: 'base64', params: withParams({ type: 'base64', isEncrypt: true }) },
  ];

  for (const tc of symmetricCases) {
    await runTest(`${tc.name}_roundtrip`, async () => {
      const encrypted = (await previewCrypto(tc.params)).output;
      const decrypted = (await previewCrypto({ ...tc.params, input: encrypted, isEncrypt: false })).output;
      if (decrypted !== tc.params.input) throw new Error(`Round-trip failed!\nOrig: ${tc.params.input}\nDecr: ${decrypted}`);
    });
  }

  console.log(`\nResults: ${passCount} Passed, ${failCount} Failed.`);
  if (failCount > 0) process.exit(1);
}

main().catch(console.error);
