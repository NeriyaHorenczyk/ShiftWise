import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import useAuth from '../hooks/useAuth';
import { LuArrowLeftRight, LuCheck, LuX } from 'react-icons/lu';

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  approved: 'Approved',
};

const Swaps = () => {
  const { currentUser, isAdmin, isLead } = useAuth();
  const canApprove = isAdmin || isLead;

  const [swaps, setSwaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshRef = useRef(null);

  useEffect(() => {
    const loadSwaps = async () => {
      setLoading(true);
      try {
        const data = await api.getSwaps();
        setSwaps(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    refreshRef.current = loadSwaps;
    loadSwaps();
  }, []);

  const handleRespond = async (swapId, action) => {
    try {
      await api.respondToSwap(swapId, { action });
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApprove = async (swapId, action) => {
    try {
      await api.approveSwap(swapId, { action });
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const pending = swaps.filter(s => s.status === 'pending');
  const accepted = swaps.filter(s => s.status === 'accepted');
  const resolved = swaps.filter(s => s.status === 'approved' || s.status === 'rejected');

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-IL', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Swap Requests</h2>
        <p className="page-subtitle">Manage shift swap requests</p>
      </div>

      {error && <div className="page-error">{error}</div>}

      <SwapSection
        title="Waiting for response"
        swaps={pending}
        currentUser={currentUser}
        canApprove={canApprove}
        onRespond={handleRespond}
        onApprove={handleApprove}
        formatDate={formatDate}
        emptyMessage="No pending swap requests"
      />

      <SwapSection
        title="Awaiting lead approval"
        swaps={accepted}
        currentUser={currentUser}
        canApprove={canApprove}
        onRespond={handleRespond}
        onApprove={handleApprove}
        formatDate={formatDate}
        emptyMessage="No swaps awaiting approval"
      />

      <SwapSection
        title="Resolved"
        swaps={resolved}
        currentUser={currentUser}
        canApprove={canApprove}
        onRespond={handleRespond}
        onApprove={handleApprove}
        formatDate={formatDate}
        emptyMessage="No resolved swap requests"
      />
    </div>
  );
};

const SwapSection = ({ title, swaps, currentUser, canApprove, onRespond, onApprove, formatDate, emptyMessage }) => (
  <div className="swaps-section">
    <h3 className="swaps-section-title">
      {title} {swaps.length > 0 && <span className="count-badge">{swaps.length}</span>}
    </h3>
    {swaps.length === 0 ? (
      <p className="empty-state">{emptyMessage}</p>
    ) : (
      <div className="swaps-list">
        {swaps.map(swap => (
          <SwapCard
            key={swap.id}
            swap={swap}
            currentUser={currentUser}
            canApprove={canApprove}
            onRespond={onRespond}
            onApprove={onApprove}
            formatDate={formatDate}
          />
        ))}
      </div>
    )}
  </div>
);

const SwapCard = ({ swap, currentUser, canApprove, onRespond, onApprove, formatDate }) => {
  const isRequester = swap.requester_username === currentUser.username;
  const isTarget = swap.target_username === currentUser.username;

  return (
    <div className="swap-card">
      <div className="swap-card-header">
        <div className="swap-card-shift">
          <LuArrowLeftRight size={16} className="swap-icon" />
          <span className="swap-shift-title">{swap.shift_title}</span>
          <span className={`badge badge-${swap.status}`}>{STATUS_LABELS[swap.status]}</span>
        </div>
        <span className="swap-date">{formatDate(swap.created_at)}</span>
      </div>

      <div className="swap-card-body">
        <div className="swap-parties">
          <div className={`swap-party ${isRequester ? 'is-you' : ''}`}>
            <span className="party-label">From</span>
            <span className="party-name">
              {isRequester ? 'You' : swap.requester_name}
            </span>
          </div>
          <LuArrowLeftRight size={14} className="swap-arrow" />
          <div className={`swap-party ${isTarget ? 'is-you' : ''}`}>
            <span className="party-label">To</span>
            <span className="party-name">
              {isTarget ? 'You' : swap.target_name}
            </span>
          </div>
        </div>

        <div className="swap-shift-time">
          {formatDate(swap.start_time)} —{' '}
          {new Date(swap.end_time).toLocaleTimeString('en-IL', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>

        {swap.lead_comment && (
          <div className="swap-comment">
            <span className="comment-label">Lead comment:</span> {swap.lead_comment}
          </div>
        )}
      </div>

      {isTarget && swap.status === 'pending' && (
        <div className="swap-actions">
          <button className="btn btn-danger btn-sm" onClick={() => onRespond(swap.id, 'reject')}>
            <LuX size={14} /> Decline
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onRespond(swap.id, 'accept')}>
            <LuCheck size={14} /> Accept
          </button>
        </div>
      )}

      {canApprove && swap.status === 'accepted' && (
        <div className="swap-actions">
          <button className="btn btn-danger btn-sm" onClick={() => onApprove(swap.id, 'reject')}>
            <LuX size={14} /> Reject
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onApprove(swap.id, 'approve')}>
            <LuCheck size={14} /> Approve
          </button>
        </div>
      )}
    </div>
  );
};

export default Swaps;