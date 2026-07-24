import { useState, useRef, useEffect } from 'react';
import { LuBot, LuX, LuSend, LuLoaderCircle } from 'react-icons/lu';
import { api } from '../services/api';

// Floating chat button + slide-over panel, shown on manager pages (Schedule).
// Grounds every answer in that week's actual DB data — see aiController.chat.
const AiCopilot = ({ weekStart }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // [{ role: 'user' | 'assistant', text }]
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, open]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const { reply } = await api.aiChat({ message: text, week_start: weekStart });
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className="ai-copilot-fab"
        onClick={() => setOpen(true)}
        title="ShiftWise Copilot"
        aria-label="Open ShiftWise Copilot"
      >
        <LuBot size={22} />
      </button>

      {open && (
        <div className="ai-copilot-overlay" onClick={() => setOpen(false)}>
          <div className="ai-copilot-panel" onClick={e => e.stopPropagation()}>
            <div className="ai-copilot-header">
              <div className="ai-copilot-title">
                <LuBot size={18} />
                <span>ShiftWise Copilot</span>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>
                <LuX size={18} />
              </button>
            </div>

            <div className="ai-copilot-messages" ref={scrollRef}>
              {messages.length === 0 && (
                <p className="ai-copilot-empty">
                  Ask about this week's schedule — e.g. "Find a replacement for Tuesday morning who isn't on leave."
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`ai-copilot-msg ${m.role}`}>{m.text}</div>
              ))}
              {loading && (
                <div className="ai-copilot-msg assistant ai-copilot-typing">
                  <LuLoaderCircle size={14} className="spin" /> Thinking...
                </div>
              )}
            </div>

            {error && <div className="error-message ai-copilot-error">{error}</div>}

            <form className="ai-copilot-input-row" onSubmit={handleSend}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask a scheduling question..."
                disabled={loading}
              />
              <button
                type="submit"
                className="btn btn-primary icon-btn"
                disabled={loading || !input.trim()}
                aria-label="Send"
              >
                <LuSend size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AiCopilot;
