# Non-secret tests only. No actual keytool, credentials, network, or ACL writes.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$helper = Join-Path $PSScriptRoot 'Prepare-T3AndroidSigning.ps1'
foreach ($file in @($helper, $PSCommandPath)) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -ne 0) { throw "Parse failure in ${file}: $($parseErrors | Out-String)" }
}
. $helper -FunctionsOnly

$script:Results = New-Object 'System.Collections.Generic.List[string]'
$script:SuiteRoot = Join-Path ([IO.Path]::GetTempPath()) ('t3-signing-MOCK-ONLY-' + [Guid]::NewGuid().ToString('N'))
$originalLocalAppData = $env:LOCALAPPDATA
$originalOneDrive = $env:OneDrive
New-Item -ItemType Directory -Path $script:SuiteRoot | Out-Null

function Assert-True([bool]$Value, [string]$Message) {
    if (-not $Value) { throw "ASSERTION FAILED: $Message" }
}
function Expect-Failure([scriptblock]$Action, [string]$Pattern) {
    $observed = $null
    try { & $Action } catch { $observed = $_.Exception.Message }
    Assert-True ($null -ne $observed) 'Expected an exception, but operation succeeded.'
    Assert-True ($observed -like $Pattern) "Expected error matching '$Pattern', got '$observed'."
}
function Arg-Value([string[]]$Arguments, [string]$Name) {
    $index = [Array]::IndexOf($Arguments, $Name)
    if ($index -lt 0 -or $index + 1 -ge $Arguments.Length) { throw "Missing mock argument $Name" }
    return $Arguments[$index + 1]
}
function New-Scenario([string]$Name) {
    $script:Scenario = Join-Path $script:SuiteRoot $Name
    New-Item -ItemType Directory -Path $script:Scenario | Out-Null
    $env:LOCALAPPDATA = $script:Scenario
    $script:AnswerCreate = 'CREATE'
    $script:AnswerBackup = ''
    $script:AnswerMetadata = ''
    $script:MissingKeytool = $false
    $script:FailCertReq = $false
    $script:AclDenied = $false
    $script:Calls = New-Object 'System.Collections.Generic.List[string]'
    $script:AclReads = 0
}

# Override every route that could invoke an external key-management tool.
function Find-Keytool {
    if ($script:MissingKeytool) { throw 'MOCK: No existing JDK keytool found.' }
    return (Join-Path $script:Scenario 'MOCK-DO-NOT-EXECUTE-keytool.exe')
}
function Assert-PrivateDirectory([string]$Path) {
    $script:AclReads++
    # Deliberately no Set-Acl, icacls, or real security descriptor modification.
    if ($script:AclDenied) { throw 'MOCK: Folder grants access to another identity.' }
}
function Read-Host([string]$Prompt) {
    if ($Prompt -match 'CREATE') { return $script:AnswerCreate }
    if ($Prompt -match '(?i)metadata') { return $script:AnswerMetadata }
    if ($Prompt -match '(?i)\.p12|attachment|backup') { return $script:AnswerBackup }
    throw "Unexpected interactive prompt in mock test: $Prompt"
}
function Invoke-Keytool([string[]]$Arguments) {
    if ($Arguments.Count -lt 1) { throw 'Missing mocked keytool operation.' }
    foreach ($forbidden in @('-storepass', '-keypass', '-storepass:env', '-keypass:env')) {
        Assert-True (-not ($Arguments -contains $forbidden)) "Password argument forbidden: $forbidden"
    }
    $operation = $Arguments[0]
    $script:Calls.Add($operation)
    switch ($operation) {
        '-genkeypair' {
            $path = Arg-Value $Arguments '-keystore'
            Assert-True (-not (Test-Path -LiteralPath $path)) 'Must never overwrite an existing mock keystore.'
            [IO.File]::WriteAllText($path, 'NOT A KEY - PUBLIC MOCK FIXTURE')
        }
        '-exportcert' {
            $source = Arg-Value $Arguments '-keystore'
            Assert-True (Test-Path -LiteralPath $source) 'Mock certificate source must exist.'
            [IO.File]::WriteAllText((Arg-Value $Arguments '-file'), 'PUBLIC CERT TEST')
        }
        '-certreq' {
            if ($script:FailCertReq) { throw 'MOCK: private key recovery failed.' }
            $source = Arg-Value $Arguments '-keystore'
            Assert-True (Test-Path -LiteralPath $source) 'Mock recovery source must exist.'
            [IO.File]::WriteAllText((Arg-Value $Arguments '-file'), 'PUBLIC CSR TEST')
        }
        default { throw "Unknown operation blocked, NEVER executed: $operation" }
    }
}
function Create-Fixture {
    Start-T3Signing
    $root = Join-Path $script:Scenario 'T3CodeSigning'
    $script:AnswerMetadata = Join-Path $root 'public-signing-metadata.json'
    $download = Join-Path $script:Scenario 'downloaded attachment with spaces.p12'
    Copy-Item -LiteralPath (Join-Path $root 't3code-release.p12') -Destination $download
    $script:AnswerBackup = $download
    return $root
}

try {
    New-Scenario 'path-policy'
    Expect-Failure { Assert-SafeLocation '\\server\share\signing' } '*local Windows drive*'
    $env:OneDrive = Join-Path $script:Scenario 'OneDrive'
    Expect-Failure { Assert-SafeLocation (Join-Path $env:OneDrive 'signing') } '*OneDrive*'
    Assert-SafeLocation (Join-Path $script:Scenario 'OneDrive-sibling')
    $env:OneDrive = $originalOneDrive
    $script:Results.Add('local-path-and-OneDrive-policy: pass')

    New-Scenario 'cancel'
    $script:AnswerCreate = 'NO'
    Expect-Failure { Start-T3Signing } '*Cancel*'
    Assert-True ($script:Calls.Count -eq 0) 'Cancellation must not invoke keytool.'
    Assert-True (-not (Test-Path (Join-Path $script:Scenario 'T3CodeSigning'))) 'Cancellation must not create a signing folder.'
    $script:Results.Add('cancel: pass')

    New-Scenario 'missing-jdk'
    $script:MissingKeytool = $true
    Expect-Failure { Start-T3Signing } '*No existing JDK*'
    Assert-True ($script:Calls.Count -eq 0) 'Missing JDK must not invoke any command.'
    $script:Results.Add('missing-jdk: pass')

    New-Scenario 'acl-denied'
    $script:AclDenied = $true
    Expect-Failure { Start-T3Signing } '*Folder grants access*'
    Assert-True ($script:Calls.Count -eq 0) 'Unsafe ACL must stop before keytool.'
    $script:Results.Add('acl-denial-mocked: pass')

    New-Scenario 'success with spaces'
    $root = Create-Fixture
    $metadata = Get-Content -LiteralPath (Join-Path $root 'public-signing-metadata.json') -Raw | ConvertFrom-Json
    Assert-True ($metadata.packageName -eq 'com.zhiweixiao.t3code.zhcn') 'Package identity must be fixed.'
    Assert-True ($metadata.certificateSha256 -eq (Get-FileHash (Join-Path $root 'public-certificate.der') -Algorithm SHA256).Hash) 'Public certificate fingerprint mismatch.'
    Assert-True ($metadata.minimumNextVersionCode -ge 1000411) 'Version floor must exceed historical Android APK.'
    Assert-True (-not $metadata.backupRestoreVerified) 'Generation alone must not imply backup verification.'
    Assert-True (($script:Calls -join ',') -eq '-genkeypair,-exportcert') 'Unexpected generation operations.'
    $before = (Get-FileHash (Join-Path $root 't3code-release.p12')).Hash
    Expect-Failure { Start-T3Signing } '*already exists*'
    Assert-True ((Get-FileHash (Join-Path $root 't3code-release.p12')).Hash -eq $before) 'Existing identity was changed.'
    $script:Results.Add('generation-and-no-overwrite: pass')

    Start-T3Signing -VerifyBackup
    $proofPath = Join-Path $root 'public-backup-verification.json'
    Assert-True (Test-Path -LiteralPath $proofPath) 'Recovery should write public verification metadata.'
    $proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
    Assert-True (-not $proof.apkSigningVerified) 'Mock backup check must not claim an APK was signed.'
    Assert-True ($script:Calls -contains '-certreq') 'Recovery must exercise private-key operation interface.'
    Assert-True (@(Get-ChildItem -LiteralPath $root -Filter 'restore-check-*').Count -eq 0) 'Recovery temp folder must be cleaned.'
    $script:Results.Add('backup-recovery-mocked: pass')

    New-Scenario 'cross-machine-restore'
    $oldRoot = Create-Fixture
    $newMachine = Join-Path $script:Scenario 'separate-machine-profile'
    New-Item -ItemType Directory -Path $newMachine | Out-Null
    $env:LOCALAPPDATA = $newMachine
    $script:Calls.Clear()
    Start-T3Signing -VerifyBackup
    Assert-True (Test-Path (Join-Path $newMachine 'T3CodeSigning\public-backup-verification.json')) 'Cross-machine restore should accept selected public metadata.'
    Assert-True (-not ($script:Calls -contains '-genkeypair')) 'Recovery must never generate a replacement identity.'
    $script:Results.Add('cross-machine-metadata-selection: pass')

    New-Scenario 'bad-hash'
    $root = Create-Fixture
    [IO.File]::WriteAllText($script:AnswerBackup, 'CORRUPT PUBLIC MOCK FIXTURE')
    $script:Calls.Clear()
    Expect-Failure { Start-T3Signing -VerifyBackup } '*hash*'
    Assert-True ($script:Calls.Count -eq 0) 'Hash mismatch must stop before keytool.'
    Assert-True (-not (Test-Path (Join-Path $root 'public-backup-verification.json'))) 'Bad backup must not be marked verified.'
    $script:Results.Add('backup-hash-mismatch: pass')

    New-Scenario 'decrypt-failure'
    $root = Create-Fixture
    $script:FailCertReq = $true
    Expect-Failure { Start-T3Signing -VerifyBackup } '*private key recovery failed*'
    Assert-True (@(Get-ChildItem -LiteralPath $root -Filter 'restore-check-*').Count -eq 0) 'Failed recovery must clean only its temp folder.'
    Assert-True (Test-Path (Join-Path $root 't3code-release.p12')) 'Failure must preserve original.'
    Assert-True (Test-Path $script:AnswerBackup) 'Failure must preserve downloaded backup.'
    Assert-True (-not (Test-Path (Join-Path $root 'public-backup-verification.json'))) 'Failed recovery must not mark verified.'
    $script:Results.Add('backup-decrypt-failure-cleanup: pass')

    Write-Host "PowerShell $($PSVersionTable.PSVersion): parser + $($script:Results.Count) mock scenarios passed."
    $script:Results | ForEach-Object { Write-Host $_ }
    Write-Host 'MOCKS ONLY: no private keys created, no password prompts, no ACL mutations, no network. Native keytool interaction remains unverified.'
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    $env:OneDrive = $originalOneDrive
    Remove-Item -LiteralPath $script:SuiteRoot -Recurse -Force
}
