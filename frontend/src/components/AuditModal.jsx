import { X } from 'lucide-react';

// Displays the AI Schedule Auditor's fairness/burnout report. Reuses the
// standard .modal/.modal-overlay chrome (see ConfirmModal) rather than
// building bespoke styling for what is, structurally, just another modal.
const AuditModal = ({ report, loading, error, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">AI Schedule Audit</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {loading && <div className="page-loading">Analyzing schedule...</div>}
        {error && <div className="error-message">{error}</div>}
        {!loading && !error && report && (
          <div className="ai-audit-report">{report}</div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default AuditModal;
