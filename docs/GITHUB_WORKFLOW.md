# GitHub-only maintenance workflow

## Build

The `Build Windows installer` workflow runs on pushes to `master` and on manual dispatch. It uses the committed `pnpm-lock.yaml` with a frozen install, runs the frontend and Rust checks, then builds and packages the Windows x64 installer.

Download the result from the workflow run's artifact named `codey-windows-x64-installer-<run-number>`. Artifacts are retained for 30 days.

## Upstream synchronization

The `Sync upstream safely` workflow runs every two days at 03:17 UTC and can also be started manually. It merges `SuperGness/codey` into `master` through `scripts/sync-upstream.ps1`.

The sync script refuses to proceed when the worktree is dirty, the repository has no usable branch, or the upstream branch cannot be identified. It creates a bundle backup before merging. Conflicts remain available for manual review; the workflow does not run reset, clean, stash, or an automatic ours/theirs conflict selection. A conflict report is uploaded and an Issue is opened when appropriate.

The appearance feature files and the sync script are protected feature paths. When upstream changes overlap those paths, review the merge before publishing a new build. A successful sync dispatches the Windows installer workflow.

## Maintainer rule

Make routine changes in GitHub. Review the Actions result and artifact before considering a change published. The local checkout is not required for the normal edit, sync, or build cycle.
