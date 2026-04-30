# GSD SDK query migration (summary blurb)

Copy-paste friendly for Discord and GitHub comments.

---

**@gsd-build/sdk** is the compatibility/upstream package name for the SDK in source metadata; this fork is source-first unless future npm ownership is explicitly documented. The SDK replaces the untyped, monolithic `gsd-tools.cjs` subprocess with a typed, tested, registry-based query system and **`gsd-sdk query`**, giving GSD structured results, classified errors (`GSDError` with `ErrorClassification`), golden-verified parity with the old CLI, and an SDK-owned deterministic advisory FSM that emits atomic instruction packets while the runtime executes.

**What users can expect**

- Same GSD commands and workflows they already use.
- Snappier runs (less Node startup on chained tool calls).
- Fewer mysterious mid-workflow failures and safer upgrades, because behavior is covered by tests and a single stable contract.
- Stronger predictability: outputs and failure modes are consistent and explicit.

**Cost and tokens**

The SDK does not automatically reduce LLM tokens per model call. Savings show up indirectly: fewer ambiguous tool results and fewer retry or recovery loops, which often lowers real-world session cost and wall time.

**Agents then vs now**

Agents always followed workflow instructions. What improved is the surface those steps run on. Before, workflows effectively said to shell out to `gsd-tools.cjs` and interpret stdout or JSON with brittle assumptions. Now they point at **`gsd-sdk query`** and typed handlers that return the shapes prompts expect, with clearer error reasons when something must stop or be fixed, so instruction following holds end to end with less thrash from bad parses or silent output drift.
