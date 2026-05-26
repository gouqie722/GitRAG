import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import './ChatPanel.css';

export default function ChatPanel({ selectedRepo, indexedRepos, isIndexing }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const updateLastAssistant = (updater) => {
    setMessages((prev) => {
      const next = [...prev];
      const idx = next.length - 1;
      if (idx < 0 || next[idx].role !== 'assistant') return prev;
      next[idx] = updater(next[idx]);
      return next;
    });
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    if (isIndexing) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: '正在自动索引仓库，请稍候完成后再提问。', sources: [] },
      ]);
      setInput('');
      return;
    }

    if (indexedRepos.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: '请先在左侧索引至少一个 GitHub 项目。', sources: [] },
      ]);
      setInput('');
      return;
    }

    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      {
        role: 'assistant',
        content: '',
        sources: [],
        streaming: true,
        status: 'retrieving',
      },
    ]);
    setLoading(true);

    try {
      await api.chatStream(question, selectedRepo || undefined, {
        onSources: (sources) => {
          updateLastAssistant((msg) => ({
            ...msg,
            sources,
            status: msg.content ? 'streaming' : 'generating',
          }));
        },
        onDelta: (delta) => {
          updateLastAssistant((msg) => ({
            ...msg,
            content: msg.content + delta,
            status: 'streaming',
          }));
        },
        onDone: () => {
          updateLastAssistant((msg) => ({
            ...msg,
            streaming: false,
            status: 'done',
          }));
          setLoading(false);
        },
        onError: () => {
          updateLastAssistant((msg) => ({
            ...msg,
            streaming: false,
            status: 'error',
          }));
          setLoading(false);
        },
      });
    } catch (err) {
      updateLastAssistant((msg) => ({
        ...msg,
        content: msg.content || `错误: ${err.message}`,
        streaming: false,
        status: 'error',
      }));
      setLoading(false);
    }
  };

  const scopeLabel = selectedRepo || '全部已索引项目';

  const renderAssistantContent = (msg) => {
    if (msg.status === 'retrieving') {
      return <span className="typing">正在检索相关代码...</span>;
    }
    if (msg.status === 'generating' && !msg.content) {
      return <span className="typing">正在生成回答...</span>;
    }
    if (msg.content) {
      return (
        <>
          <ReactMarkdown>{msg.content}</ReactMarkdown>
          {msg.streaming && <span className="stream-cursor" />}
        </>
      );
    }
    return null;
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>问答</span>
        <span className="scope">范围: {scopeLabel}</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            {isIndexing ? (
              <>
                <h3>正在索引仓库...</h3>
                <p>索引完成后即可开始提问</p>
              </>
            ) : (
              <>
                <h3>开始提问</h3>
                <p>例如：</p>
                <ul>
                  <li onClick={() => setInput('项目的整体架构是怎样的？')}>
                    项目的整体架构是怎样的？
                  </li>
                  <li onClick={() => setInput('认证/登录逻辑在哪里实现的？')}>
                    认证/登录逻辑在哪里实现的？
                  </li>
                  <li onClick={() => setInput('API 路由有哪些？')}>API 路由有哪些？</li>
                </ul>
              </>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.role === 'assistant' ? renderAssistantContent(msg) : msg.content}
            </div>
            {msg.sources?.length > 0 && (
              <div className="sources">
                <span className="sources-label">引用来源</span>
                {msg.sources.map((s, j) => (
                  <div key={j} className="source-item">
                    <span className="source-path">
                      {s.repo}:{s.path}
                    </span>
                    <span className="source-score">{(s.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input">
        <textarea
          rows={2}
          placeholder="输入你的问题..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button onClick={handleSend} disabled={loading || isIndexing || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  );
}
