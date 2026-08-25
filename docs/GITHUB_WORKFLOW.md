# GitHub-only maintenance workflow

## Build

The `Build Windows installer` workflow runs on pushes to `master` and on manual dispatch. It uses the committed `pnpm-lock.yaml` with a frozen install, runs the frontend and Rust checks, then builds and packages the Windows x64 installer.

Download the result from the workflow run's artifact named `codey-windows-x64-installer-<run-number>`. Artifacts are retained for 30 days.

## Release

The version source of truth is `package.json` and the Cargo workspace version. A commit whose message starts with `release: vX.Y.Z` runs the Windows build with a clean `X.Y.Z` installer name. After that build succeeds, the separate `Publish Windows Release` workflow creates or updates the matching GitHub Release and uploads the installer. Add matching notes at `docs/releases/vX.Y.Z.md` before creating the release commit. Ordinary commits keep the run-number suffix and only upload a 30-day Actions artifact; the build workflow itself has read-only repository permissions.

## Appearance scripts and Windows startup

The conversation background and width scripts remain in the repository and are still loaded when Codey is started manually. The Windows installer creates only the Start Menu and optional desktop shortcuts; it does not register these appearance scripts in the Startup folder, `Run` registry keys, or a scheduled task. The current machine was also checked and no matching startup entry was found, so the scripts are preserved without running at Windows sign-in.

## Upstream synchronization

The `Sync upstream safely` workflow runs every two days at 03:17 UTC and can also be started manually. It merges `SuperGness/codey` into `master` through `scripts/sync-upstream.ps1`.

The sync script refuses to proceed when the worktree is dirty, the repository has no usable branch, or the upstream branch cannot be identified. It creates a bundle backup before merging. Conflicts remain available for manual review; the workflow does not run reset, clean, stash, or an automatic ours/theirs conflict selection. A conflict report is uploaded and an Issue is opened when appropriate.

The appearance feature files and the sync script are protected feature paths. When upstream changes overlap those paths, review the merge before publishing a new build. A successful sync dispatches the Windows installer workflow.

## Maintainer rule

Make routine changes in GitHub. Review the Actions result and artifact before considering a change published. The local checkout is not required for the normal edit, sync, or build cycle.
