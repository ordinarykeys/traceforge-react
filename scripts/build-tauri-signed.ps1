param(
  [string]$PrivateKeyPath = "$env:USERPROFILE\.tauri\traceforge-updater.key",
  [string]$PasswordPath = "$env:USERPROFILE\.tauri\traceforge-updater-password.txt",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $PrivateKeyPath)) {
  throw "Private key not found: $PrivateKeyPath"
}

if (!(Test-Path -LiteralPath $PasswordPath)) {
  throw "Signing password file not found: $PasswordPath"
}

$password = (Get-Content -LiteralPath $PasswordPath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($password)) {
  throw "Signing password is empty: $PasswordPath"
}

$privateKey = (Get-Content -LiteralPath $PrivateKeyPath -Raw)
if ([string]::IsNullOrWhiteSpace($privateKey)) {
  throw "Signing private key is empty: $PrivateKeyPath"
}

$privateKey = $privateKey.Trim()

$env:TAURI_SIGNING_PRIVATE_KEY = $privateKey
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = $PrivateKeyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $password

Write-Output "Using signing key: $PrivateKeyPath"
Write-Output "TAURI_SIGNING_PRIVATE_KEY has been set (length: $($env:TAURI_SIGNING_PRIVATE_KEY.Length))."
Write-Output "TAURI_SIGNING_PRIVATE_KEY_PATH has been set."

if ($SkipBuild) {
  Write-Output "SkipBuild enabled, environment prepared only."
  exit 0
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$tauriCli = Join-Path $projectRoot "node_modules\.bin\tauri.cmd"

if (Test-Path -LiteralPath $tauriCli) {
  Write-Output "Using local Tauri CLI: $tauriCli"
  & $tauriCli build
  exit $LASTEXITCODE
}

Write-Output "Local Tauri CLI not found, falling back to npm exec tauri build"
& npm exec -- tauri build
exit $LASTEXITCODE
