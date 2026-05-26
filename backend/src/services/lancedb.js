import * as lancedb from '@lancedb/lancedb';
import { mkdir } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    await mkdir(config.lancedb.path, { recursive: true });
    dbPromise = lancedb.connect(config.lancedb.path);
  }
  return dbPromise;
}

async function tableExists(db) {
  const tables = await db.tableNames();
  return tables.includes(config.lancedb.table);
}

async function openTable() {
  const db = await getDb();
  if (!(await tableExists(db))) return null;
  return db.openTable(config.lancedb.table);
}

function escapeSql(value) {
  return value.replace(/'/g, "''");
}

function toRecords(chunks, embeddings) {
  return chunks.map((chunk, i) => ({
    id: uuidv4(),
    vector: embeddings[i],
    repo: chunk.repo,
    path: chunk.path,
    branch: chunk.branch,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
  }));
}

export async function ensureCollection() {
  await getDb();
}

export async function upsertChunks(chunks, embeddings) {
  const db = await getDb();
  const records = toRecords(chunks, embeddings);
  if (records.length === 0) return 0;

  if (!(await tableExists(db))) {
    await db.createTable(config.lancedb.table, records);
    return records.length;
  }

  const table = await db.openTable(config.lancedb.table);
  await table.add(records);
  return records.length;
}

export async function deleteRepoPoints(repo) {
  const table = await openTable();
  if (!table) return;
  await table.delete(`repo = '${escapeSql(repo)}'`);
}

export async function searchSimilar(vector, { topK, repoFilter } = {}) {
  const table = await openTable();
  if (!table) return [];

  let query = table.vectorSearch(vector).limit(topK ?? config.rag.topK);
  if (repoFilter) {
    query = query.where(`repo = '${escapeSql(repoFilter)}'`);
  }

  const results = await query.toArray();
  return results.map((r) => ({
    score: r._distance != null ? Math.max(0, 1 - r._distance) : 0,
    repo: r.repo,
    path: r.path,
    branch: r.branch,
    content: r.content,
    chunkIndex: r.chunkIndex,
  }));
}

export async function listIndexedRepos() {
  const table = await openTable();
  if (!table) return [];

  const rows = await table.query().select(['repo', 'path']).toArray();
  const repos = new Map();

  for (const row of rows) {
    if (!repos.has(row.repo)) {
      repos.set(row.repo, { repo: row.repo, fileCount: new Set(), pointCount: 0 });
    }
    const entry = repos.get(row.repo);
    entry.fileCount.add(row.path);
    entry.pointCount += 1;
  }

  return Array.from(repos.values()).map((r) => ({
    repo: r.repo,
    fileCount: r.fileCount.size,
    chunkCount: r.pointCount,
  }));
}

export async function getCollectionInfo() {
  const table = await openTable();
  if (!table) return null;

  const rowCount = await table.countRows();
  return { table: config.lancedb.table, rowCount };
}
