# Codey Regression Contract

## Baseline

- Repository: `TttXxx36/Codey`
- Base branch: `master`
- Verified remote baseline: `57b23bc9c7cfe4a210f9b8266502740af7571160`
- Verified package version: `0.8.14`
- Baseline verification date: 2026-08-26

This document records the behavior that Phase 0 and Phase 1 refactoring must preserve. It does not claim any startup, memory, or leak improvement unless a later GitHub Actions run or same-machine regression report proves it.

## Domain Boundaries

- Codey Config is durable user preference data; it is not the live Codex page Runtime state.
- Provider and Route configuration describe possible routing; they are not proof of the currently Applied Route.
- Appearance preferences describe background, content width, and opacity; they are not the Injection mechanism.
- Codex page DOM access belongs behind Injection and DOM Adapter boundaries.
- Runtime ownership covers launching, stopping, restarting, and status monitoring.
- Diagnostics ownership covers log, storage, health, and performance evidence.
- Sessions ownership covers conversation lists, metadata, import, export, and deletion behavior.
- Subagents ownership covers worker roles, routing policy, and orchestration state.

## Command And Event Stability

Phase 1 changes must preserve existing command names, persisted config shape, startup ordering, and release workflow behavior unless a later change documents a compatibility reason before implementation.

The current frontend preview bridge exercises these command names and should continue to do so:

- `load_codey_config`
- `runtime_status`
- `save_codey_config`
- `restart_codey`
- `sync_current_provider`
- `save_route`
- `activate_route`
- `delete_route`
- `fetch_route_models`
- `fetch_current_provider_models`
- `save_selected_models`
- `save_default_model`
- `save_official_route_models`
- `sync_prompt_optimization_current_provider`
- `fetch_prompt_optimization_models`
- `test_prompt_optimization`
- `reveal_prompt_optimization_api_key`
- `test_webhook`
- `test_notification_channel`
- `reveal_notification_channel`
- `refresh_diagnostic_storage_stats`
- `refresh_trace_log_stats`
- `clear_codex_trace_logs`
- `clear_diagnostic_storage`
- `check_for_updates`
- `download_update`
- `install_downloaded_update`

## Regression Checklist

- Startup: Codey can launch Codex without blocking on optional injection or update work.
- Stop and restart: running state, restart-in-progress state, and restart-required state remain distinguishable.
- Routing: route save, activate, delete, sync, and model fetch keep revision checks and stale-edit protection.
- Models: official models, upstream models, manually declared models, and default model selection remain separate.
- Sessions: session list, metadata repair, import, export, deletion, and ghost cleanup behavior remain protected.
- Notifications: each channel keeps its own secret-reveal, test, enable, and delete behavior.
- Subagents: global optimization toggle, default model, role-specific model, and reasoning effort settings remain separate.
- Diagnostics: trace log protection, Crashpad pending protection, refresh, and cleanup report their own evidence.
- Appearance: background image, background opacity, surface opacity, and chat content width remain user-editable and persist through Config.
- Injection: built-in and user scripts remain lifecycle-managed; feature scripts must report effective, inactive, failed, or unknown status.
- Share-adjacent settings: the settings entry point near the Codex Share area remains available.
- Release flow: ordinary PR checks must not publish a Release; Windows installer artifacts remain produced by the existing workflow rules.

## GitHub Actions Evidence Required

For Phase 1 pull requests, collect and report these runs before merge consideration:

- `Quality checks` pull request run.
- `Performance audit` pull request run and uploaded performance artifact.
- `Build Windows installer` run only when triggered by `master` push or explicit manual dispatch; do not treat an ordinary PR as a release build.

## UI Refactoring Guardrails

- Add shared UI primitives only when they remove concrete duplication or clarify a stable pattern.
- Keep Mantine responsible for accessible controls, overlays, and primitive behavior.
- Keep Tailwind usage scoped to compact utility composition already present in component markup.
- Keep CSS files responsible for layout, section structure, responsive behavior, and semantic design tokens.
- Replace hard-coded visual values gradually; do not rewrite unrelated page areas in the same change.
