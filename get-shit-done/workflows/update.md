<purpose>
Update this source-first fork from a local `jacobcxdev/get-shit-done` checkout, display the source diff or changelog preview before updating, obtain user confirmation, rebuild hooks/SDK/package binaries, reinstall into the detected runtime, and clear update caches.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="get_installed_version">
Detect whether GSD is installed locally or globally by checking both locations and validating install integrity.

First, derive `PREFERRED_CONFIG_DIR` and `PREFERRED_RUNTIME` from the invoking prompt's `execution_context` path:
- If the path contains `/get-shit-done/workflows/update.md`, strip that suffix and store the remainder as `PREFERRED_CONFIG_DIR`
- Path contains `/.codex/` -> `codex`
- Path contains `/.gemini/` -> `gemini`
- Path contains `/.config/kilo/` or `/.kilo/`, or `PREFERRED_CONFIG_DIR` contains `kilo.json` / `kilo.jsonc` -> `kilo`
- Path contains `/.config/opencode/` or `/.opencode/`, or `PREFERRED_CONFIG_DIR` contains `opencode.json` / `opencode.jsonc` -> `opencode`
- Otherwise -> `claude`

Use `PREFERRED_CONFIG_DIR` when available so custom `--config-dir` installs are checked before default locations.
Use `PREFERRED_RUNTIME` as the first runtime checked so `/gsd-update` targets the runtime that invoked it.

Kilo config precedence must match the installer: `KILO_CONFIG_DIR` -> `dirname(KILO_CONFIG)` -> `XDG_CONFIG_HOME/kilo` -> `~/.config/kilo`.

```bash
expand_home() {
  case "$1" in
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# Runtime candidates: "<runtime>:<config-dir>" stored as an array.
# Using an array instead of a space-separated string ensures correct
# iteration in both bash and zsh (zsh does not word-split unquoted
# variables by default). Fixes #1173.
RUNTIME_DIRS=( "claude:.claude" "opencode:.config/opencode" "opencode:.opencode" "gemini:.gemini" "kilo:.config/kilo" "kilo:.kilo" "codex:.codex" )
ENV_RUNTIME_DIRS=()

# PREFERRED_CONFIG_DIR / PREFERRED_RUNTIME should be set from execution_context
# before running this block.
if [ -n "$PREFERRED_CONFIG_DIR" ]; then
  PREFERRED_CONFIG_DIR="$(expand_home "$PREFERRED_CONFIG_DIR")"
  if [ -z "$PREFERRED_RUNTIME" ]; then
    if [ -f "$PREFERRED_CONFIG_DIR/kilo.json" ] || [ -f "$PREFERRED_CONFIG_DIR/kilo.jsonc" ]; then
      PREFERRED_RUNTIME="kilo"
    elif [ -f "$PREFERRED_CONFIG_DIR/opencode.json" ] || [ -f "$PREFERRED_CONFIG_DIR/opencode.jsonc" ]; then
      PREFERRED_RUNTIME="opencode"
    elif [ -f "$PREFERRED_CONFIG_DIR/config.toml" ]; then
      PREFERRED_RUNTIME="codex"
    fi
  fi
fi

# If runtime is still unknown, infer from runtime env vars; fallback to claude.
if [ -z "$PREFERRED_RUNTIME" ]; then
  if [ -n "$CODEX_HOME" ]; then
    PREFERRED_RUNTIME="codex"
  elif [ -n "$GEMINI_CONFIG_DIR" ]; then
    PREFERRED_RUNTIME="gemini"
  elif [ -n "$KILO_CONFIG_DIR" ]; then
    PREFERRED_RUNTIME="kilo"
  elif [ -n "$KILO_CONFIG" ]; then
    PREFERRED_RUNTIME="kilo"
  elif [ -n "$OPENCODE_CONFIG_DIR" ] || [ -n "$OPENCODE_CONFIG" ]; then
    PREFERRED_RUNTIME="opencode"
  elif [ -n "$CLAUDE_CONFIG_DIR" ]; then
    PREFERRED_RUNTIME="claude"
  else
    PREFERRED_RUNTIME="claude"
  fi
fi

# If execution_context already points at an installed config dir, trust it first.
# This covers custom --config-dir installs that do not live under the default
# runtime directories.
if [ -n "$PREFERRED_CONFIG_DIR" ] && { [ -f "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION" ] || [ -f "$PREFERRED_CONFIG_DIR/get-shit-done/workflows/update.md" ]; }; then
  INSTALL_SCOPE="GLOBAL"
  # Normalize a path for comparison: on Windows with Git Bash, pwd returns
  # POSIX-style /c/Users/... but PREFERRED_CONFIG_DIR may carry C:/Users/...
  # Convert Windows drive-letter paths to POSIX form so the comparison works
  # on both Windows (Git Bash) and POSIX systems.
  normalize_path() {
    local p="$1"
    case "$p" in
      [A-Za-z]:/*)
        local drive rest
        drive="${p%%:*}"
        rest="${p#?:}"
        p="/$(printf '%s' "$drive" | tr '[:upper:]' '[:lower:]')$rest"
        ;;
    esac
    printf '%s' "$p"
  }
  normalized_preferred="$(normalize_path "$PREFERRED_CONFIG_DIR")"
  for dir in .claude .config/opencode .opencode .gemini .config/kilo .kilo .codex; do
    resolved_local="$(cd "./$dir" 2>/dev/null && pwd)"
    normalized_local="$(normalize_path "$resolved_local")"
    if [ -n "$normalized_local" ] && [ "$normalized_local" = "$normalized_preferred" ]; then
      INSTALL_SCOPE="LOCAL"
      break
    fi
  done

  if [ -f "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION"; then
    INSTALLED_VERSION="$(cat "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION")"
  else
    INSTALLED_VERSION="0.0.0"
  fi

  echo "$INSTALLED_VERSION"
  echo "$INSTALL_SCOPE"
  echo "${PREFERRED_RUNTIME:-claude}"
  exit 0
fi

# Absolute global candidates from env overrides (covers custom config dirs).
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "claude:$(expand_home "$CLAUDE_CONFIG_DIR")" )
fi
if [ -n "$GEMINI_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "gemini:$(expand_home "$GEMINI_CONFIG_DIR")" )
fi
if [ -n "$KILO_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "kilo:$(expand_home "$KILO_CONFIG_DIR")" )
elif [ -n "$KILO_CONFIG" ]; then
  ENV_RUNTIME_DIRS+=( "kilo:$(dirname "$(expand_home "$KILO_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  ENV_RUNTIME_DIRS+=( "kilo:$(expand_home "$XDG_CONFIG_HOME")/kilo" )
fi
if [ -n "$OPENCODE_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "opencode:$(expand_home "$OPENCODE_CONFIG_DIR")" )
elif [ -n "$OPENCODE_CONFIG" ]; then
  ENV_RUNTIME_DIRS+=( "opencode:$(dirname "$(expand_home "$OPENCODE_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  ENV_RUNTIME_DIRS+=( "opencode:$(expand_home "$XDG_CONFIG_HOME")/opencode" )
fi
if [ -n "$CODEX_HOME" ]; then
  ENV_RUNTIME_DIRS+=( "codex:$(expand_home "$CODEX_HOME")" )
fi

# Reorder entries so preferred runtime is checked first.
ORDERED_RUNTIME_DIRS=()
for entry in "${RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" = "$PREFERRED_RUNTIME" ]; then
    ORDERED_RUNTIME_DIRS+=( "$entry" )
  fi
done
ORDERED_ENV_RUNTIME_DIRS=()
for entry in "${ENV_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" = "$PREFERRED_RUNTIME" ]; then
    ORDERED_ENV_RUNTIME_DIRS+=( "$entry" )
  fi
done
for entry in "${ENV_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" != "$PREFERRED_RUNTIME" ]; then
    ORDERED_ENV_RUNTIME_DIRS+=( "$entry" )
  fi
done
for entry in "${RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" != "$PREFERRED_RUNTIME" ]; then
    ORDERED_RUNTIME_DIRS+=( "$entry" )
  fi
done

# Check local first (takes priority only if valid and distinct from global)
LOCAL_VERSION_FILE="" LOCAL_MARKER_FILE="" LOCAL_DIR="" LOCAL_RUNTIME=""
for entry in "${ORDERED_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  dir="${entry#*:}"
  if [ -f "./$dir/get-shit-done/VERSION" ] || [ -f "./$dir/get-shit-done/workflows/update.md" ]; then
    LOCAL_RUNTIME="$runtime"
    LOCAL_VERSION_FILE="./$dir/get-shit-done/VERSION"
    LOCAL_MARKER_FILE="./$dir/get-shit-done/workflows/update.md"
    LOCAL_DIR="$(cd "./$dir" 2>/dev/null && pwd)"
    break
  fi
done

GLOBAL_VERSION_FILE="" GLOBAL_MARKER_FILE="" GLOBAL_DIR="" GLOBAL_RUNTIME=""
for entry in "${ORDERED_ENV_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  dir="${entry#*:}"
  if [ -f "$dir/get-shit-done/VERSION" ] || [ -f "$dir/get-shit-done/workflows/update.md" ]; then
    GLOBAL_RUNTIME="$runtime"
    GLOBAL_VERSION_FILE="$dir/get-shit-done/VERSION"
    GLOBAL_MARKER_FILE="$dir/get-shit-done/workflows/update.md"
    GLOBAL_DIR="$(cd "$dir" 2>/dev/null && pwd)"
    break
  fi
done

if [ -z "$GLOBAL_RUNTIME" ]; then
  for entry in "${ORDERED_RUNTIME_DIRS[@]}"; do
    runtime="${entry%%:*}"
    dir="${entry#*:}"
    if [ -f "$HOME/$dir/get-shit-done/VERSION" ] || [ -f "$HOME/$dir/get-shit-done/workflows/update.md" ]; then
      GLOBAL_RUNTIME="$runtime"
      GLOBAL_VERSION_FILE="$HOME/$dir/get-shit-done/VERSION"
      GLOBAL_MARKER_FILE="$HOME/$dir/get-shit-done/workflows/update.md"
      GLOBAL_DIR="$(cd "$HOME/$dir" 2>/dev/null && pwd)"
      break
    fi
  done
fi

# Only treat as LOCAL if the resolved paths differ (prevents misdetection when CWD=$HOME)
IS_LOCAL=false
if [ -n "$LOCAL_VERSION_FILE" ] && [ -f "$LOCAL_VERSION_FILE" ] && [ -f "$LOCAL_MARKER_FILE" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$LOCAL_VERSION_FILE"; then
  if [ -z "$GLOBAL_DIR" ] || [ "$LOCAL_DIR" != "$GLOBAL_DIR" ]; then
    IS_LOCAL=true
  fi
fi

if [ "$IS_LOCAL" = true ]; then
  INSTALLED_VERSION="$(cat "$LOCAL_VERSION_FILE")"
  INSTALL_SCOPE="LOCAL"
  TARGET_RUNTIME="$LOCAL_RUNTIME"
elif [ -n "$GLOBAL_VERSION_FILE" ] && [ -f "$GLOBAL_VERSION_FILE" ] && [ -f "$GLOBAL_MARKER_FILE" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$GLOBAL_VERSION_FILE"; then
  INSTALLED_VERSION="$(cat "$GLOBAL_VERSION_FILE")"
  INSTALL_SCOPE="GLOBAL"
  TARGET_RUNTIME="$GLOBAL_RUNTIME"
elif [ -n "$LOCAL_RUNTIME" ] && [ -f "$LOCAL_MARKER_FILE" ]; then
  # Runtime detected but VERSION missing/corrupt: treat as unknown version, keep runtime target
  INSTALLED_VERSION="0.0.0"
  INSTALL_SCOPE="LOCAL"
  TARGET_RUNTIME="$LOCAL_RUNTIME"
elif [ -n "$GLOBAL_RUNTIME" ] && [ -f "$GLOBAL_MARKER_FILE" ]; then
  INSTALLED_VERSION="0.0.0"
  INSTALL_SCOPE="GLOBAL"
  TARGET_RUNTIME="$GLOBAL_RUNTIME"
else
  INSTALLED_VERSION="0.0.0"
  INSTALL_SCOPE="UNKNOWN"
  TARGET_RUNTIME="claude"
fi

echo "$INSTALLED_VERSION"
echo "$INSTALL_SCOPE"
echo "$TARGET_RUNTIME"
```

Parse output:
- Line 1 = installed version (`0.0.0` means unknown version)
- Line 2 = install scope (`LOCAL`, `GLOBAL`, or `UNKNOWN`)
- Line 3 = target runtime (`claude`, `opencode`, `gemini`, `kilo`, or `codex`)
- If scope is `UNKNOWN`, proceed to install step using `--claude --global` fallback.

If multiple runtime installs are detected and the invoking runtime cannot be determined from execution_context, ask the user which runtime to update before running install.

**If VERSION file missing:**
```
## GSD Update

**Installed version:** Unknown

Your installation doesn't include version tracking.

Running fresh install...
```

Proceed to install step (treat as version 0.0.0 for comparison).
</step>

<step name="check_source_checkout">
This fork is source-first. Do not check npm for the latest version and do not use `npx get-shit-done-cc` as the canonical update path.

Find the source checkout:

1. If the current working directory contains `package.json`, `bin/install.js`, and `.git`, use the current working directory.
2. Otherwise, if the installed workflow path is inside a cloned repo, walk upward until a directory containing `package.json`, `bin/install.js`, and `.git` is found.
3. Otherwise ask the user to run `/gsd-update` from a local `jacobcxdev/get-shit-done` checkout.

If no checkout is found, display:

```
## GSD Update

This fork updates from source, not npm.

Run from a local checkout:

    git clone https://github.com/jacobcxdev/get-shit-done.git
    cd get-shit-done
    /gsd-update
```

Exit.
</step>

<step name="check_latest_version">
Fetch source updates from the checkout remote:

```bash
git fetch --tags origin main
```

Derive:
- `INSTALLED_VERSION` from the detected runtime install, as above.
- `CURRENT_COMMIT` from `git rev-parse HEAD` in the source checkout.
- `REMOTE_COMMIT` from `git rev-parse origin/main`.
- `LATEST_VERSION` from `node -p "require('./package.json').version"` after fetch if already on `origin/main`, otherwise from `git show origin/main:package.json`.

If fetch fails, show:

```
Couldn't check for source updates (offline or remote unavailable).

To update manually later:

    git pull --rebase origin main
    npm ci
    npm run build:hooks
    npm run build:sdk
    npm install -g .
    get-shit-done-cc --claude --global
```

Exit.
</step>

<step name="compare_versions">
Compare local source commit vs `origin/main`:

**If `CURRENT_COMMIT == REMOTE_COMMIT`:**
```
## GSD Update

**Installed:** X.Y.Z
**Source:** up to date at CURRENT_COMMIT

Your source checkout is already up to date. Re-run the installer only if you need to resync runtime files.
```

Ask whether to reinstall from the current source checkout. If the user declines, exit.

**If the local checkout has commits not in `origin/main`:**
```
## GSD Update

Your checkout contains local commits that are not on `origin/main`.

Do not auto-update because rebasing could disturb local work. Update manually after reviewing:

    git status
    git log --oneline origin/main..HEAD
    git pull --rebase origin main
```

Exit.
</step>

<step name="show_changes_and_confirm">
**If source updates are available**, show what's new BEFORE updating:

1. Show `git log --oneline HEAD..origin/main`.
2. If `CHANGELOG.md` changed, show the relevant diff with `git diff HEAD..origin/main -- CHANGELOG.md`.
3. Display preview and ask for confirmation:

```
## GSD Source Update Available

**Installed:** 1.5.10
**Source package version:** 1.5.15

### Commits to apply
────────────────────────────────────────────────────────────
abc1234 fix: example change
def5678 docs: example docs update
────────────────────────────────────────────────────────────

⚠️  **Note:** The installer performs a clean install of GSD folders:
- `commands/gsd/` will be wiped and replaced
- `get-shit-done/` will be wiped and replaced
- `agents/gsd-*` files will be replaced

(Paths are relative to detected runtime install location:
global: `~/.claude/`, `~/.config/opencode/`, `~/.opencode/`, `~/.gemini/`, `~/.config/kilo/`, or `~/.codex/`
local: `./.claude/`, `./.config/opencode/`, `./.opencode/`, `./.gemini/`, `./.kilo/`, or `./.codex/`)

Your custom files in other locations are preserved:
- Custom commands not in `commands/gsd/` ✓
- Custom agents not prefixed with `gsd-` ✓
- Custom hooks ✓
- Your CLAUDE.md files ✓

If you've modified any GSD files directly, they'll be automatically backed up to `gsd-local-patches/` and can be reapplied with `/gsd-reapply-patches` after the update.
```


**Text mode (`workflow.text_mode: true` in config or `--text` flag):** Set `TEXT_MODE=true` if `--text` is present in `$ARGUMENTS` OR `text_mode` from init JSON is `true`. When TEXT_MODE is active, replace every `AskUserQuestion` call with a plain-text numbered list and ask the user to type their choice number. This is required for non-Claude runtimes (OpenAI Codex, Gemini CLI, etc.) where `AskUserQuestion` is not available.
Use AskUserQuestion:
- Question: "Proceed with update?"
- Options:
  - "Yes, update now"
  - "No, cancel"

**If user cancels:** Exit.
</step>

<step name="backup_custom_files">
Before running the installer, detect and back up any user-added files inside
GSD-managed directories. These are files that exist on disk but are NOT listed
in `gsd-file-manifest.json` — i.e., files the user added themselves that the
installer does not know about and will delete during the wipe.

**Do not use bash path-stripping (`${filepath#$RUNTIME_DIR/}`) or `node -e require()`
inline** — those patterns fail when `$RUNTIME_DIR` is unset and the stripped
relative path may not match manifest key format, which causes CUSTOM_COUNT=0
even when custom files exist (bug #1997). Use `gsd-sdk query detect-custom-files`
when `gsd-sdk` is on `PATH`, or the bundled `gsd-tools.cjs detect-custom-files`
otherwise — both resolve paths reliably with Node.js `path.relative()`.

First, resolve the config directory (`RUNTIME_DIR`) from the install scope
detected in `get_installed_version`:

```bash
# RUNTIME_DIR is the resolved config directory (e.g. ~/.config/opencode, ~/.gemini)
# It should already be set from get_installed_version as GLOBAL_DIR or LOCAL_DIR.
# Use the appropriate variable based on INSTALL_SCOPE.
if [ "$INSTALL_SCOPE" = "LOCAL" ]; then
  RUNTIME_DIR="$LOCAL_DIR"
elif [ "$INSTALL_SCOPE" = "GLOBAL" ]; then
  RUNTIME_DIR="$GLOBAL_DIR"
else
  RUNTIME_DIR=""
fi
```

If `RUNTIME_DIR` is empty or does not exist, skip this step (no config dir to
inspect).

Otherwise run `detect-custom-files` (prefer SDK when available):

```bash
GSD_TOOLS="$RUNTIME_DIR/get-shit-done/bin/gsd-tools.cjs"
CUSTOM_JSON=''
if [ -n "$RUNTIME_DIR" ] && command -v gsd-sdk >/dev/null 2>&1; then
  CUSTOM_JSON=$(gsd-sdk query detect-custom-files --config-dir "$RUNTIME_DIR" 2>/dev/null)
elif [ -f "$GSD_TOOLS" ] && [ -n "$RUNTIME_DIR" ]; then
  CUSTOM_JSON=$(node "$GSD_TOOLS" detect-custom-files --config-dir "$RUNTIME_DIR" 2>/dev/null)
fi
if [ -z "$CUSTOM_JSON" ]; then
  CUSTOM_JSON='{"custom_files":[],"custom_count":0}'
fi
CUSTOM_COUNT=$(echo "$CUSTOM_JSON" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).custom_count);}catch{console.log(0);}})" 2>/dev/null || echo "0")
```

**If `CUSTOM_COUNT` > 0:**

Back up each custom file to `$RUNTIME_DIR/gsd-user-files-backup/` before the
installer wipes the directories:

```bash
BACKUP_DIR="$RUNTIME_DIR/gsd-user-files-backup"
mkdir -p "$BACKUP_DIR"

# Parse custom_files array from CUSTOM_JSON and copy each file
node - "$RUNTIME_DIR" "$BACKUP_DIR" "$CUSTOM_JSON" <<'JSEOF'
const [,, runtimeDir, backupDir, customJson] = process.argv;
const { custom_files } = JSON.parse(customJson);
const fs = require('fs');
const path = require('path');
for (const relPath of custom_files) {
  const src = path.join(runtimeDir, relPath);
  const dst = path.join(backupDir, relPath);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log('  Backed up: ' + relPath);
  }
}
JSEOF
```

Then inform the user:

```
⚠️  Found N custom file(s) inside GSD-managed directories.
    These have been backed up to gsd-user-files-backup/ before the update.
    Restore them after the update if needed.
```

**If `CUSTOM_COUNT` == 0:** No user-added files detected. Continue to install.
</step>

<step name="run_update">
Run the update from the source checkout using the install type detected in step 1:

Build runtime and scope flags from step 1:
```bash
RUNTIME_FLAG="--$TARGET_RUNTIME"
if [ "$INSTALL_SCOPE" = "LOCAL" ]; then
  SCOPE_FLAG="--local"
else
  SCOPE_FLAG="--global"
fi
```

Update source and rebuild:

```bash
git pull --rebase origin main
npm ci
npm run build:hooks
npm run build:sdk
npm install -g .
get-shit-done-cc "$RUNTIME_FLAG" "$SCOPE_FLAG"
```

If install scope is `UNKNOWN`, use `--claude --global`:

```bash
git pull --rebase origin main
npm ci
npm run build:hooks
npm run build:sdk
npm install -g .
get-shit-done-cc --claude --global
```

Capture output. If any command fails, show error and exit.

Clear the update cache so statusline indicator disappears:

```bash
expand_home() {
  case "$1" in
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# Clear update cache across preferred, env-derived, and default runtime directories
CACHE_DIRS=()
if [ -n "$PREFERRED_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$PREFERRED_CONFIG_DIR")" )
fi
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$CLAUDE_CONFIG_DIR")" )
fi
if [ -n "$GEMINI_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$GEMINI_CONFIG_DIR")" )
fi
if [ -n "$KILO_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$KILO_CONFIG_DIR")" )
elif [ -n "$KILO_CONFIG" ]; then
  CACHE_DIRS+=( "$(dirname "$(expand_home "$KILO_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  CACHE_DIRS+=( "$(expand_home "$XDG_CONFIG_HOME")/kilo" )
fi
if [ -n "$OPENCODE_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$OPENCODE_CONFIG_DIR")" )
elif [ -n "$OPENCODE_CONFIG" ]; then
  CACHE_DIRS+=( "$(dirname "$(expand_home "$OPENCODE_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  CACHE_DIRS+=( "$(expand_home "$XDG_CONFIG_HOME")/opencode" )
fi
if [ -n "$CODEX_HOME" ]; then
  CACHE_DIRS+=( "$(expand_home "$CODEX_HOME")" )
fi

for dir in "${CACHE_DIRS[@]}"; do
  if [ -n "$dir" ]; then
    rm -f "$dir/cache/gsd-update-check.json"
  fi
done

for dir in .claude .config/opencode .opencode .gemini .config/kilo .kilo .codex; do
  rm -f "./$dir/cache/gsd-update-check.json"
  rm -f "$HOME/$dir/cache/gsd-update-check.json"
done
```

The SessionStart hook (`gsd-check-update.js`) writes to the detected runtime's cache directory, so preferred/env-derived paths and default paths must all be cleared to prevent stale update indicators.
</step>

<step name="display_result">
Format completion message (changelog was already shown in confirmation step):

```
╔═══════════════════════════════════════════════════════════╗
║  GSD Updated: v1.5.10 → v1.5.15                           ║
╚═══════════════════════════════════════════════════════════╝

⚠️  Restart your runtime to pick up the new commands.

[View full changelog](https://github.com/jacobcxdev/get-shit-done/blob/main/CHANGELOG.md)
```
</step>


<step name="check_local_patches">
After update completes, check if the installer detected and backed up any locally modified files:

Check for gsd-local-patches/backup-meta.json in the config directory.

**If patches found:**

```
Local patches were backed up before the update.
Run /gsd-reapply-patches to merge your modifications into the new version.
```

**If no patches:** Continue normally.
</step>
</process>

<success_criteria>
- [ ] Installed version read correctly
- [ ] Local source checkout detected
- [ ] Latest source commit checked via git remote, not npm
- [ ] Update skipped or reinstall offered if source is already current
- [ ] Source commits or changelog diff displayed BEFORE update
- [ ] Clean install warning shown
- [ ] User confirmation obtained
- [ ] Source pull, build, local global package install, and runtime reinstall executed successfully
- [ ] Restart reminder shown
</success_criteria>
