import { configSnapshotHash } from '../advisory/routing.js';
import { loadConfig } from '../config.js';
import type { QueryHandler } from './utils.js';

export const configSnapshotHashQuery: QueryHandler<{ hash: string }> = async (
  _args,
  projectDir,
  workstream,
) => {
  const config = await loadConfig(projectDir, workstream);
  return { data: { hash: configSnapshotHash(config) } };
};
