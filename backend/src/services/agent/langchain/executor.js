import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getChatModel } from './llm.js';
import { AGENT_SYSTEM_PROMPT } from './prompt.js';
import { buildChatHistory } from './memory.js';
import { createAgentTools } from './tools.js';
import { config } from '../../../config.js';

async function createExecutor({ repoScope, sources, toolSteps }) {
  const llm = getChatModel();
  const tools = createAgentTools({ repoScope, sources, toolSteps });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', AGENT_SYSTEM_PROMPT],
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });

  return new AgentExecutor({
    agent,
    tools,
    maxIterations: config.agent.maxSteps,
    returnIntermediateSteps: true,
  });
}

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  }
  return '';
}

export async function* runAgentStream({ question, repo, history = [] }) {
  const sources = [];
  const toolSteps = [];
  const startedTools = new Set();

  const scopeHint = repo ? `当前优先关注仓库：${repo}。` : '';
  const input = `${scopeHint}${question}`.trim();
  const chatHistory = buildChatHistory(history, config.agent.historyLimit);
  const executor = await createExecutor({ repoScope: repo, sources, toolSteps });

  let sentSources = false;
  let hasDelta = false;

  const eventStream = executor.streamEvents(
    { input, chat_history: chatHistory },
    { version: 'v2' }
  );

  for await (const event of eventStream) {
    if (event.event === 'on_tool_start') {
      const key = `${event.name}-${JSON.stringify(event.data?.input)}`;
      if (startedTools.has(key)) continue;
      startedTools.add(key);
      yield {
        type: 'tool_start',
        tool: event.name,
        input: event.data?.input || {},
      };
    }

    if (event.event === 'on_tool_end') {
      const output = event.data?.output;
      const summary =
        typeof output === 'string' ? output.slice(0, 200) : JSON.stringify(output).slice(0, 200);
      yield {
        type: 'tool_result',
        tool: event.name,
        summary,
      };
    }

    if (event.event === 'on_chat_model_stream') {
      const text = extractText(event.data?.chunk?.content);
      if (text) {
        if (!sentSources && sources.length > 0) {
          yield { type: 'sources', sources: [...sources] };
          sentSources = true;
        }
        hasDelta = true;
        yield { type: 'delta', content: text };
      }
    }
  }

  if (!sentSources && sources.length > 0) {
    yield { type: 'sources', sources };
  }

  if (!hasDelta) {
    yield { type: 'delta', content: '未能生成回答，请尝试换个问法或缩小范围。' };
  }
}
