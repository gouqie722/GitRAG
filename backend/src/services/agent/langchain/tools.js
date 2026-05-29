import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { embedQuery } from '../../embedding.js';
import { searchSimilar, listIndexedRepos } from '../../lancedb.js';
import { readRepoFile } from '../../github.js';
import { config } from '../../../config.js';

function summarizeToolOutput(text, maxLen = 200) {
  const trimmed = String(text || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}...`;
}

export function createAgentTools({ repoScope, sources, toolSteps }) {
  const searchCodeTool = new DynamicStructuredTool({
    name: 'search_code',
    description: '在已索引的 GitHub 代码中做语义搜索，适合查找相关逻辑、函数、配置',
    schema: z.object({
      query: z.string().describe('搜索问题或关键词'),
      repo: z.string().optional().describe('可选，限定 owner/repo'),
    }),
    func: async ({ query, repo }) => {
      const repoFilter = repo || repoScope || undefined;
      const vector = await embedQuery(query);
      const results = await searchSimilar(vector, {
        topK: config.rag.topK,
        repoFilter,
      });

      for (const item of results) {
        const exists = sources.some((s) => s.repo === item.repo && s.path === item.path);
        if (!exists) {
          sources.push({
            repo: item.repo,
            path: item.path,
            score: item.score,
            snippet: item.content.slice(0, 300),
          });
        }
      }

      if (results.length === 0) {
        return '未找到相关代码片段。';
      }

      return results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.repo}:${r.path} (score ${r.score.toFixed(3)})\n${r.content.slice(0, 800)}`
        )
        .join('\n\n---\n\n');
    },
  });

  const readFileTool = new DynamicStructuredTool({
    name: 'read_file',
    description: '读取某个仓库中的完整文件内容，适合深入分析单个文件',
    schema: z.object({
      repo: z.string().describe('owner/repo'),
      path: z.string().describe('文件路径，如 src/index.js'),
    }),
    func: async ({ repo, path }) => {
      const content = await readRepoFile(repo, path);
      if (!content) {
        return `无法读取 ${repo}:${path}，请确认仓库已索引且路径正确。`;
      }

      sources.push({
        repo,
        path,
        score: 1,
        snippet: content.slice(0, 300),
      });

      return content.length > 12000
        ? `${content.slice(0, 12000)}\n\n...[文件过长，已截断]`
        : content;
    },
  });

  const listReposTool = new DynamicStructuredTool({
    name: 'list_repos',
    description: '列出当前已索引的 GitHub 仓库及文件/片段数量',
    schema: z.object({}),
    func: async () => {
      const repos = await listIndexedRepos();
      if (repos.length === 0) return '当前没有已索引仓库。';
      return repos
        .map((r) => `- ${r.repo}: ${r.fileCount} 文件, ${r.chunkCount} 片段`)
        .join('\n');
    },
  });

  return [searchCodeTool, readFileTool, listReposTool].map((tool) => {
    const originalFunc = tool.func.bind(tool);
    tool.func = async (input) => {
      toolSteps.push({ tool: tool.name, input, status: 'running' });
      try {
        const output = await originalFunc(input);
        toolSteps.push({
          tool: tool.name,
          input,
          status: 'done',
          summary: summarizeToolOutput(output),
        });
        return output;
      } catch (err) {
        toolSteps.push({
          tool: tool.name,
          input,
          status: 'error',
          summary: err.message,
        });
        throw err;
      }
    };
    return tool;
  });
}
