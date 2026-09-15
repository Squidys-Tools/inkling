# docs

Index of project documentation. Product docs describe what inkling is; operations docs describe how to work on it.

## Product and behavior

- [product.md](product.md) — who it's for and why it exists.
- [product-behavior.md](product-behavior.md) — how each feature should behave.
- [design.md](design.md), [expanded-item-overlay.md](expanded-item-overlay.md) — visual system and overlay spec.
- [models.md](models.md) — local model choices.

## Architecture

- [tech-stack.md](tech-stack.md) — Tauri + React + Rust + SQLite decisions and reasoning.

## Planning

- [roadmap.md](roadmap.md) — milestones and status.
- [changelog.md](changelog.md) — completed work; append under `Unreleased` (`Added`/`Changed`/`Fixed`/`Removed`). See its header for the format.

## Contributor operations

- [operations/development.md](operations/development.md) — setup, commands, checks, CI behavior, troubleshooting (full reference).
- `CONTRIBUTING.md` (repo root) — contribution scope and PR expectations.

## Where new docs go

- User-facing how-tos: `docs/` next to the product docs above.
- Maintainer procedures (setup, checks, release): `docs/operations/`.
- Architecture decisions and constraints: alongside `tech-stack.md` or the relevant product doc — not in a separate internals tree until the repo outgrows this index.
