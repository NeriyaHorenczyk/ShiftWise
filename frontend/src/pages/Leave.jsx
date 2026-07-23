import { useState, useEffect, useRef } from 'react';
import { api, getAssetUrl } from '../services/api';
import useAuth from '../hooks/useAuth';
import { LuFileText, LuPlus, LuX, LuCheck, LuPaperclip } from 'react-icons/lu';

const Leave = () => {
  const { currentUser, isAdmin, isLead } = useAuth();
  const canReview = isAdmin || isLead;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const refreshRef = useRef(null);

  useEffect(() => {
    const loadRequests = async () => {
      setLoading(true);
      try {
        const data = await api.getLeave();
        setRequests(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    refreshRef.current = loadRequests;
    loadRequests();
  }, []);

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
          {!canReview && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <LuPlus size={16} />
              New request
            </button>
          )}
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {/* Pending */}
      <div className="leave-section">
        <h3 className="swaps-section-title">
          Pending {pending.length > 0 && <span className="count-badge">{pending.length}</span>}
        </h3>
        {pending.length === 0 ? (
          <p className="empty-state">No pending leave requests</p>
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
          Resolved {resolved.length > 0 && <span className="count-badge">{resolved.length}</span>}
        </h3>
        {resolved.length === 0 ? (
          <p className="empty-state">No resolved leave requests</p>
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
          <LuFileText size={36} className="leave-icon" />
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
              <LuX size={14} />
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
            <LuPaperclip size={16} />
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
                  <LuX size={14} /> Reject
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onReview(request.id, 'approve', comment)}>
                  <LuCheck size={14} /> Approve
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
          <button className="modal-close" onClick={onClose}><LuX size={18} /></button>
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
            <label>Reason (optional)</label>
            <textarea
              className="form-textarea"
              placeholder="Describe the reason for your leave..."
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              rows={3}
            />
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