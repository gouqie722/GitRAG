import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import './ChatPanel.css';

export default function ChatPanel({ selectedRepo, indexedRepos, isIndexing }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('agent');
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

  const buildHistory = (currentMessages) =>
    currentMessages
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          m.content?.trim() &&
          !m.streaming
      )
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

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

    const history = buildHistory(messages);

    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      {
        role: 'assistant',
        content: '',
        sources: [],
        toolSteps: [],
        streaming: true,
        status: mode === 'agent' ? 'thinking' : 'retrieving',
      },
    ]);
    setLoading(true);

    const handlers = {
      onToolStart: (tool, inputData) => {
        updateLastAssistant((msg) => ({
          ...msg,
          status: 'tool_running',
          toolSteps: [
            ...(msg.toolSteps || []),
            { tool, input: inputData, status: 'running' },
          ],
        }));
      },
      onToolResult: (tool, summary) => {
        updateLastAssistant((msg) => ({
          ...msg,
          toolSteps: (msg.toolSteps || []).map((step) =>
            step.tool === tool && step.status === 'running'
              ? { ...step, status: 'done', summary }
              : step
          ),
        }));
      },
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
    };

    try {
      if (mode === 'agent') {
        await api.agentStream(question, selectedRepo || undefined, history, handlers);
      } else {
        await api.chatStream(question, selectedRepo || undefined, handlers);
      }
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
    if (msg.status === 'thinking') {
      return <span className="typing">Agent 正在思考...</span>;
    }
    if (msg.status === 'retrieving') {
      return <span className="typing">正在检索相关代码...</span>;
    }
    if (msg.status === 'generating' && !msg.content) {
      return <span className="typing">正在生成回答...</span>;
    }

    return (
      <>
        {msg.toolSteps?.length > 0 && (
          <div className="tool-steps">
            {msg.toolSteps.map((step, idx) => (
              <div key={idx} className={`tool-step ${step.status}`}>
                <span className="tool-name">{step.tool}</span>
                <span className="tool-detail">
                  {step.status === 'running'
                    ? '执行中...'
                    : step.summary || '完成'}
                </span>
              </div>
            ))}
          </div>
        )}
        {msg.content ? (
          <>
            <ReactMarkdown>{msg.content}</ReactMarkdown>
            {msg.streaming && <span className="stream-cursor" />}
          </>
        ) : msg.status === 'tool_running' ? (
          <span className="typing">正在调用工具...</span>
        ) : null}
      </>
    );
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <span>问答</span>
          <div className="mode-switch">
            <button
              className={mode === 'agent' ? 'active' : ''}
              onClick={() => setMode('agent')}
              disabled={loading}
            >
              Agent
            </button>
            <button
              className={mode === 'rag' ? 'active' : ''}
              onClick={() => setMode('rag')}
              disabled={loading}
            >
              快速
            </button>
          </div>
        </div>
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
                <p>Agent 模式可自动搜索、读文件、多轮追问</p>
                <ul>
                  <li onClick={() => setInput('florist_admin 的登录流程是怎样的？')}>
                    florist_admin 的登录流程是怎样的？
                  </li>
                  <li onClick={() => setInput('对比 Player 和 florist_admin 的路由结构')}>
                    对比 Player 和 florist_admin 的路由结构
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
          placeholder={mode === 'agent' ? 'Agent 模式：可追问、可多步分析...' : '快速模式：单次检索回答...'}
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
