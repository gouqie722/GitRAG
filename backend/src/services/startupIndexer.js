import { config } from '../config.js';
import { indexRepo } from './rag.js';
import { listIndexedRepos } from './lancedb.js';
import { preloadEmbedding } from './embedding.js';

const state = {
  status: 'idle',
  current: null,
  completed: [],
  failed: [],
  total: 0,
};

export function getIndexingState() {
  return { ...state, completed: [...state.completed], failed: [...state.failed] };
}

export async function bootstrapIndexing() {
  const repos = config.github.repos;
  if (repos.length === 0 || !config.github.autoIndexOnStartup) {
    return;
  }

  state.status = 'running';
  state.total = repos.length;
  state.completed = [];
  state.failed = [];

  const indexed = await listIndexedRepos();
  const indexedSet = new Set(indexed.map((r) => r.repo));

  console.log(`[startup] Auto-indexing ${repos.length} configured repo(s)...`);

  try {
    console.log('[startup] Preloading embedding model...');
    await preloadEmbedding();
  } catch (err) {
    console.error('[startup] Embedding model preload failed:', err.message);
    state.status = 'failed';
    state.failed.push({ repo: '*', error: err.message });
    return;
  }

  for (const fullName of repos) {
    if (!config.github.reindexOnStartup && indexedSet.has(fullName)) {
      console.log(`[startup] Skip ${fullName} (already indexed)`);
      state.completed.push({ repo: fullName, skipped: true });
      continue;
    }

    state.current = fullName;
    console.log(`[startup] Indexing ${fullName}...`);

    try {
      const result = await indexRepo(fullName);
      state.completed.push(result);
      console.log(
        `[startup] Done ${fullName}: ${result.fileCount} files, ${result.chunkCount} chunks`
      );
    } catch (err) {
      const detail = err.cause?.message ? `${err.message} (${err.cause.message})` : err.message;
      state.failed.push({ repo: fullName, error: detail });
      console.error(`[startup] Failed ${fullName}:`, detail);
    }
  }

  state.current = null;
  state.status = state.failed.length > 0 ? 'partial' : 'done';
  console.log(`[startup] Auto-index finished (${state.completed.length} ok, ${state.failed.length} failed)`);
}
