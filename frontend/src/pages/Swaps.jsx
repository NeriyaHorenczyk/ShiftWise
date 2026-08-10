import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import useAuth from '../hooks/useAuth';
import useSocket from '../hooks/useSocket';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';
import { ArrowLeftRight, Check, X, Search } from 'lucide-react';

const TOAST_DISMISS_MS = 4000;

const PAGE_SIZE = 8;

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  approved: 'Approved',
};

const Swaps = () => {
  const { currentUser, isAdmin, isLead } = useAuth();
  const { socket } = useSocket();
  const canApprove = isAdmin || isLead;

  const [swaps, setSwaps] = useState([]);
  const [total, setTotal] = useState(0);
  // Section badges need the true count for that status across every page,
  // not just how many of the currently-loaded PAGE_SIZE items happen to
  // have that status — so these come from the backend's GROUP BY, not
  // `swaps.filter(...).length`.
  const [statusCounts, setStatusCounts] = useState({ pending: 0, accepted: 0, approved: 0, rejected: 0 });
  const [page, setPage] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(''); // '' = all departments (admin only)
  const [fromSearch, setFromSearch] = useState(''); // canApprove only: requester filter
  const [toSearch, setToSearch] = useState(''); // canApprove only: target filter
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const refreshRef = useRef(null);
  // Only the very first fetch shows the full-page loader — a search
  // keystroke or page-turn re-runs the effect below too, and flipping
  // `loading` back to true for those would unmount this whole tree (inputs
  // included), stealing focus out of the search box mid-keystroke.
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;
    api.getDepartments().then(setDepartments).catch(err => setError(err.message));
  }, [isAdmin]);

  useEffect(() => {
    // Every keystroke in either search box re-runs this effect, firing a new
    // request before the previous one may have resolved. Without this guard,
    // an in-flight request for an earlier (now-stale) search term could
    // resolve after the latest one and clobber the correct results.
    let cancelled = false;

    const loadSwaps = async () => {
      if (!hasLoadedOnce.current) setLoading(true);
      try {
        const data = await api.getSwaps({
          ...(selectedDept ? { department_id: selectedDept } : {}),
          ...(canApprove && fromSearch.trim() ? { from_search: fromSearch.trim() } : {}),
          ...(canApprove && toSearch.trim() ? { to_search: toSearch.trim() } : {}),
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        if (cancelled) return;
        // The endpoint is opt-in paginated: passing `limit` (always true here)
        // switches its response to { items, total, limit, offset }.
        setSwaps(data.items);
        setTotal(data.total);
        setStatusCounts(data.counts || { pending: 0, accepted: 0, approved: 0, rejected: 0 });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      }
    };

    refreshRef.current = loadSwaps;
    loadSwaps();

    return () => { cancelled = true; };
  }, [selectedDept, fromSearch, toSearch, page, canApprove]);

  // Live sync: `swap:requested` reaches a lead/admin when a new swap needs
  // their attention; `swap:updated` reaches the department's managers plus
  // the two employees party to a swap whenever it's accepted/declined/
  // approved/rejected. Both are already room-scoped server-side, so
  // listening unconditionally here is safe.
  useEffect(() => {
    if (!socket) return;
    const refetch = () => refreshRef.current?.();
    socket.on('swap:requested', refetch);
    socket.on('swap:updated', refetch);
    return () => {
      socket.off('swap:requested', refetch);
      socket.off('swap:updated', refetch);
    };
  }, [socket]);

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
      // A rejected approval (e.g. the target became unavailable/on leave/
      // double-booked after accepting) leaves the swap's status untouched
      // server-side — no refetch here, so the card stays in "accepted" and
      // the Lead can still reject it or wait and retry.
      showToast(err.message, 'error');
    }
  };

  const showToast = (message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
  };

  // Cleared on unmount so a delayed dismiss never fires against a
  // component that's no longer there.
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const handleWithdraw = async () => {
    if (!confirmWithdraw) return;
    try {
      await api.deleteSwap(confirmWithdraw.id);
      setConfirmWithdraw(null);
      refreshRef.current?.();
      showToast('Swap request withdrawn.');
    } catch (err) {
      setError(err.message);
      setConfirmWithdraw(null);
    }
  };

  const hasFilters = canApprove && (fromSearch.trim() || toSearch.trim());
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
        <div className="page-header-row">
          <div>
            <h2>Swap Requests</h2>
            <p className="page-subtitle">Manage shift swap requests</p>
          </div>
          {canApprove && (
            <div className="admin-filters">
              {isAdmin && (
                <select
                  className="dept-select"
                  value={selectedDept}
                  onChange={e => { setSelectedDept(e.target.value); setPage(0); }}
                >
                  <option value="">All departments</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
              <div className="search-wrap">
                <Search className="search-icon" size={16} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="From employee..."
                  value={fromSearch}
                  onChange={e => { setFromSearch(e.target.value); setPage(0); }}
                />
              </div>
              <div className="search-wrap">
                <Search className="search-icon" size={16} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="To employee..."
                  value={toSearch}
                  onChange={e => { setToSearch(e.target.value); setPage(0); }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <SwapSection
        title="Waiting for response"
        swaps={pending}
        count={statusCounts.pending}
        currentUser={currentUser}
        canApprove={canApprove}
        onRespond={handleRespond}
        onApprove={handleApprove}
        onCancelRequest={setConfirmWithdraw}
        formatDate={formatDate}
        emptyMessage={hasFilters ? 'No swaps match your filters' : 'No pending swap requests'}
      />

      <SwapSection
        title="Awaiting lead approval"
        swaps={accepted}
        count={statusCounts.accepted}
        currentUser={currentUser}
        canApprove={canApprove}
        onRespond={handleRespond}
        onApprove={handleApprove}
        onCancelRequest={setConfirmWithdraw}
        formatDate={formatDate}
        emptyMessage={hasFilters ? 'No swaps match your filters' : 'No swaps awaiting approval'}
      />

      <SwapSection
        title="Resolved"
        swaps={resolved}
        count={statusCounts.approved + statusCounts.rejected}
        currentUser={currentUser}
        canApprove={canApprove}
        onRespond={handleRespond}
        onApprove={handleApprove}
        onCancelRequest={setConfirmWithdraw}
        formatDate={formatDate}
        emptyMessage={hasFilters ? 'No swaps match your filters' : 'No resolved swap requests'}
      />

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {confirmWithdraw && (
        <ConfirmModal
          title="Withdraw Swap Request"
          message={`Withdraw your swap request for "${confirmWithdraw.shift_title}"? The other employee will no longer be able to respond.`}
          confirmLabel="Withdraw"
          danger
          onConfirm={handleWithdraw}
          onCancel={() => setConfirmWithdraw(null)}
        />
      )}

      {toast && (
        <div className="toast-stack">
          <div className={`toast toast-${toast.type}`}>
            <div className="toast-body">
              <span className="toast-title">{toast.type === 'error' ? 'Approval failed' : 'Success'}</span>
              <span className="toast-message">{toast.message}</span>
            </div>
            <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SwapSection = ({ title, swaps, count, currentUser, canApprove, onRespond, onApprove, onCancelRequest, formatDate, emptyMessage }) => (
  <div className="swaps-section">
    <h3 className="swaps-section-title">
      {title} {count > 0 && <span className="count-badge">{count}</span>}
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
            onCancelRequest={onCancelRequest}
            formatDate={formatDate}
          />
        ))}
      </div>
    )}
  </div>
);

const SwapCard = ({ swap, currentUser, canApprove, onRespond, onApprove, onCancelRequest, formatDate }) => {
  const isRequester = swap.requester_username === currentUser.username;
  const isTarget = swap.target_username === currentUser.username;

  return (
    <div className="swap-card">
      <div className="swap-card-header">
        <div className="swap-card-shift">
          <ArrowLeftRight size={16} className="swap-icon" />
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
          <ArrowLeftRight size={14} className="swap-arrow" />
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

        {swap.message && (
          <div className="swap-comment">
            <span className="comment-label">Message:</span> {swap.message}
          </div>
        )}

        {swap.lead_comment && (
          <div className="swap-comment">
            <span className="comment-label">Lead comment:</span> {swap.lead_comment}
          </div>
        )}
      </div>

      {isTarget && swap.status === 'pending' && (
        <div className="swap-actions">
          <button className="btn btn-danger btn-sm" onClick={() => onRespond(swap.id, 'reject')}>
            <X size={14} /> Decline
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onRespond(swap.id, 'accept')}>
            <Check size={14} /> Accept
          </button>
        </div>
      )}

      {isRequester && swap.status === 'pending' && (
        <div className="swap-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => onCancelRequest(swap)}>
            <X size={14} /> Withdraw
          </button>
        </div>
      )}

      {canApprove && swap.status === 'accepted' && (
        <div className="swap-actions">
          <button className="btn btn-danger btn-sm" onClick={() => onApprove(swap.id, 'reject')}>
            <X size={14} /> Reject
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onApprove(swap.id, 'approve')}>
            <Check size={14} /> Approve
          </button>
        </div>
      )}
    </div>
  );
};

export default Swaps;