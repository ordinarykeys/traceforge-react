param(
  [string]$Version,
  [switch]$BumpPatch,
  [ValidateSet("stable", "beta")]
  [string]$Channel = "stable",
  [string]$OutputRoot,
  [string]$Arch = "x86_64",
  [string]$BaseUrl = "https://www.brainchat.cn/traceforge-updater",
  [string]$Notes
)

$ErrorActionPreference = "Stop"

if ($Version -and $BumpPatch) {
  throw "Use either -Version or -BumpPatch, not both."
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$releaseScript = Join-Path $PSScriptRoot "release-tauri.ps1"
$publishScript = Join-Path $PSScriptRoot "publish-updater.ps1"
$tauriConfPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $projectRoot "release-updater"
}

if (!(Test-Path -LiteralPath $releaseScript)) {
  throw "release script not found: $releaseScript"
}
if (!(Test-Path -LiteralPath $publishScript)) {
  throw "publish script not found: $publishScript"
}
if (!(Test-Path -LiteralPath $tauriConfPath)) {
  throw "tauri.conf.json not found: $tauriConfPath"
}

# 1) Build + sign release artifacts
if ($Version) {
  & powershell -ExecutionPolicy Bypass -File $releaseScript -Version $Version
} elseif ($BumpPatch) {
  & powershell -ExecutionPolicy Bypass -File $releaseScript -BumpPatch
} else {
  & powershell -ExecutionPolicy Bypass -File $releaseScript
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# 2) Resolve actual version (after optional bump)
$tauriConf = Get-Content -LiteralPath $tauriConfPath -Raw | ConvertFrom-Json
$resolvedVersion = [string]$tauriConf.version
if ([string]::IsNullOrWhiteSpace($resolvedVersion)) {
  throw "Resolved version from tauri.conf.json is empty."
}

$installerPath = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis\TraceForge_${resolvedVersion}_x64-setup.exe"
if (!(Test-Path -LiteralPath $installerPath)) {
  $latestInstaller = Get-ChildItem -LiteralPath (Join-Path $projectRoot "src-tauri\target\release\bundle\nsis") -Filter "TraceForge_*_x64-setup.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latestInstaller) {
    throw "No installer found under src-tauri\\target\\release\\bundle\\nsis"
  }
  $installerPath = $latestInstaller.FullName
}

if ([string]::IsNullOrWhiteSpace($Notes)) {
  $Notes = "TraceForge $resolvedVersion release"
}

# 3) Publish flat layout payload (latest.json + exe + sig)
& powershell -ExecutionPolicy Bypass -File $publishScript `
  -FlatLayout `
  -Channel $Channel `
  -Version $resolvedVersion `
  -InstallerPath $installerPath `
  -OutputRoot $OutputRoot `
  -Arch $Arch `
  -BaseUrl $BaseUrl `
  -Notes $Notes

if ($LASTEXITCODE -eq 0) {
  Write-Output "Published files directory: $OutputRoot"
}

exit $LASTEXITCODE
