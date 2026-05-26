import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseRepoList } from './utils/repo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
dotenv.config({ path: join(projectRoot, '.env') });

function resolvePath(p) {
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return p;
  return join(projectRoot, p);
}

function buildEmbeddingConfig() {
  const provider = process.env.EMBEDDING_PROVIDER || 'local';

  if (provider === 'api' || provider === 'siliconflow') {
    const isSiliconflow = provider === 'siliconflow';
    return {
      provider: 'api',
      model: process.env.EMBEDDING_MODEL || (isSiliconflow ? 'BAAI/bge-m3' : 'text-embedding-3-small'),
      apiKey: process.env.EMBEDDING_API_KEY || process.env.SILICONFLOW_API_KEY || '',
      baseURL:
        process.env.EMBEDDING_BASE_URL ||
        (isSiliconflow ? 'https://api.siliconflow.cn/v1' : 'https://api.openai.com/v1'),
      localModelDir: resolvePath(process.env.EMBEDDING_LOCAL_DIR || 'models'),
      hfEndpoint: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
    };
  }

  return {
    provider: 'local',
    model: process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small',
    localModelDir: resolvePath(process.env.EMBEDDING_LOCAL_DIR || 'models'),
    hfEndpoint: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
    apiKey: '',
    baseURL: '',
  };
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    chatModel: process.env.CHAT_MODEL || 'deepseek-chat',
  },

  embedding: buildEmbeddingConfig(),

  lancedb: {
    path: resolvePath(process.env.LANCEDB_PATH || 'data/lancedb'),
    table: process.env.LANCEDB_TABLE || 'github_repos',
  },

  github: {
    token: process.env.GITHUB_TOKEN || '',
    repos: parseRepoList(process.env.GITHUB_REPOS || ''),
    autoIndexOnStartup: process.env.AUTO_INDEX_ON_STARTUP !== 'false',
    reindexOnStartup: process.env.REINDEX_ON_STARTUP === 'true',
  },

  rag: {
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1500', 10),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200', 10),
    topK: parseInt(process.env.TOP_K || '8', 10),
  },
};

export const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.scala',
  '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.hpp',
  '.swift', '.vue', '.svelte', '.html', '.css', '.scss',
  '.json', '.yaml', '.yml', '.toml', '.md', '.sql',
  '.sh', '.bash', '.dockerfile', '.graphql',
]);

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '__pycache__', '.venv', 'venv', 'target',
  '.idea', '.vscode', 'vendor', '.cache',
]);
