import { useState, useEffect, useRef } from 'react';
import { api, getAssetUrl } from '../services/api';
import useAuth from '../hooks/useAuth';
import useSocket from '../hooks/useSocket';
import Pagination from '../components/Pagination';
import { FileText, Plus, X, Check, Paperclip, Sparkles, LoaderCircle, Search } from 'lucide-react';

const PAGE_SIZE = 8;

const Leave = () => {
  const { currentUser, isAdmin, isLead } = useAuth();
  const { socket } = useSocket();
  const canReview = isAdmin || isLead;

  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  // Section badges need the true count for that status across every page,
  // not just how many of the currently-loaded PAGE_SIZE items happen to
  // have that status — so these come from the backend's GROUP BY, not
  // `requests.filter(...).length`.
  const [statusCounts, setStatusCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [page, setPage] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(''); // '' = all departments (admin only)
  const [nameSearch, setNameSearch] = useState(''); // canReview only: employee name filter
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  // Filters narrow the server-side query, so changing either one makes the
  // previous page number meaningless — the onChange handlers below reset
  // page back to 0 whenever selectedDept/nameSearch change.
  useEffect(() => {
    // Every keystroke in the name-search box re-runs this effect, firing a
    // new request before the previous one may have resolved. Without this
    // guard, an in-flight request for an earlier (now-stale) search term
    // could resolve after the latest one and clobber the correct results.
    let cancelled = false;

    const loadRequests = async () => {
      if (!hasLoadedOnce.current) setLoading(true);
      try {
        const data = await api.getLeave({
          ...(selectedDept ? { department_id: selectedDept } : {}),
          ...(canReview && nameSearch.trim() ? { search: nameSearch.trim() } : {}),
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        if (cancelled) return;
        // The endpoint is opt-in paginated: passing `limit` (always true here)
        // switches its response to { items, total, limit, offset }.
        setRequests(data.items);
        setTotal(data.total);
        setStatusCounts(data.counts || { pending: 0, approved: 0, rejected: 0 });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      }
    };

    refreshRef.current = loadRequests;
    loadRequests();

    return () => { cancelled = true; };
  }, [selectedDept, nameSearch, page, canReview]);

  // Live sync: `leave:updated` reaches a lead/admin when anyone in their
  // department creates/withdraws/gets-reviewed a leave request;
  // `leave:status_changed` reaches the one employee whose own request was
  // just reviewed. Both are already room-scoped server-side (see
  // socketService.js), so listening unconditionally here is safe — a socket
  // only ever receives the events its room membership actually matches.
  useEffect(() => {
    if (!socket) return;
    const refetch = () => refreshRef.current?.();
    socket.on('leave:updated', refetch);
    socket.on('leave:status_changed', refetch);
    return () => {
      socket.off('leave:updated', refetch);
      socket.off('leave:status_changed', refetch);
    };
  }, [socket]);

  const handleReview = async (id, action, lead_comment) => {
    try {
      await api.reviewLeave(id, { action, lead_comment });
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteLeave(id);
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const nameQ = nameSearch.trim();
  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status === 'approved' || r.status === 'rejected');

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IL', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Leave Requests</h2>
            <p className="page-subtitle">Manage time off requests</p>
          </div>
          {canReview && (
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
                  placeholder="Filter by employee name..."
                  value={nameSearch}
                  onChange={e => { setNameSearch(e.target.value); setPage(0); }}
                />
              </div>
            </div>
          )}
          {!canReview && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              New request
            </button>
          )}
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {/* Pending */}
      <div className="leave-section">
        <h3 className="swaps-section-title">
          Pending {statusCounts.pending > 0 && <span className="count-badge">{statusCounts.pending}</span>}
        </h3>
        {pending.length === 0 ? (
          <p className="empty-state">{nameQ ? 'No matching requests' : 'No pending leave requests'}</p>
        ) : (
          <div className="leave-list">
            {pending.map(r => (
              <LeaveCard
                key={r.id}
                request={r}
                currentUser={currentUser}
                canReview={canReview}
                onReview={handleReview}
                onDelete={handleDelete}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Resolved */}
      <div className="leave-section">
        <h3 className="swaps-section-title">
          Resolved {(statusCounts.approved + statusCounts.rejected) > 0 && (
            <span className="count-badge">{statusCounts.approved + statusCounts.rejected}</span>
          )}
        </h3>
        {resolved.length === 0 ? (
          <p className="empty-state">{nameQ ? 'No matching requests' : 'No resolved leave requests'}</p>
        ) : (
          <div className="leave-list">
            {resolved.map(r => (
              <LeaveCard
                key={r.id}
                request={r}
                currentUser={currentUser}
                canReview={canReview}
                onReview={handleReview}
                onDelete={handleDelete}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {showCreateModal && (
        <CreateLeaveModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            refreshRef.current?.();
          }}
        />
      )}
    </div>
  );
};

const LeaveCard = ({ request, currentUser, canReview, onReview, onDelete, formatDate }) => {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [comment, setComment] = useState('');
  const isOwner = request.username === currentUser.username;

  return (
    <div className="leave-card">
      <div className="leave-card-header">
        <div className="leave-card-info">
          <FileText size={36} className="leave-icon" />
          <div>
            <span className="leave-name">{isOwner ? 'Your request' : request.user_name}</span>
            <span className="leave-dates">
              {formatDate(request.start_date)} - {formatDate(request.end_date)}
            </span>
          </div>
        </div>
        <div className="leave-card-meta">
          <span className={`badge badge-${request.status}`}>{request.status}</span>
          {isOwner && request.status === 'pending' && (
            <button className="icon-btn-danger" onClick={() => onDelete(request.id)} title="Cancel request">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {request.reason && (
        <p className="leave-reason">{request.reason}</p>
      )}

        {request.document_url && (
        
        <a  href={getAssetUrl(request.document_url)}
            target="_blank"
            rel="noreferrer"
            className="leave-document"
        >
            <Paperclip size={16} />
            View document
        </a>
        )}

      {request.lead_comment && (
        <div className="swap-comment">
          <span className="comment-label">Comment:</span> {request.lead_comment}
        </div>
      )}

      {request.reviewed_by_name && (
        <p className="leave-reviewed-by">Reviewed by {request.reviewed_by_name}</p>
      )}

      {canReview && request.status === 'pending' && (
        <div className="leave-review">
          {!showReviewForm ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowReviewForm(true)}>
              Treatment
            </button>
          ) : (
            <div className="review-form">
              <input
                type="text"
                className="review-comment-input"
                placeholder="Optional comment..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <div className="review-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowReviewForm(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => onReview(request.id, 'reject', comment)}>
                  <X size={14} /> Reject
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onReview(request.id, 'approve', comment)}>
                  <Check size={14} /> Approve
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CreateLeaveModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState('');

  const canRefine = !!form.reason.trim() && !!form.start_date && !!form.end_date;

  const handleRefine = async () => {
    if (!canRefine || refining) return;
    setRefining(true);
    setRefineError('');
    try {
      const { refinedText } = await api.refineLeaveRequest({
        reason: form.reason.trim(),
        startDate: form.start_date,
        endDate: form.end_date,
      });
      setForm(p => ({ ...p, reason: refinedText }));
    } catch (err) {
      setRefineError(err.message);
    } finally {
      setRefining(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (new Date(form.start_date) > new Date(form.end_date))
      return setError('Start date must be before end date.');

    if (!file)
      return setError('A supporting document (medical certificate) is required.');

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('start_date', form.start_date);
      formData.append('end_date', form.end_date);
      if (form.reason) formData.append('reason', form.reason);
      if (file) formData.append('document', file);

      await api.createLeave(formData);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">New leave request</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>End date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label>Reason (optional)</label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRefine}
                disabled={!canRefine || refining}
                title={canRefine ? 'Rewrite your note as a polished, professional reason' : 'Select start and end dates and enter a reason first'}
              >
                {refining ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
                Refine with AI
              </button>
            </div>
            <textarea
              className="form-textarea"
              placeholder="Describe the reason for your leave..."
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              rows={3}
            />
            {refineError && <div className="error-message">{refineError}</div>}
          </div>

          <div className="form-group">
            <label>Medical certificate (required)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setFile(e.target.files[0])}
              className="file-input"
              required
            />
            <p className="input-hint">PDF, JPG or PNG, max 5MB</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Leave;