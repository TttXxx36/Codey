# Codey UI design system

Phase 1 establishes a small semantic layer for the existing light UI. It is intentionally incremental: the Appearance settings region is the first migrated sample, while command names, persisted configuration, startup ordering, and the rest of the page remain unchanged.

## Ownership

| Layer | Owns | Does not own |
| --- | --- | --- |
| CSS tokens and feature styles | Semantic colors, surfaces, borders, text, emphasis, state colors, spacing, radii, shadows, focus rings, layout, responsive rules, and visual states | Accessible control behavior or business state |
| Mantine wrappers and shared primitives | Accessible controls, overlays, and stable UI patterns such as Surface, SectionHeader, StatusChip, FieldRow, and ActionGroup | Codex page DOM access, persistence, runtime commands, or feature-specific layout |
| Tailwind utilities | Compact, local utility composition that is already close to the markup | A second token system or large feature stylesheet |
| Feature components | User intent, config updates, and feature-specific structure | Reimplementing generic control, surface, or status patterns |

src/styles.css is the token source for the current light theme. Existing --mac-* and legacy aliases remain temporarily so unmigrated feature styles keep their current meaning while later migrations proceed one stable region at a time.

## Phase 1 sample

CodexAppearanceCard now uses the shared Mantine entry point for:

- SectionHeader and StatusChip for the section heading and background state.
- Surface for the settings card shell.
- FieldRow for the three labeled sliders and their live values.
- ActionGroup for the image actions.

The sample preserves background image selection and removal, image validation and resizing, background opacity, surface opacity, chat content width, immediate-apply messaging, and the existing Config update path.

## Guardrails

- Appearance settings are visual preferences; they are not the Injection mechanism.
- The Codex page DOM remains behind Injection and the DOM Adapter.
- Provider and Route configuration remain separate from the currently Applied Route.
- New primitives must remove concrete duplication or describe a stable interaction pattern before they are added.
- Visual changes should migrate one stable region at a time and use GitHub Actions evidence for checks and performance audits.
