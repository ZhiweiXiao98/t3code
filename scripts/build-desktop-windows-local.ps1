param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$Distro = "Ubuntu-24.04",
  [switch]$RefreshWslPrebuild
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

Push-Location $repoRoot
try {
  $prebuildOutput = @(
    & (Join-Path $PSScriptRoot "build-wsl-node-pty-prebuild.ps1") `
      -Distro $Distro `
      -Force:$RefreshWslPrebuild
  )
  if ($LASTEXITCODE -ne 0 -or $prebuildOutput.Count -eq 0) {
    throw "Unable to prepare the WSL node-pty prebuild."
  }

  $prebuildPath = [string]$prebuildOutput[-1]
  if (-not (Test-Path -LiteralPath $prebuildPath)) {
    throw "WSL node-pty prebuild was not found at $prebuildPath"
  }

  $env:T3CODE_DESKTOP_VERSION = $Version
  $env:T3CODE_DESKTOP_WSL_PREBUILD = $prebuildPath
  $env:T3CODE_DESKTOP_REUSE_RESOURCE_MONITOR = "1"

  & (Join-Path $repoRoot "node_modules\.bin\vp.cmd") run "dist:desktop:win:x64"
  if ($LASTEXITCODE -ne 0) {
    throw "Windows desktop packaging failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
