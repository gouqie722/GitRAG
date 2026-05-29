const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function parseSseEvents(buffer) {
  const events = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // ignore malformed chunk
    }
  }

  return { events, rest };
}

async function consumeSseStream(res, handlers) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseEvents(buffer);
    buffer = rest;

    for (const event of events) {
      if (event.type === 'sources') handlers.onSources?.(event.sources || []);
      if (event.type === 'delta') handlers.onDelta?.(event.content || '');
      if (event.type === 'tool_start') handlers.onToolStart?.(event.tool, event.input || {});
      if (event.type === 'tool_result') handlers.onToolResult?.(event.tool, event.summary || '');
      if (event.type === 'error') {
        const err = new Error(event.error || 'Stream error');
        handlers.onError?.(err);
        throw err;
      }
      if (event.type === 'done') handlers.onDone?.();
    }
  }
}

export const api = {
  health: () => request('/health'),
  listGithubRepos: () => request('/github/repos'),
  listIndexed: () => request('/indexed'),
  indexingStatus: () => request('/indexing/status'),
  indexRepo: (repo) => request('/index', { method: 'POST', body: JSON.stringify({ repo }) }),
  chat: (question, repo) =>
    request('/chat', { method: 'POST', body: JSON.stringify({ question, repo: repo || undefined }) }),

  async chatStream(question, repo, handlers) {
    const res = await fetch(`${BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, repo: repo || undefined }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || `Request failed: ${res.status}`);
      handlers.onError?.(err);
      throw err;
    }

    await consumeSseStream(res, handlers);
  },

  async agentStream(question, repo, history, handlers) {
    const res = await fetch(`${BASE}/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        repo: repo || undefined,
        history: history || [],
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || `Request failed: ${res.status}`);
      handlers.onError?.(err);
      throw err;
    }

    await consumeSseStream(res, handlers);
  },
};
