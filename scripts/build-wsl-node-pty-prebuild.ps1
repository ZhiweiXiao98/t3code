param(
  [string]$Distro = "Ubuntu-24.04",
  [string]$OutputPath,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function ConvertTo-WslPath([string]$WindowsPath) {
  $fullPath = [System.IO.Path]::GetFullPath($WindowsPath)
  if ($fullPath -notmatch '^([A-Za-z]):\\(.*)$') {
    throw "Only local Windows drive paths can be converted for WSL: $fullPath"
  }

  $drive = $Matches[1].ToLowerInvariant()
  $tail = $Matches[2].Replace('\', '/')
  return "/mnt/$drive/$tail"
}

Push-Location $repoRoot
try {
  $manifestPath = (& node -e "console.log(require.resolve('node-pty/package.json', { paths: ['apps/server'] }))").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $manifestPath) {
    throw "Unable to resolve node-pty from apps/server. Run the workspace install first."
  }

  $nodePtyVersion = (& node -e "console.log(require(process.argv[1]).version)" $manifestPath).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $nodePtyVersion) {
    throw "Unable to read the node-pty version from $manifestPath"
  }

  if (-not $OutputPath) {
    $OutputPath = Join-Path $env:LOCALAPPDATA "T3CodeBuildCache\wsl-node-pty\$nodePtyVersion\linux-x64\pty.node"
  }
  $OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

  if ((Test-Path -LiteralPath $OutputPath) -and -not $Force) {
    Write-Host "Reusing cached WSL node-pty prebuild: $OutputPath"
    Write-Output $OutputPath
    return
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
  $sourceWsl = ConvertTo-WslPath (Split-Path -Parent $manifestPath)
  $outputWsl = ConvertTo-WslPath $OutputPath
  $builderWsl = ConvertTo-WslPath (Join-Path $PSScriptRoot "build-wsl-node-pty-prebuild.sh")

  & wsl.exe -d $Distro -- bash $builderWsl $sourceWsl $outputWsl
  if ($LASTEXITCODE -ne 0) {
    throw "WSL node-pty build failed with exit code $LASTEXITCODE."
  }
  if (-not (Test-Path -LiteralPath $OutputPath)) {
    throw "WSL node-pty build completed without producing $OutputPath"
  }

  Write-Output $OutputPath
} finally {
  Pop-Location
}
