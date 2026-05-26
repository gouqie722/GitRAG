import OpenAI from 'openai';
import { existsSync } from 'fs';
import { join } from 'path';
import { pipeline, env } from '@xenova/transformers';
import { config } from '../config.js';

let localExtractor = null;
let apiClient = null;

function isApiProvider() {
  return config.embedding.provider === 'api';
}

function getModelDir() {
  return join(config.embedding.localModelDir, ...config.embedding.model.split('/'));
}

function getModelOnnxPath() {
  return join(getModelDir(), 'onnx', 'model_quantized.onnx');
}

function hasLocalModelFiles() {
  return existsSync(getModelOnnxPath());
}

function configureLocalModelEnv() {
  env.useBrowserCache = false;

  if (hasLocalModelFiles()) {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = config.embedding.localModelDir.replace(/\\/g, '/');
    if (!env.localModelPath.endsWith('/')) {
      env.localModelPath += '/';
    }
    return 'offline';
  }

  const endpoint = config.embedding.hfEndpoint.replace(/\/$/, '');
  env.allowRemoteModels = true;
  env.allowLocalModels = true;
  env.remoteHost = `${endpoint}/`;
  env.remotePathTemplate = '{model}/resolve/{revision}/';
  return 'remote';
}

function getApiClient() {
  if (!apiClient) {
    apiClient = new OpenAI({
      apiKey: config.embedding.apiKey,
      baseURL: config.embedding.baseURL,
    });
  }
  return apiClient;
}

export async function preloadEmbedding() {
  if (isApiProvider()) {
    if (!config.embedding.apiKey) {
      throw new Error(
        'EMBEDDING_API_KEY 未配置。请使用 SiliconFlow（国内推荐）：' +
          'EMBEDDING_PROVIDER=siliconflow, EMBEDDING_API_KEY=sk-xxx, EMBEDDING_MODEL=BAAI/bge-m3'
      );
    }
    console.log(`Using API embedding: ${config.embedding.baseURL} (${config.embedding.model})`);
    return;
  }
  await getLocalExtractor();
}

async function getLocalExtractor() {
  if (!localExtractor) {
    const mode = configureLocalModelEnv();

    console.log(`Loading local embedding model: ${config.embedding.model} (${mode})`);
    if (mode === 'offline') {
      console.log(`Model dir: ${getModelDir()}`);
      console.log(`localModelPath: ${env.localModelPath}`);
    } else {
      console.log(`Model source: ${config.embedding.hfEndpoint}`);
    }

    try {
      localExtractor = await pipeline('feature-extraction', config.embedding.model);
      console.log('Local embedding model ready.');
    } catch (err) {
      const cause = err.cause?.message || err.cause?.code || '';
      throw new Error(
        `Embedding 模型加载失败: ${err.message}${cause ? ` (${cause})` : ''}。\n` +
          '解决方案（任选其一）：\n' +
          '  1. 运行 npm run download-model 从 ModelScope 下载离线模型\n' +
          '  2. 改用 API：EMBEDDING_PROVIDER=siliconflow + SiliconFlow Key'
      );
    }
  }
  return localExtractor;
}

function isE5Model() {
  return config.embedding.model.toLowerCase().includes('e5');
}

async function embedWithLocal(texts, type) {
  const extractor = await getLocalExtractor();
  const prefix = isE5Model() ? (type === 'query' ? 'query: ' : 'passage: ') : '';
  const embeddings = [];

  for (const text of texts) {
    const output = await extractor(prefix + text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }

  return embeddings;
}

async function embedWithApi(texts) {
  if (!config.embedding.apiKey) {
    throw new Error('EMBEDDING_API_KEY is not configured');
  }

  const client = getApiClient();
  const batchSize = 16;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: config.embedding.model,
      input: batch,
    });
    allEmbeddings.push(...response.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}

export async function embedTexts(texts) {
  if (isApiProvider()) return embedWithApi(texts);
  return embedWithLocal(texts, 'passage');
}

export async function embedQuery(query) {
  if (isApiProvider()) {
    const [embedding] = await embedWithApi([query]);
    return embedding;
  }
  const [embedding] = await embedWithLocal([query], 'query');
  return embedding;
}

export function getEmbeddingInfo() {
  if (isApiProvider()) {
    return {
      provider: 'api',
      configured: !!config.embedding.apiKey,
      model: config.embedding.model,
      baseURL: config.embedding.baseURL,
    };
  }

  return {
    provider: hasLocalModelFiles() ? 'local-offline' : 'local',
    configured: true,
    model: config.embedding.model,
    modelPath: getModelDir(),
    hfEndpoint: config.embedding.hfEndpoint,
  };
}
