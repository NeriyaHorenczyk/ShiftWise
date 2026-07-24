import { useState, useEffect, useCallback, useRef } from 'react';
import { LuX } from 'react-icons/lu';
import useSocket from '../hooks/useSocket';

let nextToastId = 0;
const AUTO_DISMISS_MS = 6000;

// Mounted once (in Layout, so it's present on every authenticated page) and
// listens for the two real-time notification events — a leave request being
// reviewed, or a new swap request needing a manager's attention — rendering
// them as a stack of dismissible toasts regardless of which page the user
// is currently on.
const NotificationCenter = () => {
  const { socket } = useSocket();
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((toast) => {
    const id = ++nextToastId;
    setToasts(prev => [...prev, { id, ...toast }]);
    timersRef.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
  }, [dismiss]);

  useEffect(() => {
    // Clear any pending dismiss timers on unmount so they don't fire after
    // the component (and its state setter) no longer exist. Captured here
    // so the cleanup closes over this render's map, not whatever the ref
    // points to by the time unmount actually runs.
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleLeaveStatusChanged = (payload) => {
      pushToast({
        type: payload.status === 'approved' ? 'success' : 'warning',
        title: `Your leave request was ${payload.status}`,
        message: payload.lead_comment ? `Comment: ${payload.lead_comment}` : null,
      });
    };

    const handleSwapRequested = (payload) => {
      const base = `${payload.requesterUsername} wants to swap "${payload.shiftTitle}" with ${payload.targetUsername}.`;
      pushToast({
        type: 'info',
        title: 'New swap request',
        message: payload.message ? `${base} "${payload.message}"` : base,
      });
    };

    socket.on('leave:status_changed', handleLeaveStatusChanged);
    socket.on('swap:requested', handleSwapRequested);

    return () => {
      socket.off('leave:status_changed', handleLeaveStatusChanged);
      socket.off('swap:requested', handleSwapRequested);
    };
  }, [socket, pushToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <div className="toast-body">
            <span className="toast-title">{t.title}</span>
            {t.message && <span className="toast-message">{t.message}</span>}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <LuX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default NotificationCenter;
