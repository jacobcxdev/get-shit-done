#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const node = process.execPath;

function run(stepName, diagCode, bin, args, opts = {}) {
  process.stdout.write(`\n[${diagCode}] Running step: ${stepName}\n`);
  try {
    execFileSync(bin, args, { stdio: 'inherit', cwd: ROOT, ...opts });
    process.stdout.write(`[${diagCode}] PASS: ${stepName}\n`);
  } catch (err) {
    process.stderr.write(`\n[${diagCode}] FAIL: Step "${stepName}" failed — fix above errors before proceeding\n`);
    process.exit(err.status || 1);
  }
}

// Parse --step <name> or --wave <n> flags for targeted local runs
const stepFlag = (() => {
  const idx = process.argv.indexOf('--step');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const steps = [
  {
    name: 'wave0-hardening',
    diag: 'PRTY-08',
    run: () => run('wave0-hardening', 'PRTY-08', node, [
      join(ROOT, 'sdk', 'node_modules', '.bin', 'vitest'),
      'run',
      'src/advisory/runtime-contracts.test.ts',
      'src/advisory/workflow-runner.test.ts',
      'src/phase-runner.test.ts',
    ], { cwd: join(ROOT, 'sdk') }),
  },
  {
    name: 'hook-build',
    diag: 'HOOK-02',
    run: () => run('hook-build', 'HOOK-02', node, [join(ROOT, 'scripts', 'build-hooks.js')]),
  },
  {
    name: 'hook-install-tests',
    diag: 'HOOK-01',
    run: () => run('hook-install-tests', 'HOOK-01', node, [
      '--test',
      join(ROOT, 'tests', 'install-hooks-copy.test.cjs'),
    ]),
  },
  {
    name: 'sdk-compile-check',
    diag: 'PRTY-02',
    run: () => run('sdk-compile-check', 'PRTY-02', node, [
      join(ROOT, 'bin', 'gsd-sdk.js'), 'compile', '--check',
    ]),
  },
  {
    name: 'staleness-gate',
    diag: 'PRTY-06',
    run: () => run('staleness-gate', 'PRTY-06', node, [
      join(ROOT, 'sdk', 'node_modules', '.bin', 'tsx'),
      join(ROOT, 'sdk', 'src', 'parity', 'generate-fixtures.ts'),
      '--check',
    ]),
  },
  {
    name: 'parity-suite',
    diag: 'PRTY-01',
    run: () => run('parity-suite', 'PRTY-01', node, [
      join(ROOT, 'sdk', 'node_modules', '.bin', 'vitest'),
      'run',
      'src/parity/',
    ], {
      cwd: join(ROOT, 'sdk'),
      // Use NODE_OPTIONS to preload the network blocker — vitest does not support --require
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${join(ROOT, 'scripts', 'block-network.cjs')}`,
      },
    }),
  },
  {
    name: 'skip-ban',
    diag: 'PRTY-08',
    run: () => {
      // Scan Phase 4 parity/hook/retirement globs for test.skip / test.todo
      const { execSync } = require('child_process');
      process.stdout.write('\n[PRTY-08] Running step: skip-ban\n');
      try {
        const result = execSync(
          'grep -rn "test\\.skip\\|test\\.todo\\|it\\.skip\\|it\\.todo\\|describe\\.skip" ' +
          'sdk/src/parity/ tests/install-hooks-copy.test.cjs 2>/dev/null || true',
          { cwd: ROOT, encoding: 'utf8' }
        );
        if (result.trim().length > 0) {
          process.stderr.write('[PRTY-08] FAIL: test.skip/test.todo found in Phase 4 parity globs:\n' + result);
          process.exit(1);
        }
        process.stdout.write('[PRTY-08] PASS: skip-ban\n');
      } catch (e) {
        process.stderr.write('[PRTY-08] FAIL: skip-ban scan error\n');
        process.exit(1);
      }
    },
  },
  {
    name: 'offline-scan',
    diag: 'PRTY-07',
    run: () => {
      // Node-based scanner over explicit executable-surface globs — no permissive grep allowlists
      const { readdirSync, readFileSync, statSync } = require('fs');
      process.stdout.write('\n[PRTY-07] Running step: offline-scan\n');
      const FORBIDDEN_HOSTS = [
        'raw.githubusercontent' + '.com',
        'cdn.jsdelivr' + '.net',
        'unpkg' + '.com',
        'registry.npmjs' + '.org',
      ];
      // Explicit executable surfaces named by the Phase 4 offline contract.
      const SCAN_GLOBS = [
        join(ROOT, 'sdk', 'src', 'parity'),
        join(ROOT, 'sdk', 'src', 'generated', 'parity'),
        join(ROOT, 'scripts'),
        join(ROOT, 'bin'),
        join(ROOT, 'get-shit-done', 'bin'),
        join(ROOT, '.github', 'workflows', 'test.yml'),
        join(ROOT, 'package.json'),
      ];

      function scanFile(filePath) {
        let content;
        try { content = readFileSync(filePath, 'utf8'); } catch (_) { return; }
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          for (const host of FORBIDDEN_HOSTS) {
            if (line.includes(host)) {
              process.stderr.write(`[PRTY-07] FAIL: Forbidden host '${host}' in ${filePath}:${idx + 1}: ${line.trim()}\n`);
              process.exit(1);
            }
          }
        });
      }

      function scanPath(p) {
        try {
          const stat = statSync(p);
          if (stat.isDirectory()) {
            readdirSync(p).forEach(f => scanPath(join(p, f)));
          } else {
            scanFile(p);
          }
        } catch (_) { /* path may not exist yet */ }
      }

      for (const p of SCAN_GLOBS) scanPath(p);
      process.stdout.write('[PRTY-07] PASS: offline-scan\n');
    },
  },
  {
    name: 'retirement-scan',
    diag: 'UPDT-05',
    run: () => {
      // Node-based scanner over EXPLICIT named surfaces — not broad recursive globs.
      // Allowlist is STRUCTURAL only: it matches specific JSON field patterns and
      // requirement ID references. It does NOT use broad string patterns like
      // retired-command retirement phrases or 'TOMBSTONE' which would exempt executable
      // invocations that happen to contain those words.
      const { readdirSync, readFileSync, statSync } = require('fs');
      process.stdout.write('\n[UPDT-05] Running step: retirement-scan\n');
      const RETIRED_BIN = 'gsd-' + 'post-update';

      // Explicit named surfaces — covers all executable surfaces per issue 13
      const SCAN_SURFACES = [
        join(ROOT, 'sdk', 'src', 'parity'),
        join(ROOT, 'sdk', 'src', 'generated', 'parity'),
        join(ROOT, 'tests'),
        join(ROOT, 'scripts'),
        join(ROOT, 'bin'),                                       // bin/get-shit-done and related bin paths
        join(ROOT, 'get-shit-done', 'bin'),                      // package bin dir
        join(ROOT, '.github', 'workflows', 'test.yml'),
        join(ROOT, 'package.json'),
      ];

      // Tombstone path — must be scanned but its own TOMBSTONE comment is allowed
      const TOMBSTONE_PATH = join(ROOT, 'get-shit-done', 'bin', RETIRED_BIN + '.cjs');

      // STRUCTURAL allowlist — only these field-value patterns are permitted on a
      // line containing the retired command. Each pattern matches a specific structured
      // field in JSON/YAML (disposition manifest fields, requirement IDs).
      // NO broad retired-command retirement patterns or /TOMBSTONE/ here —
      // those would exempt executable invocations that contain those words.
      function isAllowedLine(lineContent, filePath) {
        // Tombstone file itself: its deprecation message and TOMBSTONE comment are allowed
        if (filePath === TOMBSTONE_PATH) return true;
        // Structured disposition manifest JSON fields only
        if (/["']?behaviour["']?\s*:/.test(lineContent)) return true;
        if (/["']?evidenceCheck["']?\s*:/.test(lineContent)) return true;
        if (/["']?targetSurface["']?\s*:/.test(lineContent)) return true;
        // Requirement ID references (e.g. UPDT-01, UPDT-B-RETIREMENT)
        if (/\bUPDT-[A-Z0-9-]+\b/.test(lineContent) && lineContent.includes(':')) return true;
        // Pure comment lines (line starts with //, #, or *)
        if (/^\s*(\/\/|#|\*)/.test(lineContent)) return true;
        return false;
      }

      function scanFile(filePath) {
        let content;
        try { content = readFileSync(filePath, 'utf8'); } catch (_) { return; }
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (!line.includes(RETIRED_BIN)) return;
          if (!isAllowedLine(line, filePath)) {
            process.stderr.write(
              `[UPDT-05] FAIL: Executable ${RETIRED_BIN} reference in ${filePath}:${idx + 1}: ${line.trim()}\n`
            );
            process.exit(1);
          }
        });
      }

      function scanPath(p) {
        try {
          const stat = statSync(p);
          if (stat.isDirectory()) {
            readdirSync(p).forEach(f => scanPath(join(p, f)));
          } else {
            scanFile(p);
          }
        } catch (_) { /* path may not exist yet */ }
      }

      for (const p of SCAN_SURFACES) scanPath(p);
      process.stdout.write('[UPDT-05] PASS: retirement-scan\n');
    },
  },
];

const stepsToRun = stepFlag ? steps.filter(s => s.name === stepFlag) : steps;
if (stepsToRun.length === 0) {
  process.stderr.write(`[PRTY-08] Unknown --step '${stepFlag}'. Valid: ${steps.map(s => s.name).join(', ')}\n`);
  process.exit(1);
}

for (const step of stepsToRun) {
  step.run();
}

process.stdout.write('\n[PRTY-08] All Phase 4 parity gates PASSED\n');
