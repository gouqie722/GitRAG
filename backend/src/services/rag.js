import { fetchRepoFiles } from './github.js';
import { chunkFiles } from './chunker.js';
import { embedTexts, embedQuery } from './embedding.js';
import { chatCompletion, chatCompletionStream } from './chat.js';
import {
  ensureCollection,
  upsertChunks,
  deleteRepoPoints,
  searchSimilar,
} from './lancedb.js';
import { config } from '../config.js';

const SYSTEM_PROMPT = `你是一个 GitHub 项目代码助手。根据提供的代码片段回答用户问题。

规则：
1. 只基于提供的代码上下文回答，不要编造不存在的内容
2. 如果上下文不足以回答，明确说明并给出可能相关的文件路径
3. 回答时使用中文，代码引用保留原文
4. 引用时标注 repo 和文件路径，例如 \`owner/repo:src/index.js\``;

export async function indexRepo(repoStr) {
  const { owner, repo, branch, files } = await fetchRepoFiles(repoStr);
  const fullName = `${owner}/${repo}`;

  if (files.length === 0) {
    return { repo: fullName, branch, fileCount: 0, chunkCount: 0 };
  }

  const chunks = chunkFiles(files);
  const embeddings = await embedTexts(chunks.map((c) => c.content));

  await ensureCollection();
  await deleteRepoPoints(fullName);
  const pointCount = await upsertChunks(chunks, embeddings);

  return {
    repo: fullName,
    branch,
    fileCount: files.length,
    chunkCount: pointCount,
  };
}

async function retrieveContext(question, repoFilter) {
  const queryVector = await embedQuery(question);
  const results = await searchSimilar(queryVector, {
    topK: config.rag.topK,
    repoFilter,
  });

  if (results.length === 0) {
    return {
      empty: true,
      sources: [],
      messages: null,
    };
  }

  const context = results
    .map(
      (r, i) =>
        `[片段 ${i + 1}] repo: ${r.repo}, path: ${r.path}, score: ${r.score.toFixed(3)}\n${r.content}`
    )
    .join('\n\n---\n\n');

  const sources = results.map((r) => ({
    repo: r.repo,
    path: r.path,
    score: r.score,
    snippet: r.content.slice(0, 300),
  }));

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `问题：${question}\n\n代码上下文：\n${context}`,
    },
  ];

  return { empty: false, sources, messages };
}

export async function askQuestion(question, { repoFilter } = {}) {
  const { empty, sources, messages } = await retrieveContext(question, repoFilter);

  if (empty) {
    return {
      answer: '未找到相关代码片段。请先索引 GitHub 项目，或尝试换个问法。',
      sources: [],
    };
  }

  const answer = await chatCompletion(messages);
  return { answer, sources };
}

export async function* askQuestionStream(question, { repoFilter } = {}) {
  const { empty, sources, messages } = await retrieveContext(question, repoFilter);

  yield { type: 'sources', sources };

  if (empty) {
    yield {
      type: 'delta',
      content: '未找到相关代码片段。请先索引 GitHub 项目，或尝试换个问法。',
    };
    return;
  }

  for await (const delta of chatCompletionStream(messages)) {
    yield { type: 'delta', content: delta };
  }
}
