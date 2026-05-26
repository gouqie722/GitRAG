import Router from 'koa-router';
import { listUserRepos } from '../services/github.js';
import { indexRepo, askQuestion, askQuestionStream } from '../services/rag.js';
import { listIndexedRepos, getCollectionInfo } from '../services/lancedb.js';
import { config } from '../config.js';
import { getEmbeddingInfo } from '../services/embedding.js';
import { getIndexingState } from '../services/startupIndexer.js';

const router = new Router({ prefix: '/api' });

router.get('/health', async (ctx) => {
  const collection = await getCollectionInfo();
  const embedding = getEmbeddingInfo();
  const indexing = getIndexingState();
  ctx.body = {
    status: 'ok',
    lancedb: collection ? 'connected' : 'no data',
    github: config.github.token ? 'configured' : 'missing token',
    deepseek: config.deepseek.apiKey ? 'configured' : 'missing key',
    embedding: embedding.configured ? `${embedding.provider} (${embedding.model})` : 'not configured',
    configuredRepos: config.github.repos,
    indexing,
  };
});

router.get('/indexing/status', async (ctx) => {
  ctx.body = getIndexingState();
});

router.get('/github/repos', async (ctx) => {
  try {
    const repos = await listUserRepos();
    ctx.body = { repos };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});

router.get('/indexed', async (ctx) => {
  try {
    const indexed = await listIndexedRepos();
    ctx.body = { indexed };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});

router.post('/index', async (ctx) => {
  const { repo } = ctx.request.body;
  if (!repo) {
    ctx.status = 400;
    ctx.body = { error: 'repo is required (e.g. "owner/repo")' };
    return;
  }

  try {
    const result = await indexRepo(repo);
    ctx.body = { success: true, ...result };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});

router.post('/chat', async (ctx) => {
  const { question, repo } = ctx.request.body;
  if (!question?.trim()) {
    ctx.status = 400;
    ctx.body = { error: 'question is required' };
    return;
  }

  try {
    const result = await askQuestion(question.trim(), { repoFilter: repo || undefined });
    ctx.body = result;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});

router.post('/chat/stream', async (ctx) => {
  const { question, repo } = ctx.request.body;
  if (!question?.trim()) {
    ctx.status = 400;
    ctx.body = { error: 'question is required' };
    return;
  }

  ctx.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  ctx.status = 200;
  ctx.respond = false;

  const res = ctx.res;
  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    for await (const event of askQuestionStream(question.trim(), {
      repoFilter: repo || undefined,
    })) {
      send(event);
    }
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

export default router;
