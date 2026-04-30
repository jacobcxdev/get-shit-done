# Source Install and Update

This is the canonical install and update path for this fork at `jacobcxdev/get-shit-done`.

The npm package name `get-shit-done-cc` is retained in source metadata as a compatibility/upstream name. Unless a future publish document proves fork-owned npm package ownership, do not use the npm latest entrypoint as the install path for this fork.

## Prerequisites

- Node.js installed
- This repo cloned locally

## Fresh install

```bash
git clone https://github.com/jacobcxdev/get-shit-done.git
cd get-shit-done
npm ci
npm run build:hooks
npm run build:sdk
node bin/install.js --codex --global   # replace runtime flag as needed
```

## Update an existing checkout

```bash
git pull --rebase origin main
npm ci
npm run build:hooks
npm run build:sdk
node bin/install.js --codex --global   # replace runtime flag as needed
rm -f ~/.cache/gsd/gsd-update-check.json
```

Restart your runtime after reinstalling so commands, skills, agents, hooks, and SDK files are reloaded.

## Runtime flags

Replace `--codex` with the flag for your runtime:

| Runtime | Flag |
|---|---|
| Claude Code | `--claude` |
| Gemini CLI | `--gemini` |
| OpenCode | `--opencode` |
| Kilo | `--kilo` |
| Codex | `--codex` |
| Copilot | `--copilot` |
| Cursor | `--cursor` |
| Windsurf | `--windsurf` |
| Augment | `--augment` |
| Trae | `--trae` |
| Qwen Code | `--qwen` |
| CodeBuddy | `--codebuddy` |
| Cline | `--cline` |
| All runtimes | `--all` |

Use `--local` instead of `--global` for a project-scoped install.

## What the installer replaces

The installer performs a clean wipe-and-replace of GSD-managed directories only:

- `~/.claude/get-shit-done/` — workflows, references, templates
- `~/.claude/commands/gsd/` — slash commands
- `~/.claude/agents/gsd-*.md` — GSD agents
- `~/.claude/hooks/dist/` — compiled hooks

**What is preserved:**
- Custom agents not prefixed with `gsd-`
- Custom commands outside `commands/gsd/`
- Your `CLAUDE.md` files
- Custom hooks

Locally modified GSD files are automatically backed up to `gsd-local-patches/` before the install. Run `/gsd-reapply-patches` after updating to merge your modifications back in.
