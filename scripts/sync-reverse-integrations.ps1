$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot

$skillSrc = Join-Path $workspaceRoot "hello_js_reverse_skill"
$mcpSrc = Join-Path $workspaceRoot "camoufox-reverse-mcp"

$skillDst = Join-Path $projectRoot "integrations\hello_js_reverse_skill"
$mcpDst = Join-Path $projectRoot "integrations\camoufox-reverse-mcp"

function Copy-IfExists {
    param(
        [string]$SourcePath,
        [string]$DestinationPath,
        [switch]$Recurse
    )

    if (Test-Path -LiteralPath $SourcePath) {
        if ($Recurse) {
            Copy-Item -Path $SourcePath -Destination $DestinationPath -Recurse -Force
        } else {
            Copy-Item -Path $SourcePath -Destination $DestinationPath -Force
        }
        return $true
    }

    return $false
}

New-Item -ItemType Directory -Path $skillDst -Force | Out-Null
New-Item -ItemType Directory -Path $mcpDst -Force | Out-Null

if (-not (Test-Path -LiteralPath $skillSrc)) {
    throw "Missing source repo: $skillSrc"
}
if (-not (Test-Path -LiteralPath $mcpSrc)) {
    throw "Missing source repo: $mcpSrc"
}

Copy-IfExists (Join-Path $skillSrc "SKILL.md") $skillDst | Out-Null
Copy-IfExists (Join-Path $skillSrc "README.md") $skillDst | Out-Null
Copy-IfExists (Join-Path $skillSrc "cases") $skillDst -Recurse | Out-Null
Copy-IfExists (Join-Path $skillSrc "references") $skillDst -Recurse | Out-Null
Copy-IfExists (Join-Path $skillSrc "scripts") $skillDst -Recurse | Out-Null
Copy-IfExists (Join-Path $skillSrc "templates") $skillDst -Recurse | Out-Null

Copy-IfExists (Join-Path $mcpSrc "README.md") $mcpDst | Out-Null
Copy-IfExists (Join-Path $mcpSrc "README_en.md") $mcpDst | Out-Null
Copy-IfExists (Join-Path $mcpSrc "pyproject.toml") $mcpDst | Out-Null
Copy-IfExists (Join-Path $mcpSrc "src") $mcpDst -Recurse | Out-Null
Copy-IfExists (Join-Path $mcpSrc "tests") $mcpDst -Recurse | Out-Null

Write-Host "Reverse integrations synced successfully."
