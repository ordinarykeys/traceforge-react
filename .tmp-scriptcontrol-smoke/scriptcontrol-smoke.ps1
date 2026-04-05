
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

$unicode = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("5L2g5aW9IFdUIOW3peWFtyAxMjM="))
$md5Expected = "bd8e860f1d85ebf3b788339ac379e0a3"
$md5Actual = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\md5.js" $unicode 'lower32'
if ($md5Actual -ne $md5Expected) {
  throw "MD5 mismatch: expected $md5Expected actual $md5Actual"
}

$aesCipher = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\aes_encrypt.js" $unicode '0123456789abcdef' '0123456789abcdef'
$aesPlain = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\aes_decrypt.js" $aesCipher '0123456789abcdef' '0123456789abcdef'
if ($aesPlain -ne $unicode) {
  throw "AES roundtrip mismatch: expected $unicode actual $aesPlain"
}

$utf16Cipher = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\utf16_encrypt.js" $unicode
$utf16Plain = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\utf16_decrypt.js" $utf16Cipher
if ($utf16Plain -ne $unicode) {
  throw "UTF16 roundtrip mismatch: expected $unicode actual $utf16Plain"
}

$sm4Cipher = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\sm4_encrypt.js" $unicode '0123456789abcdef' '0123456789abcdef'
$sm4Plain = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\sm4_decrypt.js" $sm4Cipher '0123456789abcdef' '0123456789abcdef'
if ($sm4Plain -ne $unicode) {
  throw "SM4 roundtrip mismatch: expected $unicode actual $sm4Plain"
}

$base64UrlCipher = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\base64url_encode.js" $unicode
$base64UrlPlain = Invoke-WtRun "D:\\pingfan\\tools\\traceforge-react\\.tmp-scriptcontrol-smoke\\base64url_decode.js" $base64UrlCipher
if ($base64UrlPlain -ne $unicode) {
  throw "Base64URL roundtrip mismatch: expected $unicode actual $base64UrlPlain"
}

Write-Output 'PASS ScriptControl MD5 Unicode'
Write-Output 'PASS ScriptControl AES Unicode'
Write-Output 'PASS ScriptControl UTF16 Unicode'
Write-Output 'PASS ScriptControl SM4 Unicode'
Write-Output 'PASS ScriptControl Base64URL Unicode'
