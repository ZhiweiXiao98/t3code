# REVIEW DRAFT. Run locally in your own Windows PowerShell, not through chat.
# No network calls, downloads, email, GitHub access, or password logging.
# First run: creates ONE fixed signing identity. Later: -VerifyBackup only.
param([switch]$VerifyBackup, [switch]$FunctionsOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Find-Keytool {
    $command = Get-Command keytool.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @()
    if ($env:JAVA_HOME) { $candidates += (Join-Path $env:JAVA_HOME 'bin\keytool.exe') }
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe') }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'No existing JDK keytool found. Nothing installed or downloaded. Install an official JDK yourself, then retry.'
}
function Invoke-Keytool([string[]]$Arguments) {
    & $script:Keytool @Arguments
    if ($LASTEXITCODE -ne 0) { throw "keytool failed (exit $LASTEXITCODE). Do not generate a replacement key; preserve existing files." }
}
function Assert-SafeLocation([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.StartsWith('\\') -or $full -notmatch '^[A-Za-z]:\\') { throw 'Use a local Windows drive, not a network path.' }
    foreach ($syncRoot in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) {
        if ($syncRoot) {
            $prefix = [IO.Path]::GetFullPath($syncRoot).TrimEnd('\')
            if ($full -eq $prefix -or $full.StartsWith($prefix + '\', [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Signing files must not be placed in a configured OneDrive folder.'
            }
        }
    }
    $current = $full
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse-point paths are not supported for signing files.' }
        }
        $parent = Split-Path -Path $current -Parent
        if ($parent -eq $current) { break }
        $current = $parent
    }
}
function Assert-PrivateDirectory([string]$Path) {
    # Read-only ACL audit. No Set-Acl/icacls or ownership changes.
    $acl = Get-Acl -LiteralPath $Path
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowed = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    foreach ($rule in $rules) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
            $rule.IdentityReference.Value -notin $allowed -and [int]$rule.FileSystemRights -ne 0) {
            throw 'Folder grants access to another identity. Stop; permissions were NOT changed.'
        }
    }
}
function Start-T3Signing([switch]$VerifyBackup) {
$script:Keytool = Find-Keytool
Write-Host "Review existing JDK executable: $script:Keytool"
if (Test-Path -LiteralPath $script:Keytool -PathType Leaf) {
    Write-Host ('File version: ' + (Get-Item -LiteralPath $script:Keytool).VersionInfo.FileVersion)
}
Write-Host 'Only continue if this is your trusted JDK. No software is downloaded.'
if (-not $env:LOCALAPPDATA) { throw 'This draft requires Windows LOCALAPPDATA.' }
$root = Join-Path $env:LOCALAPPDATA 'T3CodeSigning'
$keystore = Join-Path $root 't3code-release.p12'
$metadata = Join-Path $root 'public-signing-metadata.json'
$alias = 't3code-release'
Assert-SafeLocation $root
Assert-PrivateDirectory $env:LOCALAPPDATA

if (-not $VerifyBackup) {
    # Refuse partial previous runs as well: never silently replace an identity.
    if (Test-Path -LiteralPath $root) {
        throw "Signing folder already exists: $root . Stop and inspect it; do not delete it or generate another key. Use -VerifyBackup for a completed setup."
    }
    Write-Host 'This creates a new permanent Android signing identity, incompatible with old signatures.'
    Write-Host 'Choose a UNIQUE random passphrase of at least six randomly chosen words, not a quotation. Enter it only at keytool prompts; write it on paper and store separately from email.'
    Write-Host 'Do not run in a recorded/shared terminal. Do not paste passwords into chat, commands, or email.'
    if ((Read-Host 'Type CREATE to approve local key creation') -cne 'CREATE') { throw 'Cancelled. Nothing created.' }
    New-Item -ItemType Directory -Path $root | Out-Null
    Assert-PrivateDirectory $root
    Invoke-Keytool -Arguments @('-genkeypair','-alias',$alias,'-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA','-validity','10000','-storetype','PKCS12','-keystore',$keystore,'-dname','CN=T3 Code Community Android')
    $certificate = Join-Path $root 'public-certificate.der'
    Invoke-Keytool -Arguments @('-exportcert','-alias',$alias,'-storetype','PKCS12','-keystore',$keystore,'-file',$certificate)
    $fingerprint = (Get-FileHash -LiteralPath $certificate -Algorithm SHA256).Hash
    [ordered]@{
        packageName = 'com.zhiweixiao.t3code.zhcn'
        alias = $alias
        certificateSha256 = $fingerprint
        keystoreSha256 = (Get-FileHash -LiteralPath $keystore -Algorithm SHA256).Hash
        createdUtc = [DateTime]::UtcNow.ToString('o')
        minimumNextVersionCode = 1000411
        versionCodeNote = 'Recheck latest published APK before release; the next code must exceed all previously published codes.'
        backupRestoreVerified = $false
    } | ConvertTo-Json | Set-Content -LiteralPath $metadata -Encoding UTF8
    Write-Host "Created encrypted keystore: $keystore"
    Write-Host "PUBLIC certificate SHA256: $fingerprint"
    Write-Host 'In your own email app, attach ONLY t3code-release.p12 and public-signing-metadata.json; send to your own confirmed backup mailbox.'
    Write-Host 'Never include the passphrase. No email was sent by this script.'
    Write-Host 'Download the received attachment to a DIFFERENT folder, then rerun this same script with -VerifyBackup.'
    Write-Host 'Do not publish an APK yet. Backup restore has NOT been verified.'
    return
}

if (-not (Test-Path -LiteralPath $metadata -PathType Leaf)) {
    $metadata = (Read-Host 'Full path of public-signing-metadata.json saved with your original backup').Trim('"')
    if (-not (Test-Path -LiteralPath $metadata -PathType Leaf)) { throw 'Public metadata missing. Do not create a new key.' }
}
$expected = Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json
if ($expected.alias -ne $alias -or $expected.packageName -ne 'com.zhiweixiao.t3code.zhcn' -or
    $expected.certificateSha256 -notmatch '^[A-Fa-f0-9]{64}$' -or $expected.keystoreSha256 -notmatch '^[A-Fa-f0-9]{64}$') { throw 'Unexpected public metadata. Stop.' }
$backupInput = (Read-Host 'Full path of the encrypted .p12 attachment downloaded from the RECEIVED email').Trim('"')
$backup = (Resolve-Path -LiteralPath $backupInput).Path
if ($backup -eq $keystore) { throw 'Choose the separately downloaded email attachment, not the original keystore.' }
if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $expected.keystoreSha256) {
    throw 'Downloaded attachment hash does not match. Stop; do not publish or replace the key.'
}
if (-not (Test-Path -LiteralPath $root)) { New-Item -ItemType Directory -Path $root | Out-Null }
Assert-PrivateDirectory $root
$checkFolder = Join-Path $root ('restore-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $checkFolder | Out-Null
Assert-PrivateDirectory $checkFolder
$restore = Join-Path $checkFolder 'restored.p12'
Copy-Item -LiteralPath $backup -Destination $restore
try {
    # A CSR requires using the private key: this tests actual decryptability,
    # not merely listing a public certificate. No CSR is sent anywhere.
    Invoke-Keytool -Arguments @('-certreq','-alias',$alias,'-storetype','PKCS12','-keystore',$restore,'-file',(Join-Path $checkFolder 'restore-test.csr'))
    $restoredCert = Join-Path $checkFolder 'restored-public.der'
    Invoke-Keytool -Arguments @('-exportcert','-alias',$alias,'-storetype','PKCS12','-keystore',$restore,'-file',$restoredCert)
    if ((Get-FileHash -LiteralPath $restoredCert -Algorithm SHA256).Hash -ne $expected.certificateSha256) { throw 'Certificate mismatch.' }
    [ordered]@{
        certificateSha256 = $expected.certificateSha256
        downloadedAttachmentSha256 = $expected.keystoreSha256
        restoredPrivateKeyUseVerifiedUtc = [DateTime]::UtcNow.ToString('o')
        method = 'User-selected backup hash + private-key CSR operation + certificate hash'
        emailProvenance = 'User reported; not independently verified by this script'
        apkSigningVerified = $false
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'public-backup-verification.json') -Encoding UTF8
    Write-Host 'Selected backup private-key recovery verified; email provenance is user-reported. Keep the received email and independently stored paper passphrase.'
    Write-Host 'Share only public-backup-verification.json and public-signing-metadata.json with dot, NEVER the .p12 or passphrase.'
    Write-Host 'GitHub Secrets configuration and an actual signed-APK verification remain separate approved steps.'
} finally {
    # Remove only this script-created recovery test folder. Original and email copy remain.
    Remove-Item -LiteralPath $checkFolder -Recurse -Force
}

}
if (-not $FunctionsOnly) { Start-T3Signing -VerifyBackup:$VerifyBackup }
