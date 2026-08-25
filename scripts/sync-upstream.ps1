[CmdletBinding()]
param(
    [ValidateSet("Status", "Bootstrap", "Sync")]
    [string]$Mode = "Sync",
    [string]$RepositoryRoot = "",
    [string]$UpstreamUrl = "https://github.com/SuperGness/codey.git",
    [string]$OriginUrl = "https://github.com/TttXxx36/Codey.git",
    [string]$UpstreamRemote = "upstream",
    [string]$OriginRemote = "origin",
    [string]$UpstreamBranch = "",
    [string]$LocalBranch = "codey-custom",
    [switch]$Push
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    $RepositoryRoot = Split-Path -Parent $PSScriptRoot
}
$RepositoryRoot = [IO.Path]::GetFullPath($RepositoryRoot)
$StateRoot = Join-Path $RepositoryRoot ".codex-sync"
$BackupRoot = Join-Path $StateRoot "bootstrap-backups"
$FeaturePaths = @(
    "backend/src/config.rs",
    "backend/src/commands.rs",
    "backend/src/cdp.rs",
    "backend/src/launcher.rs",
    "public/codex-appearance.js",
    "src/App.tsx",
    "src/App.types.ts",
    "src/CodexAppearanceCard.tsx",
    "src/styles.features.css",
    "tests/codex-appearance.test.mjs",
    "scripts/sync-upstream.ps1"
)

function Write-SyncReport {
    param(
        [string]$Status,
        [string]$Reason,
        [hashtable]$Extra = @{}
    )

    New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
    $report = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        mode = $Mode
        status = $Status
        reason = $Reason
        repositoryRoot = $RepositoryRoot
        upstream = $UpstreamUrl
        origin = $OriginUrl
        localBranch = $LocalBranch
        featurePaths = $FeaturePaths
    }
    foreach ($entry in $Extra.GetEnumerator()) {
        $report[$entry.Key] = $entry.Value
    }
    $reportPath = Join-Path $StateRoot "last-sync.json"
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-Host ("[Codey upstream] {0}: {1}" -f $Status, $Reason)
    Write-Host ("[Codey upstream] report: {0}" -f $reportPath)
}

function Stop-Sync {
    param(
        [string]$Reason,
        [int]$Code = 2,
        [hashtable]$Extra = @{}
    )
    Write-SyncReport -Status "blocked" -Reason $Reason -Extra $Extra
    exit $Code
}

function Find-Git {
    $command = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        (Join-Path $env:ProgramFiles "Git/cmd/git.exe"),
        (Join-Path $env:ProgramFiles "Git/bin/git.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Git/cmd/git.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs/Git/cmd/git.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs/Git/bin/git.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
    return $candidates | Select-Object -First 1
}

$Git = Find-Git
if (-not $Git) {
    Stop-Sync "Git was not found. Install Git for Windows first; the script will not change the worktree without Git."
}

if (-not (Test-Path -LiteralPath $RepositoryRoot -PathType Container)) {
    Stop-Sync "Repository directory does not exist: $RepositoryRoot"
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$AllowFailure
    )
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell promotes native stderr to a terminating error when
        # ErrorActionPreference is Stop. Git's exit code is the source of truth
        # here, so capture stderr and restore the caller preference afterward.
        $ErrorActionPreference = "Continue"
        $output = @(& $Git -C $RepositoryRoot @Arguments 2>&1)
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $exitCode = $LASTEXITCODE
    $text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "git $($Arguments -join ' ') failed ($exitCode): $text"
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Text = $text
        Lines = $output
    }
}

$insideWorkTree = Invoke-Git -Arguments @("rev-parse", "--is-inside-work-tree") -AllowFailure
if ($insideWorkTree.ExitCode -ne 0 -or $insideWorkTree.Text.Trim() -ne "true") {
    Stop-Sync "The target directory is not a Git worktree: $RepositoryRoot"
}

function Get-RemoteUrl {
    param([string]$Remote)
    $result = Invoke-Git -Arguments @("remote", "get-url", $Remote) -AllowFailure
    if ($result.ExitCode -ne 0) { return "" }
    return $result.Text.Trim()
}

function Ensure-Remote {
    param(
        [string]$Remote,
        [string]$Url
    )
    $existing = Get-RemoteUrl $Remote
    if ($existing) {
        if ($existing -ne $Url) {
            Write-Host ("[Codey upstream] Keeping existing remote {0}: {1}" -f $Remote, $existing)
        }
        return $existing
    }
    Invoke-Git -Arguments @("remote", "add", $Remote, $Url) | Out-Null
    Write-Host ("[Codey upstream] Registered remote {0}: {1}" -f $Remote, $Url)
    return $Url
}

function Get-CurrentBranch {
    $result = Invoke-Git -Arguments @("branch", "--show-current") -AllowFailure
    if ($result.ExitCode -ne 0) { return "" }
    return $result.Text.Trim()
}

function Get-UpstreamBranch {
    if ($UpstreamBranch) { return $UpstreamBranch }
    $head = Invoke-Git -Arguments @("symbolic-ref", "--quiet", "--short", "refs/remotes/$UpstreamRemote/HEAD") -AllowFailure
    if ($head.ExitCode -eq 0 -and $head.Text.Trim()) {
        return ($head.Text.Trim() -replace "^$([regex]::Escape($UpstreamRemote))/", "")
    }
    foreach ($candidate in @("main", "master")) {
        $probe = Invoke-Git -Arguments @("show-ref", "--verify", "--quiet", "refs/remotes/$UpstreamRemote/$candidate") -AllowFailure
        if ($probe.ExitCode -eq 0) { return $candidate }
    }
    return ""
}

function Get-WorkingChanges {
    $result = Invoke-Git -Arguments @("status", "--porcelain", "--untracked-files=all")
    return @($result.Lines | ForEach-Object { $_.ToString() } | Where-Object { $_.Trim() })
}

function Get-ConflictPaths {
    $result = Invoke-Git -Arguments @("diff", "--name-only", "--diff-filter=U") -AllowFailure
    return @($result.Lines | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
}

function Get-FeatureConflicts {
    param([string[]]$Paths)
    return @($Paths | Where-Object { $FeaturePaths -contains $_ })
}

function Write-BundleBackup {
    param([string]$Label)
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    $safeLabel = $Label -replace "[^0-9A-Za-z_-]", "_"
    $bundlePath = Join-Path $BackupRoot ("codey-{0}-{1}.bundle" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $safeLabel)
    $result = Invoke-Git -Arguments @("bundle", "create", $bundlePath, "--all") -AllowFailure
    if ($result.ExitCode -ne 0) {
        return ""
    }
    return $bundlePath
}

function Copy-WorkingSnapshot {
    param([string]$Destination)
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $excluded = @(".git", ".codex-sync", "node_modules", "target", "dist-overlay")
    Get-ChildItem -LiteralPath $RepositoryRoot -Force | Where-Object {
        $excluded -notcontains $_.Name
    } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

function Restore-WorkingSnapshot {
    param([string]$Source)
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $RepositoryRoot -Recurse -Force
    }
}

if ($Mode -eq "Status") {
    $head = Invoke-Git -Arguments @("rev-parse", "--verify", "HEAD") -AllowFailure
    $branch = Get-CurrentBranch
    $changes = Get-WorkingChanges
    Write-SyncReport -Status "status" -Reason "Status checked; no sync was executed." -Extra @{
        git = $Git
        hasCommit = ($head.ExitCode -eq 0)
        branch = $branch
        dirty = ($changes.Count -gt 0)
        changes = $changes
        currentUpstream = (Get-RemoteUrl $UpstreamRemote)
        currentOrigin = (Get-RemoteUrl $OriginRemote)
    }
    exit 0
}

$upstreamRemoteUrl = Ensure-Remote -Remote $UpstreamRemote -Url $UpstreamUrl
$originRemoteUrl = Ensure-Remote -Remote $OriginRemote -Url $OriginUrl

if ($Mode -eq "Bootstrap") {
    $head = Invoke-Git -Arguments @("rev-parse", "--verify", "HEAD") -AllowFailure
    if ($head.ExitCode -eq 0) {
        Stop-Sync "The repository already has commits; use -Mode Sync instead of creating another baseline."
    }

    $fetch = Invoke-Git -Arguments @("fetch", $UpstreamRemote, "--tags") -AllowFailure
    if ($fetch.ExitCode -ne 0) {
        Stop-Sync "Unable to fetch upstream; the current worktree was not touched." -Extra @{ gitOutput = $fetch.Text }
    }
    $branch = Get-UpstreamBranch
    if (-not $branch) {
        Stop-Sync "Upstream was fetched, but its default branch could not be determined; pass -UpstreamBranch main or master."
    }

    $snapshot = Join-Path $env:TEMP ("codey-bootstrap-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    Copy-WorkingSnapshot -Destination $snapshot
    try {
        Invoke-Git -Arguments @("checkout", "-B", $LocalBranch, "$UpstreamRemote/$branch") | Out-Null
        Restore-WorkingSnapshot -Source $snapshot
        Invoke-Git -Arguments @("add", "-A") | Out-Null
        Invoke-Git -Arguments @("commit", "-m", "chore: import local Codey snapshot") | Out-Null
        $bundle = Write-BundleBackup -Label "baseline"
        Write-SyncReport -Status "bootstrapped" -Reason "Created a local custom baseline with shared upstream history; future merges are now safe." -Extra @{
            git = $Git
            branch = $LocalBranch
            upstreamBranch = $branch
            backupBundle = $bundle
            snapshotPath = $snapshot
        }
        exit 0
    } catch {
        Write-SyncReport -Status "error" -Reason "Baseline creation failed; the snapshot was kept for recovery." -Extra @{
            error = $_.Exception.Message
            snapshotPath = $snapshot
        }
        exit 3
    }
}

$currentBranch = Get-CurrentBranch
if (-not $currentBranch) {
    Stop-Sync "The repository is in detached HEAD; sync stopped to avoid merging upstream into an untracked position."
}
$head = Invoke-Git -Arguments @("rev-parse", "--verify", "HEAD") -AllowFailure
if ($head.ExitCode -ne 0) {
    Stop-Sync "The repository has no commits. Review the snapshot and run -Mode Bootstrap to establish shared history."
}
$changes = Get-WorkingChanges
if ($changes.Count -gt 0) {
    Stop-Sync "The worktree has uncommitted or untracked changes; sync stopped without stash, reset, or clean." -Extra @{ branch = $currentBranch; changes = $changes }
}

$fetch = Invoke-Git -Arguments @("fetch", $UpstreamRemote, "--tags") -AllowFailure
if ($fetch.ExitCode -ne 0) {
    Stop-Sync "Upstream fetch failed; the current commit was not modified." -Extra @{ branch = $currentBranch; gitOutput = $fetch.Text }
}
$branch = Get-UpstreamBranch
if (-not $branch) {
    Stop-Sync "The upstream default branch could not be determined; no merge was executed." -Extra @{ branch = $currentBranch }
}
$target = "$UpstreamRemote/$branch"
$bundle = Write-BundleBackup -Label "before-merge"
try {
    Invoke-Git -Arguments @("merge", "--no-edit", $target) | Out-Null
} catch {
    $conflicts = Get-ConflictPaths
    $featureConflicts = Get-FeatureConflicts -Paths $conflicts
    Write-SyncReport -Status "conflict" -Reason "The upstream merge conflicted; the Git conflict state was preserved for manual resolution." -Extra @{
        branch = $currentBranch
        upstreamBranch = $branch
        conflicts = $conflicts
        featureConflicts = $featureConflicts
        backupBundle = $bundle
        error = $_.Exception.Message
    }
    exit 4
}

$after = Get-WorkingChanges
if ($after.Count -gt 0) {
    Write-SyncReport -Status "merged" -Reason "Upstream was merged; review and commit the merge result." -Extra @{
        branch = $currentBranch
        upstreamBranch = $branch
        backupBundle = $bundle
        changes = $after
    }
} else {
    Write-SyncReport -Status "up-to-date" -Reason "Upstream was checked; no merge was needed." -Extra @{
        branch = $currentBranch
        upstreamBranch = $branch
        backupBundle = $bundle
    }
}

if ($Push) {
    Invoke-Git -Arguments @("push", $OriginRemote, $currentBranch) | Out-Null
    Write-Host ("[Codey upstream] Pushed to {0}/{1}" -f $OriginRemote, $currentBranch)
}

exit 0
