/**
 * Hook inventory collector for gsd-sdk compile.
 * Inventories source hooks in hooks/ and build-derived dist posture.
 * hooks/dist/ is .gitignored and absent on clean checkout - treated as warning.
 * Per COMP-04, D-06.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { mkWarning } from '../diagnostics.js';
import { fileContentHash } from '../hash.js';
import { toRepoRelative } from '../paths.js';
import type { CompileDiagnostic, HookEntry } from '../types.js';

const HOOK_DOCS_REL_PATH = 'docs/INVENTORY.md';
const HOOK_MANIFEST_REL_PATH = 'docs/INVENTORY-MANIFEST.json';
const WORKER_REL_PATH = 'hooks/gsd-check-update-worker.js';

function hookIdFromFileName(fileName: string): string {
  return basename(fileName, extname(fileName));
}

function hookKind(fileName: string): HookEntry['kind'] {
  if (fileName.endsWith('.js')) return 'js';
  if (fileName.endsWith('.sh')) return 'shell';
  return 'unknown';
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function normalizeHookFileName(value: string): string | null {
  const trimmed = value.trim().replace(/^`|`$/g, '').replace(/[.;:,]+$/, '');
  const match = trimmed.match(/(?:^|\/)(gsd-[A-Za-z0-9_-]+\.(?:js|sh))$/);
  return match ? match[1] : null;
}

export async function extractManagedHooks(projectDir: string): Promise<string[]> {
  const content = await readIfPresent(join(projectDir, WORKER_REL_PATH));
  if (!content) return [];
  const match = content.match(/MANAGED_HOOKS\s*=\s*\[([\s\S]*?)\]/);
  if (!match) return [];

  return [...match[1].matchAll(/['"]([^'"]+\.(?:js|sh))['"]/g)]
    .map((entry) => normalizeHookFileName(entry[1]))
    .filter((entry): entry is string => Boolean(entry));
}

function parseHookFilesFromMarkdown(content: string): Set<string> {
  const files = new Set<string>();
  for (const match of content.matchAll(/`([^`]+\.(?:js|sh))`/g)) {
    const hookFile = normalizeHookFileName(match[1]);
    if (hookFile) files.add(hookFile);
  }
  return files;
}

function parseHookFilesFromManifest(content: string): Set<string> {
  const files = new Set<string>();
  const manifest = JSON.parse(content) as { families?: { hooks?: unknown } };
  if (!Array.isArray(manifest.families?.hooks)) return files;
  for (const value of manifest.families.hooks) {
    if (typeof value !== 'string') continue;
    const hookFile = normalizeHookFileName(value);
    if (hookFile) files.add(hookFile);
  }
  return files;
}

async function collectDocumentedHookFiles(
  projectDir: string,
  diagnostics: CompileDiagnostic[],
): Promise<{ markdown: Set<string>; manifest: Set<string>; all: Set<string> }> {
  const docs = await readIfPresent(join(projectDir, HOOK_DOCS_REL_PATH));
  const manifest = await readIfPresent(join(projectDir, HOOK_MANIFEST_REL_PATH));
  const markdown = docs ? parseHookFilesFromMarkdown(docs) : new Set<string>();
  const manifestIds = manifest ? parseHookFilesFromManifest(manifest) : new Set<string>();

  if (!docs) {
    diagnostics.push(
      mkWarning('COMP-08', 'hook', HOOK_DOCS_REL_PATH, HOOK_DOCS_REL_PATH, 'hook docs inventory missing'),
    );
  }
  if (!manifest) {
    diagnostics.push(
      mkWarning(
        'COMP-08',
        'hook',
        HOOK_MANIFEST_REL_PATH,
        HOOK_MANIFEST_REL_PATH,
        'hook inventory manifest missing',
      ),
    );
  }

  return { markdown, manifest: manifestIds, all: new Set([...markdown, ...manifestIds]) };
}

function inferInstallTargetClass(
  fileName: string,
  managedHooks: Set<string>,
  documentedHooks: Set<string>,
): HookEntry['installTargetClass'] {
  const id = hookIdFromFileName(fileName);
  if (id === 'gsd-check-update-worker') return 'worker';
  if (fileName === 'gsd-check-update.js') return 'codex-hook';
  if (managedHooks.has(fileName) || documentedHooks.has(fileName)) return 'claude-hook';
  return 'unknown';
}

function emitHookParityWarnings(
  sourceFiles: Set<string>,
  documentedHooks: { markdown: Set<string>; manifest: Set<string>; all: Set<string> },
  managedHooks: Set<string>,
  entriesByFileName: Map<string, HookEntry>,
  diagnostics: CompileDiagnostic[],
): void {
  for (const fileName of sourceFiles) {
    const entry = entriesByFileName.get(fileName);
    if (!entry) continue;
    if (!documentedHooks.markdown.has(fileName) || !managedHooks.has(fileName)) {
      diagnostics.push(
        mkWarning('COMP-08', 'hook', entry.id, entry.path, 'hook missing from hook docs or managed-hook manifest', {
          hint: 'update docs/INVENTORY.md and hooks/gsd-check-update-worker.js MANAGED_HOOKS',
        }),
      );
    }
  }

  for (const fileName of new Set([...documentedHooks.all, ...managedHooks])) {
    if (!sourceFiles.has(fileName)) {
      diagnostics.push(
        mkWarning(
          'COMP-08',
          'hook',
          hookIdFromFileName(fileName),
          documentedHooks.all.has(fileName) ? HOOK_DOCS_REL_PATH : WORKER_REL_PATH,
          'hook docs or managed-hook manifest references missing hook file',
          {
            hint: 'remove stale hook reference or restore hook source file',
          },
        ),
      );
    }
  }
}

export async function collectHooks(projectDir: string, diagnostics: CompileDiagnostic[]): Promise<HookEntry[]> {
  const hooksDir = join(projectDir, 'hooks');
  const distDir = join(hooksDir, 'dist');
  const hasDistDir = existsSync(distDir);

  if (!hasDistDir) {
    diagnostics.push(
      mkWarning(
        'COMP-04',
        'hook',
        'hooks/dist',
        'hooks/dist',
        'hooks/dist/ absent; build-derived hook posture cannot be verified',
        {
          hint: 'run npm run build:hooks to generate hooks/dist/',
        },
      ),
    );
  }

  const managedHooks = new Set(await extractManagedHooks(projectDir));
  const documentedHooks = await collectDocumentedHookFiles(projectDir, diagnostics);
  const sourceFiles = (await readdir(hooksDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.sh')))
    .map((entry) => entry.name)
    .sort();
  const sourceFileSet = new Set(sourceFiles);
  const sourceIds = new Set(sourceFiles.map((fileName) => hookIdFromFileName(fileName)));
  const entries: HookEntry[] = [];
  const entriesByFileName = new Map<string, HookEntry>();

  for (const fileName of sourceFiles) {
    const absPath = join(hooksDir, fileName);
    const distAbsPath = join(distDir, fileName);
    const kind = hookKind(fileName);
    const entry: HookEntry = {
      id: hookIdFromFileName(fileName),
      path: toRepoRelative(projectDir, absPath),
      hash: await fileContentHash(absPath),
      kind,
      installTargetClass: inferInstallTargetClass(fileName, managedHooks, documentedHooks.all),
      distPath: toRepoRelative(projectDir, distAbsPath),
      distExists: existsSync(distAbsPath),
      executable: kind === 'shell',
    };
    entries.push(entry);
    entriesByFileName.set(fileName, entry);
  }

  emitHookParityWarnings(sourceFileSet, documentedHooks, managedHooks, entriesByFileName, diagnostics);

  if (hasDistDir) {
    const distFiles = (await readdir(distDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.sh')))
      .map((entry) => entry.name)
      .sort();

    for (const fileName of distFiles) {
      if (sourceFileSet.has(fileName)) continue;
      const absPath = join(distDir, fileName);
      const id = hookIdFromFileName(fileName);
      const kind = hookKind(fileName);
      const entry: HookEntry = {
        id: sourceIds.has(id) ? `dist:${id}` : id,
        path: toRepoRelative(projectDir, absPath),
        hash: await fileContentHash(absPath),
        kind,
        installTargetClass: 'dist-only',
        distPath: toRepoRelative(projectDir, absPath),
        distExists: true,
        executable: kind === 'shell',
      };
      entries.push(entry);

      if (!documentedHooks.all.has(fileName) && !managedHooks.has(fileName)) {
        diagnostics.push(
          mkWarning('COMP-08', 'hook', entry.id, entry.path, 'dist-only hook artifact is not documented', {
            hint: 'remove stale dist artifact or update hook docs/managed-hook manifest',
          }),
        );
      }
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}
