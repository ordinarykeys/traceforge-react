# Reverse Integrations

This project vendors two upstream reverse-engineering resources:

- `integrations/hello_js_reverse_skill`
- `integrations/camoufox-reverse-mcp`

## What Is Integrated

### 1) Skill Playbook (direct copy)

`integrations/hello_js_reverse_skill` includes:

- `SKILL.md`
- `cases/`
- `references/`
- `scripts/`
- `templates/`

Use this as your internal reverse workflow knowledge base:

- phase planning
- fingerprint matching
- JSVMP analysis playbook
- reproducible templates for Node/Python

### 2) MCP Source Bundle (direct copy)

`integrations/camoufox-reverse-mcp` includes:

- `src/camoufox_reverse_mcp`
- `tests/`
- `pyproject.toml`
- README files

This is the MCP server source you can run locally in your environment.

## Commands

- Sync vendored integrations from sibling repos:
  - `npm run reverse:sync`
- Start camoufox MCP (local source mode):
  - `npm run reverse:camoufox:mcp`

## Recommended Agent Workflow in TraceForge

1. First scan `integrations/hello_js_reverse_skill/cases` for matching fingerprints.
2. If matched, follow that case's verified path before ad-hoc exploration.
3. If browser anti-detection/debug is required, run camoufox MCP and use its toolchain.
4. Persist findings back into TraceForge thread history + memory records.

## Upgrade Strategy

When upstream changes:

1. Update local clones under:
   - `../hello_js_reverse_skill`
   - `../camoufox-reverse-mcp`
2. Run:
   - `npm run reverse:sync`
3. Re-test:
   - `npm run build`
   - `cargo check` in `src-tauri`
