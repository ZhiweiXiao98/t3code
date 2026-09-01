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

function Get-RelativePathCompat {
  param(
    [string]$Root,
    [string]$Path
  )

  $separator = [System.IO.Path]::DirectorySeparatorChar
  $rootPrefix = $Root.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + $separator
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Android build input is outside the repository: $fullPath"
  }
  return $fullPath.Substring($rootPrefix.Length)
}

function Get-Sha256Hex {
  param([byte[]]$Bytes)

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha256.ComputeHash($Bytes)
  } finally {
    $sha256.Dispose()
  }
  return -join ($hash | ForEach-Object { $_.ToString("X2") })
}

function Get-AndroidNativeInputHash {
  param([string]$Root)

  $inputs = @(
    (Join-Path $Root "apps\mobile\app.config.ts")
    (Join-Path $Root "apps\mobile\package.json")
    (Join-Path $Root "pnpm-lock.yaml")
    (Join-Path $Root "scripts\lib\brand-assets.ts")
  )
  foreach ($directory in @("apps\mobile\plugins", "apps\mobile\assets", "assets\prod")) {
    $inputs += Get-ChildItem -LiteralPath (Join-Path $Root $directory) -File -Recurse |
      Select-Object -ExpandProperty FullName
  }

  $fingerprint = $inputs |
    Sort-Object |
    ForEach-Object {
      $relativePath = Get-RelativePathCompat -Root $Root -Path $_
      "$relativePath`0$((Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash)"
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($fingerprint -join "`n"))
  return Get-Sha256Hex -Bytes $bytes
}

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
  $env:NODE_ENV = "production"
  $mobileRoot = Join-Path $BuildRoot "apps\mobile"
  $androidRoot = Join-Path $mobileRoot "android"
  $expoCommand = Join-Path $BuildRoot "node_modules\.bin\expo.cmd"
  $nativeInputHash = Get-AndroidNativeInputHash -Root $BuildRoot
  $nativeInputMarker = Join-Path $cacheDirectory "android-native-inputs.sha256"
  $cachedNativeInputHash = if (Test-Path -LiteralPath $nativeInputMarker) {
    (Get-Content -Raw -LiteralPath $nativeInputMarker).Trim()
  } else {
    ""
  }
  if (
    $cachedNativeInputHash -ne $nativeInputHash -or
    -not (Test-Path -LiteralPath (Join-Path $androidRoot "app\build.gradle"))
  ) {
    Push-Location $mobileRoot
    try {
      & $expoCommand prebuild --platform android --no-install
      if ($LASTEXITCODE -ne 0) {
        throw "Android native project generation failed with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
    Set-Content -LiteralPath $nativeInputMarker -Value $nativeInputHash -Encoding ascii
  } else {
    Write-Host "Reusing the cached Android native project."
  }

  $versionInitScript = Join-Path $BuildRoot "scripts\android-release-version.init.gradle"
  Push-Location $androidRoot
  try {
    $gradleArguments = @(
      ":app:assembleRelease"
      "-PreactNativeArchitectures=arm64-v8a"
      "-Pt3codeVersionName=$Version"
      "-Pt3codeVersionCode=$VersionCode"
      "-I"
      $versionInitScript
      "--no-daemon"
    )
    $buildSucceeded = $false
    foreach ($attempt in 1..2) {
      & .\gradlew.bat @gradleArguments
      if ($LASTEXITCODE -eq 0) {
        $buildSucceeded = $true
        break
      }
      if ($attempt -lt 2) {
        Write-Warning "Android packaging failed once. Stopping stale Gradle daemons before retrying."
        & .\gradlew.bat --stop | Out-Null
        Start-Sleep -Seconds 3
      }
    }
    if (-not $buildSucceeded) {
      throw "Android release packaging failed after two attempts."
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
