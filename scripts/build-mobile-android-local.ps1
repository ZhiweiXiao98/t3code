param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [int]$VersionCode = 0,
  [string]$BuildRoot = "C:\t3code-mobile-cache",
  [string]$OutputDirectory,
  [string]$AndroidSdk = (Join-Path $env:LOCALAPPDATA "Android\Sdk")
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$BuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repoRoot "release"
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$AndroidSdk = [System.IO.Path]::GetFullPath($AndroidSdk)
if (-not (Test-Path -LiteralPath $AndroidSdk)) {
  throw "Android SDK was not found at $AndroidSdk"
}

if ($VersionCode -le 0) {
  $versionMatch = [regex]::Match($Version, '^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)-cn\.(?<revision>\d+)$')
  if (-not $versionMatch.Success) {
    throw "Version must use the form 1.0.4-cn.4, or VersionCode must be provided explicitly."
  }

  $major = [int]$versionMatch.Groups['major'].Value
  $minor = [int]$versionMatch.Groups['minor'].Value
  $patch = [int]$versionMatch.Groups['patch'].Value
  $revision = [int]$versionMatch.Groups['revision'].Value
  if ($minor -gt 99 -or $patch -gt 99 -or $revision -gt 99) {
    throw "Version components minor, patch, and cn revision must each be between 0 and 99."
  }
  $VersionCode = ($major * 1000000) + ($minor * 10000) + ($patch * 100) + $revision
}

Push-Location $repoRoot
try {
  $sourceCommit = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $sourceCommit) {
    throw "Unable to resolve the source commit."
  }

  if (Test-Path -LiteralPath $BuildRoot) {
    & git -C $BuildRoot rev-parse --is-inside-work-tree | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "The Android build path exists but is not a Git worktree: $BuildRoot"
    }

    $trackedChanges = @(& git -C $BuildRoot status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0 -or $trackedChanges.Count -gt 0) {
      throw "The cached Android worktree has tracked changes. Resolve them before rebuilding: $BuildRoot"
    }

    & git -C $BuildRoot checkout --detach $sourceCommit
  } else {
    & git worktree add --detach $BuildRoot $sourceCommit
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to prepare the short Android build worktree at $BuildRoot"
  }

  $lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $BuildRoot "pnpm-lock.yaml")).Hash
  $cacheDirectory = Join-Path $BuildRoot ".t3\build-cache"
  $lockMarker = Join-Path $cacheDirectory "android-pnpm-lock.sha256"
  $installedHash = if (Test-Path -LiteralPath $lockMarker) {
    (Get-Content -Raw -LiteralPath $lockMarker).Trim()
  } else {
    ""
  }

  if ($installedHash -ne $lockHash -or -not (Test-Path -LiteralPath (Join-Path $BuildRoot "node_modules\.modules.yaml"))) {
    Push-Location $BuildRoot
    try {
      & pnpm.cmd install --frozen-lockfile --config.node-linker=hoisted
      if ($LASTEXITCODE -ne 0) {
        throw "The hoisted Android dependency install failed with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
    New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
    Set-Content -LiteralPath $lockMarker -Value $lockHash -Encoding ascii
  } else {
    Write-Host "Reusing the cached hoisted Android dependency tree."
  }

  $env:APP_VARIANT = "community"
  $env:T3CODE_MOBILE_VERSION = $Version
  $env:T3CODE_MOBILE_VERSION_CODE = $VersionCode.ToString()
  $env:ANDROID_HOME = $AndroidSdk
  $env:ANDROID_SDK_ROOT = $AndroidSdk
  $mobileRoot = Join-Path $BuildRoot "apps\mobile"
  $expoCommand = Join-Path $BuildRoot "node_modules\.bin\expo.cmd"
  Push-Location $mobileRoot
  try {
    & $expoCommand prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) {
      throw "Android native project generation failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }

  $androidRoot = Join-Path $mobileRoot "android"
  Push-Location $androidRoot
  try {
    & .\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
    if ($LASTEXITCODE -ne 0) {
      throw "Android release packaging failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }

  $apkPath = Join-Path $androidRoot "app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path -LiteralPath $apkPath)) {
    throw "Android packaging completed without producing $apkPath"
  }

  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  $outputPath = Join-Path $OutputDirectory "T3-Code-zh-CN-Android-$Version-arm64-v8a.apk"
  Copy-Item -LiteralPath $apkPath -Destination $outputPath -Force
  Write-Output $outputPath
} finally {
  Pop-Location
}
