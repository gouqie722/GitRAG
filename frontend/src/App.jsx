import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import RepoPanel from './components/RepoPanel';
import ChatPanel from './components/ChatPanel';
import './App.css';

export default function App() {
  const [health, setHealth] = useState(null);
  const [githubRepos, setGithubRepos] = useState([]);
  const [indexedRepos, setIndexedRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [indexing, setIndexing] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [h, indexed] = await Promise.all([api.health(), api.listIndexed()]);
      setHealth(h);
      setIndexedRepos(indexed.indexed || []);
      setIndexing(h.indexing || null);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadGithubRepos = useCallback(async () => {
    try {
      const data = await api.listGithubRepos();
      setGithubRepos(data.repos || []);
    } catch (err) {
      console.error('Failed to load GitHub repos:', err.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      await loadGithubRepos();
      setLoading(false);
    })();
  }, [refresh, loadGithubRepos]);

  useEffect(() => {
    if (indexing?.status !== 'running') return undefined;

    const timer = setInterval(async () => {
      try {
        const status = await api.indexingStatus();
        setIndexing(status);
        if (status.status !== 'running') {
          await refresh();
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [indexing?.status, refresh]);

  const handleIndex = async (repo) => {
    const result = await api.indexRepo(repo);
    await refresh();
    return result;
  };

  const isIndexing = indexing?.status === 'running';

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>GitHub RAG</h1>
          <p className="subtitle">跨项目代码检索与问答</p>
        </div>
        <div className="status-badges">
          <StatusBadge label="LanceDB" ok={health?.lancedb === 'connected'} />
          <StatusBadge label="GitHub" ok={health?.github === 'configured'} />
          <StatusBadge label="DeepSeek" ok={health?.deepseek === 'configured'} />
          <StatusBadge label="Embedding" ok={!!health?.embedding && health.embedding !== 'not configured'} />
        </div>
      </header>

      {isIndexing && (
        <div className="indexing-banner">
          正在自动索引：{indexing.current || '准备中...'}
          （{indexing.completed.length}/{indexing.total}）
        </div>
      )}

      <main className="main">
        <RepoPanel
          githubRepos={githubRepos}
          indexedRepos={indexedRepos}
          configuredRepos={health?.configuredRepos || []}
          selectedRepo={selectedRepo}
          onSelectRepo={setSelectedRepo}
          onIndex={handleIndex}
          loading={loading}
          isIndexing={isIndexing}
        />
        <ChatPanel
          selectedRepo={selectedRepo}
          indexedRepos={indexedRepos}
          isIndexing={isIndexing}
        />
      </main>
    </div>
  );
}

function StatusBadge({ label, ok }) {
  return (
    <span className={`badge ${ok ? 'ok' : 'warn'}`}>
      <span className="dot" />
      {label}
    </span>
  );
}
