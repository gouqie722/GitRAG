import { useState } from 'react';
import './RepoPanel.css';

export default function RepoPanel({
  githubRepos,
  indexedRepos,
  configuredRepos,
  selectedRepo,
  onSelectRepo,
  onIndex,
  loading,
  isIndexing,
}) {
  const [indexing, setIndexing] = useState(null);
  const [manualRepo, setManualRepo] = useState('');
  const [error, setError] = useState('');

  const indexedSet = new Set(indexedRepos.map((r) => r.repo));

  const handleIndex = async (repo) => {
    setError('');
    setIndexing(repo);
    try {
      await onIndex(repo);
    } catch (err) {
      setError(err.message);
    } finally {
      setIndexing(null);
    }
  };

  const handleManualIndex = () => {
    const repo = manualRepo.trim();
    if (repo) handleIndex(repo);
  };

  return (
    <aside className="repo-panel">
      {configuredRepos.length > 0 && (
        <section className="panel-section">
          <h2>预配置仓库</h2>
          <ul className="configured-list">
            {configuredRepos.map((repo) => (
              <li key={repo}>{repo}</li>
            ))}
          </ul>
          <p className="hint">启动时自动索引，无需手动添加</p>
        </section>
      )}

      <section className="panel-section">
        <h2>手动添加</h2>
        <div className="manual-input">
          <input
            placeholder="owner/repo"
            value={manualRepo}
            onChange={(e) => setManualRepo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualIndex()}
          />
          <button onClick={handleManualIndex} disabled={!!indexing || isIndexing || !manualRepo.trim()}>
            索引
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h2>我的 GitHub 项目</h2>
        {loading ? (
          <p className="hint">加载中...</p>
        ) : githubRepos.length === 0 ? (
          <p className="hint">未获取到项目，请检查 GITHUB_TOKEN</p>
        ) : (
          <ul className="repo-list">
            {githubRepos.map((r) => (
              <li key={r.fullName} className={selectedRepo === r.fullName ? 'active' : ''}>
                <button className="repo-item" onClick={() => onSelectRepo(r.fullName)}>
                  <span className="repo-name">{r.fullName}</span>
                  {r.language && <span className="repo-lang">{r.language}</span>}
                </button>
                <button
                  className="index-btn"
                  onClick={() => handleIndex(r.fullName)}
                  disabled={indexing === r.fullName || isIndexing}
                >
                  {indexing === r.fullName
                    ? '索引中...'
                    : indexedSet.has(r.fullName)
                      ? '重新索引'
                      : '索引'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-section">
        <h2>已索引 ({indexedRepos.length})</h2>
        {indexedRepos.length === 0 ? (
          <p className="hint">暂无已索引项目</p>
        ) : (
          <ul className="indexed-list">
            {indexedRepos.map((r) => (
              <li
                key={r.repo}
                className={selectedRepo === r.repo ? 'active' : ''}
                onClick={() => onSelectRepo(r.repo)}
              >
                <span className="repo-name">{r.repo}</span>
                <span className="repo-stats">
                  {r.fileCount} 文件 · {r.chunkCount} 片段
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="filter-bar">
        <label>问答范围</label>
        <select value={selectedRepo} onChange={(e) => onSelectRepo(e.target.value)}>
          <option value="">全部已索引项目</option>
          {indexedRepos.map((r) => (
            <option key={r.repo} value={r.repo}>
              {r.repo}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
    </aside>
  );
}
