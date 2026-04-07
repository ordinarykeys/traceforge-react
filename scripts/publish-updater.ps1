param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("stable", "beta")]
  [string]$Channel,

  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputRoot,

  [string]$Arch = "x86_64",
  [string]$BaseUrl = "https://www.brainchat.cn/traceforge-updater",
  [string]$Notes = "TraceForge update",
  [switch]$FlatLayout
)

$ErrorActionPreference = "Stop"

function Write-TextUtf8NoBom([string]$path, [string]$content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
}

if (!(Test-Path -LiteralPath $InstallerPath)) {
  throw "Installer file not found: $InstallerPath"
}

$signaturePath = "$InstallerPath.sig"
if (!(Test-Path -LiteralPath $signaturePath)) {
  throw "Signature file not found: $signaturePath"
}

$channelDir = Join-Path $OutputRoot $Channel
$archDir = Join-Path $channelDir $Arch

if ($FlatLayout) {
  try {
    New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
  } catch {
    throw "Cannot create OutputRoot '$OutputRoot'. Check path and write permission."
  }
} else {
  try {
    New-Item -ItemType Directory -Path $archDir -Force | Out-Null
  } catch {
    throw "Cannot create target directory '$archDir'. Check path and write permission."
  }
}

$installerName = Split-Path -Leaf $InstallerPath
$signatureName = Split-Path -Leaf $signaturePath
$installerTarget = if ($FlatLayout) {
  Join-Path $OutputRoot $installerName
} else {
  Join-Path $archDir $installerName
}
$signatureTarget = if ($FlatLayout) {
  Join-Path $OutputRoot $signatureName
} else {
  Join-Path $archDir $signatureName
}

Copy-Item -LiteralPath $InstallerPath -Destination $installerTarget -Force
Copy-Item -LiteralPath $signaturePath -Destination $signatureTarget -Force

$signature = (Get-Content -LiteralPath $signatureTarget -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$url = if ($FlatLayout) {
  "$BaseUrl/$installerName"
} else {
  "$BaseUrl/$Channel/$Arch/$installerName"
}

$manifest = [ordered]@{
  version  = $Version
  notes    = $Notes
  pub_date = $pubDate
  url      = $url
  signature = $signature
}

$manifestJson = $manifest | ConvertTo-Json -Depth 5
$manifestPath = if ($FlatLayout) {
  Join-Path $OutputRoot "latest.json"
} else {
  Join-Path $archDir "latest.json"
}
Write-TextUtf8NoBom -path $manifestPath -content ($manifestJson + "`n")

# Guardrail: fail fast if BOM accidentally appears in manifest
$manifestBytes = [System.IO.File]::ReadAllBytes($manifestPath)
if ($manifestBytes.Length -eq 0 -or $manifestBytes[0] -ne 123) {
  throw "Invalid latest.json encoding/content: expected first byte '{' (123), got $($manifestBytes[0])."
}

Write-Output "Published updater payload:"
Write-Output "  Channel:   $Channel"
Write-Output "  Arch:      $Arch"
Write-Output "  Layout:    $(if ($FlatLayout) { 'flat' } else { 'channel/arch' })"
Write-Output "  Version:   $Version"
Write-Output "  Installer: $installerTarget"
Write-Output "  Signature: $signatureTarget"
Write-Output "  Manifest:  $manifestPath"
