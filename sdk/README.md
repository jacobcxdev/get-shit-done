# @gsd-build/sdk

> **Fork package status:** This SDK lives in the source-first fork at `jacobcxdev/get-shit-done`. The package name `@gsd-build/sdk` is retained as a compatibility/upstream source metadata name, not proof that this fork publishes that npm package.

TypeScript SDK for **Get Shit Done**: an SDK-owned deterministic advisory FSM, typed query/state transitions, atomic instruction packets, and event-stream telemetry so the runtime executes while SDK advises.

## Source-first usage

Build and run the SDK from this fork checkout:

```bash
cd sdk
npm ci
npm run build
node dist/cli.js query state.json
```

For local consumers, install the SDK from the checked-out source path:

```bash
npm install /path/to/get-shit-done/sdk
```

## Publish strategy

Current fork support is source/local package use only. Future npm publishing requires fork-owned package names or explicit proof that this fork owns the retained compatibility names.

Do not treat `npm view @gsd-build/sdk`, npm badges, or `npm install @gsd-build/sdk` as evidence that this fork published the SDK.

## Quickstart — programmatic

```typescript
import { GSD, createRegistry } from '@gsd-build/sdk';

const gsd = new GSD({ projectDir: process.cwd(), sessionId: 'my-run' });
const tools = gsd.createTools();

const registry = createRegistry(gsd.eventStream, 'my-run');
const { data } = await registry.dispatch('state.json', [], process.cwd());
```

## Quickstart — CLI

From this repository's `sdk/` directory:

```bash
npm ci
npm run build
node dist/cli.js query state.json
node dist/cli.js query roadmap.analyze
```

From a project that installed the local SDK path:

```bash
node ./node_modules/@gsd-build/sdk/dist/cli.js query state.json
node ./node_modules/@gsd-build/sdk/dist/cli.js query roadmap.analyze
```

If no native handler is registered for a command, the CLI can transparently shell out to `get-shit-done/bin/gsd-tools.cjs` (see stderr warning), unless `GSD_QUERY_FALLBACK=off`.

## Advisory FSM boundary

This fork's differentiator is that the SDK owns the deterministic advisory FSM:

- The SDK validates typed query/state transitions.
- The SDK emits one atomic instruction packet at a time.
- The runtime executes packet instructions and returns execution evidence.
- The SDK advances or rejects state transitions from typed runtime reports.
- The default path avoids Agent SDK/API billing because model execution stays in the host runtime; Agent SDK usage is opt-in/programmatic.

## What ships

| Area | Entry |
|------|--------|
| Query registry | `createRegistry()` in `src/query/index.ts` — same handlers as `gsd-sdk query` |
| Tools bridge | `GSDTools` — native dispatch with optional CJS subprocess fallback |
| Orchestrators | `PhaseRunner`, `InitRunner`, `GSD` |
| CLI | `gsd-sdk` — `query`, `run`, `init`, `auto` |

## Guides

- **Handler registry & contracts:** [`src/query/QUERY-HANDLERS.md`](src/query/QUERY-HANDLERS.md)
- **Repository docs** (when present): `docs/ARCHITECTURE.md`, `docs/CLI-TOOLS.md` at repo root

## Environment

| Variable | Purpose |
|----------|---------|
| `GSD_QUERY_FALLBACK` | `off` / `never` disables CLI fallback to `gsd-tools.cjs` for unknown commands |
| `GSD_AGENTS_DIR` | Override directory scanned for installed GSD agents (`~/.claude/agents` by default) |
