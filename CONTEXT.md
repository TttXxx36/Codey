# Codey Context

Codey is a control surface for running and maintaining a Codex desktop session. These terms describe the product domain and the boundaries that future changes should preserve.

## Glossary

### App Shell

The Codey control surface that organizes navigation, page layout, global interaction state, and dialogs.

### Config

The durable Codey settings chosen by the user. Config is not the same thing as the current runtime state of a Codex page.

### Config Revision

The version marker attached to saved Config so concurrent edits can be detected before a change is accepted.

### Runtime

The currently observed Codex app process and its start, stop, restart, and health state. Runtime state can change without changing Config.

### Route

A selectable connection profile that describes how Codey should direct model requests. A saved Route is not proof that the route is currently active in Runtime.

### Provider

The upstream account or API-compatible service behind a Route.

### Model Catalog

The set of official, upstream, and manually declared models that Codey can present for a Route.

### Applied Route

The Route that Codey believes has been applied to the current Runtime. Provider Config and Applied Route can diverge until synchronized.

### Injection

The controlled act of adding Codey behavior to a Codex page. Injection is responsible for page access and lifecycle boundaries.

### DOM Adapter

The boundary that translates Codex page structure into stable operations for Codey features. Codey features should not directly depend on Codex page DOM details outside this boundary.

### Appearance

User-facing visual preferences for the Codex page, including background image, content width, and surface opacity. Appearance settings are not the Injection mechanism itself.

### Session

A Codex conversation and its related metadata as presented or managed through Codey.

### Diagnostics

Health, storage, log, performance, and maintenance signals used to understand Codey and Codex behavior.

### Notification Channel

A configured destination for Codey status or event messages.

### Subagent

A delegated Codex worker role governed by Codey policy and scheduling preferences.

### Performance Audit

A repeatable check that records source, build, and regression signals. A Performance Audit is evidence collection, not a user-visible feature by itself.
