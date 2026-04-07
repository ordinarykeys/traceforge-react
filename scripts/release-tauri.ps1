param(
  [string]$Version,
  [switch]$BumpPatch,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

if ($Version -and $BumpPatch) {
  throw "Use either -Version or -BumpPatch, not both."
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$tauriConfPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$cargoPath = Join-Path $projectRoot "src-tauri\Cargo.toml"
$packageJsonPath = Join-Path $projectRoot "package.json"

function Read-TextNoBom([string]$path) {
  $content = Get-Content -LiteralPath $path -Raw
  if ($content.Length -gt 0 -and [int][char]$content[0] -eq 0xFEFF) {
    return $content.Substring(1)
  }
  return $content
}

function Write-TextUtf8NoBom([string]$path, [string]$content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
}

if (!(Test-Path -LiteralPath $tauriConfPath)) {
  throw "tauri.conf.json not found: $tauriConfPath"
}
if (!(Test-Path -LiteralPath $cargoPath)) {
  throw "Cargo.toml not found: $cargoPath"
}
if (!(Test-Path -LiteralPath $packageJsonPath)) {
  throw "package.json not found: $packageJsonPath"
}

$tauriConf = (Read-TextNoBom $tauriConfPath) | ConvertFrom-Json
$currentVersion = [string]$tauriConf.version

function New-PatchVersion([string]$v) {
  $parts = $v.Split(".")
  if ($parts.Length -ne 3) {
    throw "Current version '$v' is not x.y.z format."
  }

  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $patch = [int]$parts[2]
  $patch += 1
  return "$major.$minor.$patch"
}

function Validate-Version([string]$v) {
  if ($v -notmatch '^\d+\.\d+\.\d+([\-+][0-9A-Za-z\.-]+)?$') {
    throw "Version '$v' is invalid. Expected semver like 0.1.4"
  }
}

$targetVersion = $null
if ($Version) {
  Validate-Version $Version
  $targetVersion = $Version
} elseif ($BumpPatch) {
  $targetVersion = New-PatchVersion $currentVersion
}

if ($targetVersion) {
  Write-Output "Updating version: $currentVersion -> $targetVersion"

  $tauriConf.version = $targetVersion
  Write-TextUtf8NoBom $tauriConfPath (($tauriConf | ConvertTo-Json -Depth 100) + "`n")

  $cargoRaw = Read-TextNoBom $cargoPath
  $cargoUpdated = [regex]::Replace($cargoRaw, '(?m)^version\s*=\s*".*"$', "version = `"$targetVersion`"", 1)
  Write-TextUtf8NoBom $cargoPath $cargoUpdated

  $packageRaw = (Read-TextNoBom $packageJsonPath) | ConvertFrom-Json
  $packageRaw.version = $targetVersion
  Write-TextUtf8NoBom $packageJsonPath (($packageRaw | ConvertTo-Json -Depth 100) + "`n")
} else {
  Write-Output "Version unchanged: $currentVersion"
}

if ($SkipBuild) {
  Write-Output "SkipBuild enabled, version sync completed."
  exit 0
}

$buildScript = Join-Path $PSScriptRoot "build-tauri-signed.ps1"
& powershell -ExecutionPolicy Bypass -File $buildScript
exit $LASTEXITCODE
