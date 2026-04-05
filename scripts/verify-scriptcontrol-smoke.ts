import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { DEFAULT_SCRIPT_PARAMS } from "../src/lib/crypto";
import type { ScriptParams } from "../src/services/codeLoader";
import { generateEasyLanguageRuntimeScript } from "../src/services/codeLoader";
import { md5Results } from "../src/services/crypto";
import { ensureEmptyDir, installLocalPackageFetch } from "./_cryptoRegressionSupport";

const execFileAsync = promisify(execFile);
const outDir = path.resolve(process.cwd(), ".tmp-scriptcontrol-smoke");
const powershell32 = "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe";

const withParams = (overrides: Partial<ScriptParams>): ScriptParams => ({
  ...DEFAULT_SCRIPT_PARAMS,
  ...overrides,
});

async function writeRuntime(filename: string, params: ScriptParams) {
  const runtime = await generateEasyLanguageRuntimeScript(params);
  if (!runtime) {
    throw new Error(`Missing runtime for ${params.type}`);
  }

  const filePath = path.join(outDir, filename);
  await writeFile(filePath, runtime, "utf8");
  return filePath;
}

async function main() {
  installLocalPackageFetch();
  await ensureEmptyDir(outDir);

  const unicodeText = "\u4f60\u597d WT \u5de5\u5177 123";
  const unicodeBase64 = Buffer.from(unicodeText, "utf8").toString("base64");
  const md5Expected = md5Results(unicodeText).lower;

  const md5Runtime = await writeRuntime("md5.js", withParams({ type: "md5", input: unicodeText }));
  const aesEncryptRuntime = await writeRuntime(
    "aes_encrypt.js",
    withParams({
      type: "aes",
      input: unicodeText,
      key: "0123456789abcdef",
      iv: "0123456789abcdef",
      mode: "CBC",
      padding: "Pkcs7",
      keyEncoding: "Utf8",
      ivEncoding: "Utf8",
      outputEncoding: "Base64",
      isEncrypt: true,
    }),
  );
  const aesDecryptRuntime = await writeRuntime(
    "aes_decrypt.js",
    withParams({
      type: "aes",
      input: "",
      key: "0123456789abcdef",
      iv: "0123456789abcdef",
      mode: "CBC",
      padding: "Pkcs7",
      keyEncoding: "Utf8",
      ivEncoding: "Utf8",
      outputEncoding: "Base64",
      isEncrypt: false,
    }),
  );
  const utf16EncryptRuntime = await writeRuntime(
    "utf16_encrypt.js",
    withParams({
      type: "utf16",
      input: unicodeText,
      isEncrypt: true,
    }),
  );
  const utf16DecryptRuntime = await writeRuntime(
    "utf16_decrypt.js",
    withParams({
      type: "utf16",
      input: "",
      isEncrypt: false,
    }),
  );
  const sm4EncryptRuntime = await writeRuntime(
    "sm4_encrypt.js",
    withParams({
      type: "sm4",
      input: unicodeText,
      key: "0123456789abcdef",
      iv: "0123456789abcdef",
      mode: "cbc",
      outputEncoding: "Hex",
      isEncrypt: true,
    }),
  );
  const sm4DecryptRuntime = await writeRuntime(
    "sm4_decrypt.js",
    withParams({
      type: "sm4",
      input: "",
      key: "0123456789abcdef",
      iv: "0123456789abcdef",
      mode: "cbc",
      outputEncoding: "Hex",
      isEncrypt: false,
    }),
  );
  const base64UrlEncodeRuntime = await writeRuntime(
    "base64url_encode.js",
    withParams({
      type: "base64url",
      input: unicodeText,
      isEncrypt: true,
    }),
  );
  const base64UrlDecodeRuntime = await writeRuntime(
    "base64url_decode.js",
    withParams({
      type: "base64url",
      input: "",
      isEncrypt: false,
    }),
  );

  const smokeScript = String.raw`
$ErrorActionPreference = 'Stop'

function ConvertTo-JsLiteral {
  param([object]$Value)

  if ($null -eq $Value) {
    return 'null'
  }

  if ($Value -is [sbyte] -or $Value -is [byte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int32] -or $Value -is [uint32] -or $Value -is [int64] -or $Value -is [uint64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) {
    return [string]$Value
  }

  $text = [string]$Value
  $text = $text.Replace('\', '\\')
  $text = $text.Replace("'", "\\'")
  $text = $text.Replace("\`r", '\\r')
  $text = $text.Replace("\`n", '\\n')
  return "'" + $text + "'"
}

function Invoke-WtRun {
  param(
    [string]$ScriptPath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [object[]]$Args
  )

  $runtime = Get-Content -Raw -Path $ScriptPath
  $sc = New-Object -ComObject MSScriptControl.ScriptControl
  $sc.Language = 'JScript'
  $sc.AddCode($runtime)
  try {
    $jsArgs = @()
    foreach ($arg in $Args) {
      $jsArgs += ConvertTo-JsLiteral $arg
    }
    $expression = 'WT_Run(' + ($jsArgs -join ', ') + ')'
    return [string]$sc.Eval($expression)
  } finally {
    $null = $sc.Reset()
  }
}

$unicode = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${JSON.stringify(unicodeBase64)}))
$md5Expected = ${JSON.stringify(md5Expected)}
$md5Actual = Invoke-WtRun ${JSON.stringify(md5Runtime)} $unicode 'lower32'
if ($md5Actual -ne $md5Expected) {
  throw "MD5 mismatch: expected $md5Expected actual $md5Actual"
}

$aesCipher = Invoke-WtRun ${JSON.stringify(aesEncryptRuntime)} $unicode '0123456789abcdef' '0123456789abcdef'
$aesPlain = Invoke-WtRun ${JSON.stringify(aesDecryptRuntime)} $aesCipher '0123456789abcdef' '0123456789abcdef'
if ($aesPlain -ne $unicode) {
  throw "AES roundtrip mismatch: expected $unicode actual $aesPlain"
}

$utf16Cipher = Invoke-WtRun ${JSON.stringify(utf16EncryptRuntime)} $unicode
$utf16Plain = Invoke-WtRun ${JSON.stringify(utf16DecryptRuntime)} $utf16Cipher
if ($utf16Plain -ne $unicode) {
  throw "UTF16 roundtrip mismatch: expected $unicode actual $utf16Plain"
}

$sm4Cipher = Invoke-WtRun ${JSON.stringify(sm4EncryptRuntime)} $unicode '0123456789abcdef' '0123456789abcdef'
$sm4Plain = Invoke-WtRun ${JSON.stringify(sm4DecryptRuntime)} $sm4Cipher '0123456789abcdef' '0123456789abcdef'
if ($sm4Plain -ne $unicode) {
  throw "SM4 roundtrip mismatch: expected $unicode actual $sm4Plain"
}

$base64UrlCipher = Invoke-WtRun ${JSON.stringify(base64UrlEncodeRuntime)} $unicode
$base64UrlPlain = Invoke-WtRun ${JSON.stringify(base64UrlDecodeRuntime)} $base64UrlCipher
if ($base64UrlPlain -ne $unicode) {
  throw "Base64URL roundtrip mismatch: expected $unicode actual $base64UrlPlain"
}

Write-Output 'PASS ScriptControl MD5 Unicode'
Write-Output 'PASS ScriptControl AES Unicode'
Write-Output 'PASS ScriptControl UTF16 Unicode'
Write-Output 'PASS ScriptControl SM4 Unicode'
Write-Output 'PASS ScriptControl Base64URL Unicode'
`;

  const smokeScriptPath = path.join(outDir, "scriptcontrol-smoke.ps1");
  await writeFile(smokeScriptPath, smokeScript, "utf8");

  const { stdout, stderr } = await execFileAsync(
    powershell32,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", smokeScriptPath],
    {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  const output = `${stdout}${stderr}`.trim();
  if (!output) {
    throw new Error("No ScriptControl smoke output");
  }

  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
