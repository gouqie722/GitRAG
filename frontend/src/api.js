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
    const line = part
      .split('\n')
      .find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // ignore malformed chunk
    }
  }

  return { events, rest };
}

export const api = {
  health: () => request('/health'),
  listGithubRepos: () => request('/github/repos'),
  listIndexed: () => request('/indexed'),
  indexingStatus: () => request('/indexing/status'),
  indexRepo: (repo) => request('/index', { method: 'POST', body: JSON.stringify({ repo }) }),
  chat: (question, repo) =>
    request('/chat', { method: 'POST', body: JSON.stringify({ question, repo: repo || undefined }) }),

  async chatStream(question, repo, { onSources, onDelta, onDone, onError }) {
    let res;
    try {
      res = await fetch(`${BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, repo: repo || undefined }),
      });
    } catch (err) {
      onError?.(err);
      throw err;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || `Request failed: ${res.status}`);
      onError?.(err);
      throw err;
    }

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
        if (event.type === 'sources') onSources?.(event.sources || []);
        if (event.type === 'delta') onDelta?.(event.content || '');
        if (event.type === 'error') {
          const err = new Error(event.error || 'Stream error');
          onError?.(err);
          throw err;
        }
        if (event.type === 'done') onDone?.();
      }
    }
  },
};
