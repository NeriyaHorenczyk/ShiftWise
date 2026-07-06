import { useState, useEffect } from 'react';
import { api } from '../services/api';
import useAuth from '../hooks/useAuth';
import {
  getWeekStart,
  getWeekDays,
  toDateString,
  formatDay,
  formatTime,
  formatWeekRange,
  isToday,
} from '../utils/dateUtils';
import {
  LuChevronLeft,
  LuChevronRight,
  LuPlus,
  LuUsers,
  LuX,
} from 'react-icons/lu';
import ConfirmModal from '../components/ConfirmModal';

const Schedule = () => {
  const { isAdmin, isLead, currentUser } = useAuth();

  const canEdit = isLead;

  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');

  const weekDays = getWeekDays(weekStart);

  // load departments
  useEffect(() => {
    const loadDepts = async () => {
      try {
        const data = await api.getDepartments();
        setDepartments(data);
        if (data.length > 0) {
          // leads default to their own department
          if (isLead && !isAdmin) {
            const myDept = data.find(d => d.lead_username === currentUser.username);
            setSelectedDept(myDept?.id || data[0].id);
          } else {
            setSelectedDept(data[0].id);
          }
        }
      } catch (err) {
        setError(err.message);
      }
    };
    loadDepts();
  }, [isLead, isAdmin, currentUser]);

  // load shifts when week or department changes
  useEffect(() => {
    if (!selectedDept) return;
    const loadShifts = async () => {
      setLoading(true);
      try {
        const data = await api.getShifts({
          department_id: selectedDept,
          week_start: toDateString(weekStart),
        });
        setShifts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadShifts();
  }, [selectedDept, weekStart]);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const goToToday = () => setWeekStart(getWeekStart());

  const getShiftsForDay = (day) => {
    return shifts.filter(shift => {
      const shiftDate = new Date(shift.start_time);
      return shiftDate.toDateString() === day.toDateString();
    });
  };

  const handleDayClick = (day) => {
    if (!canEdit) return;
    setSelectedDay(day);
    setShowCreateModal(true);
  };

  const handleShiftClick = (e, shift) => {
    e.stopPropagation();
    setSelectedShift(shift);
    setShowAssignModal(true);
  };

  const handlePublish = async () => {
    try {
      await api.publishShift(selectedShift.id);
      const data = await api.getShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      setShifts(data);
      setShowPublishConfirm(false);
      setShowAssignModal(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnpublish = async () => {
  try {
    await api.unpublishShift(selectedShift.id);
    const data = await api.getShifts({
      department_id: selectedDept,
      week_start: toDateString(weekStart),
    });
    setShifts(data);
    setShowAssignModal(false);
  } catch (err) {
    setError(err.message);
  }
};

  const handleDelete = async () => {
    try {
      await api.deleteShift(selectedShift.id);
      setShifts(prev => prev.filter(s => s.id !== selectedShift.id));
      setShowDeleteConfirm(false);
      setShowAssignModal(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const refreshShifts = async () => {
    const data = await api.getShifts({
      department_id: selectedDept,
      week_start: toDateString(weekStart),
    });
    setShifts(data);
  };

  const handleBulkClear = async () => {
    setBulkLoading(true);
    setBulkMessage('');
    try {
      const { deleted } = await api.bulkClearShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      await refreshShifts();
      setBulkMessage(`Cleared ${deleted} draft shift${deleted !== 1 ? 's' : ''}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
      setShowClearConfirm(false);
    }
  };

  const handleAutoAssign = async () => {
    setBulkLoading(true);
    setBulkMessage('');
    try {
      const result = await api.autoAssignShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      await refreshShifts();
      if (result.assigned > 0) {
        const base = `Auto-assigned ${result.assigned} employee slot${result.assigned !== 1 ? 's' : ''} across draft shifts.`;
        const warn = result.noAvailability ? ' No availability was submitted — employees were distributed evenly.' : '';
        setBulkMessage(base + warn);
      } else {
        setBulkMessage(result.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkPublish = async () => {
    setBulkLoading(true);
    setBulkMessage('');
    try {
      const { published, skipped } = await api.bulkPublishShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      await refreshShifts();
      const msg = skipped > 0
        ? `Published ${published} shift${published !== 1 ? 's' : ''}. ${skipped} skipped (no staff assigned).`
        : `Published ${published} shift${published !== 1 ? 's' : ''}.`;
      setBulkMessage(msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const draftCount = shifts.filter(s => s.status === 'draft').length;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Schedule</h2>
        <p className="page-subtitle">
          {formatWeekRange(weekStart)}
        </p>
      </div>

      {/* Controls */}
      <div className="schedule-controls">
        <div className="week-nav">
          <button className="btn btn-secondary icon-btn" onClick={prevWeek}>
            <LuChevronLeft size={16} />
          </button>
          <button className="btn btn-secondary" onClick={goToToday}>
            Today
          </button>
          <button className="btn btn-secondary icon-btn" onClick={nextWeek}>
            <LuChevronRight size={16} />
          </button>
        </div>

        {departments.length > 0 && (
          <select
            className="dept-select"
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
          >
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}

        {canEdit && selectedDept && draftCount > 0 && (
          <div className="bulk-actions">
            <button
              className="btn btn-secondary"
              onClick={handleAutoAssign}
              disabled={bulkLoading}
              title="Auto-assign employees to unfilled draft shifts based on their availability"
            >
              Auto-assign
            </button>
            <button
              className="btn btn-primary"
              onClick={handleBulkPublish}
              disabled={bulkLoading}
            >
              Publish All
            </button>
            <button
              className="btn btn-danger-outline"
              onClick={() => setShowClearConfirm(true)}
              disabled={bulkLoading}
            >
              Clear Drafts ({draftCount})
            </button>
          </div>
        )}
      </div>

      {bulkMessage && (
        <div className="success-message" style={{ marginBottom: '1rem' }}>{bulkMessage}</div>
      )}

      {error && <div className="page-error">{error}</div>}

      {/* Grid */}
      {loading ? (
        <div className="page-loading">Loading schedule...</div>
      ) : (
        <div className="schedule-grid">
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={`schedule-day ${isToday(day) ? 'today' : ''}`}
              onClick={() => handleDayClick(day)}
            >
              <div className="schedule-day-header">
                <span className="day-name">{formatDay(day)}</span>
                {/* {canEdit && (
                  <button
                    className="add-shift-btn"
                    onClick={e => { e.stopPropagation(); handleDayClick(day); }}
                    title="Add shift"
                  >
                    <LuPlus size={14} />
                  </button>
                )} */}
              </div>

              <div className="schedule-day-shifts">
                {getShiftsForDay(day).length === 0 ? (
                  <div className="no-shifts">No shifts</div>
                ) : (
                  getShiftsForDay(day).map(shift => (
                    <div
                      key={shift.id}
                      className={`shift-card ${
                        shift.status === 'published'
                          ? shift.assigned_count >= shift.required_staff
                            ? 'shift-published'
                            : 'shift-understaffed'
                          : 'shift-draft'
                      }`}
                      onClick={e => handleShiftClick(e, shift)}
                    >
                      <div className="shift-card-title">{shift.title}</div>
                      <div className="shift-card-time">
                        {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                      </div>
                      <div className="shift-card-meta">
                        <span className="shift-card-staff">
                          <LuUsers size={2} />
                          {shift.assigned_count}/{shift.required_staff}
                        </span>
                        <span className={`badge badge-${shift.status}`}>{shift.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create shift modal */}
      {showCreateModal && (
        <CreateShiftModal
          day={selectedDay}
          departmentId={selectedDept}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newShift) => {
            setShifts(prev => [...prev, newShift]);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Shift detail modal */}
{showAssignModal && selectedShift && (
  <ShiftDetailModal
    shift={selectedShift}
    departmentId={selectedDept}
    canEdit={canEdit}
    onClose={() => setShowAssignModal(false)}
    onPublish={() => setShowPublishConfirm(true)}
    onUnpublish={handleUnpublish}
    onDelete={() => setShowDeleteConfirm(true)}
    onAssigned={(updatedShift) => {
      setShifts(prev => prev.map(s => s.id === updatedShift.id ? updatedShift : s));
    }}
  />
)}

      {showPublishConfirm && (
        <ConfirmModal
          title="Publish shift"
          message={`Publish "${selectedShift?.title}"? Employees will be able to see it.`}
          confirmLabel="Publish"
          onConfirm={handlePublish}
          onCancel={() => setShowPublishConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete shift"
          message={`Delete "${selectedShift?.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger={true}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showClearConfirm && (
        <ConfirmModal
          title="Clear draft shifts"
          message={`Delete all ${draftCount} draft shift${draftCount !== 1 ? 's' : ''} for this week? Published shifts are not affected. This cannot be undone.`}
          confirmLabel="Clear drafts"
          danger={true}
          onConfirm={handleBulkClear}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
};

// ── Create Shift Modal ──────────────────────────────
const CreateShiftModal = ({ day, departmentId, onClose, onCreated }) => {
  const [form, setForm] = useState({
    title: '',
    start_time: '',
    end_time: '',
    required_staff: 1,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const dateStr = toDateString(day);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.createShift({
        department_id: departmentId,
        title: form.title,
        start_time: `${dateStr} ${form.start_time}:00`,
        end_time: `${dateStr} ${form.end_time}:00`,
        required_staff: form.required_staff,
      });

      // fetch the created shift to get full data
      const shifts = await api.getShifts({ department_id: departmentId });
      const newShift = shifts.find(s => s.id === result.id);
      onCreated(newShift || result);
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
          <h3 className="modal-title">New shift — {formatDay(day)}</h3>
          <button className="modal-close" onClick={onClose}><LuX size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              placeholder="e.g. Morning shift"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>End time</label>
              <input
                type="time"
                value={form.end_time}
                onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Required staff</label>
            <input
              type="number"
              min="1"
              value={form.required_staff}
              onChange={e => setForm(p => ({ ...p, required_staff: parseInt(e.target.value) }))}
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Shift Detail Modal ──────────────────────────────
const ShiftDetailModal = ({ shift: initialShift, departmentId, canEdit, onClose, onPublish, onUnpublish, onDelete, onAssigned }) => {
  const [shift, setShift] = useState(initialShift);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDetail = async () => {
      try {
        const [detail, users] = await Promise.all([
          api.getShiftById(shift.id),
          api.getUsers(),
        ]);
        setShift(detail);
        setTeamMembers(users.filter(u =>
          u.role === 'employee' || u.role === 'shift_manager' && u.department_id === departmentId
        ));
      } catch (err) {
        setError(err.message);
      }
    };
    loadDetail();
  }, [departmentId, shift.id]);

  const handleAssign = async (userId, isShiftManager) => {
    setLoading(true);
    try {
      await api.assignEmployee(shift.id, { user_id: userId, is_shift_manager: isShiftManager });
      const detail = await api.getShiftById(shift.id);
      setShift(detail);
      onAssigned(detail);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async (username) => {
    const member = teamMembers.find(u => u.username === username);
    if (!member) return;
    setLoading(true);
    try {
      await api.unassignEmployee(shift.id, member.id);
      const detail = await api.getShiftById(shift.id);
      setShift(detail);
      onAssigned(detail);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const assignedUsernames = shift.assignments?.map(a => a.username) || [];
  const unassigned = teamMembers.filter(u => !assignedUsernames.includes(u.username));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{shift.title}</h3>
            <p className="modal-subtitle">
              {formatTime(shift.start_time)} – {formatTime(shift.end_time)} · {shift.department_name}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><LuX size={18} /></button>
        </div>

        <div className="shift-detail-body">
          {/* Assigned employees */}
          <div className="shift-detail-section">
            <h4>Assigned ({shift.assignments?.length || 0}/{shift.required_staff})</h4>
            {shift.assignments?.length === 0 ? (
              <p className="empty-state">No employees assigned yet</p>
            ) : (
              <div className="assigned-list">
                {shift.assignments?.map(a => (
                  <div key={a.username} className="assigned-item">
                    <div className="assigned-item-info">
                      <span className="assigned-name">{a.name}</span>
                      {a.is_shift_manager === 1 && (
                        <span className="sm-badge">SM</span>
                      )}
                    </div>
                    {canEdit && shift.status === 'draft' && (
                      <button
                        className="icon-btn-danger"
                        onClick={() => handleUnassign(a.username)}
                        title="Remove"
                      >
                        <LuX size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assign from team */}
          {canEdit && shift.status === 'draft' && unassigned.length > 0 && (
            <div className="shift-detail-section">
              <h4>Add from team</h4>
              <div className="unassigned-list">
                {unassigned.map(u => (
                  <div key={u.username} className="unassigned-item">
                    <span>{u.name}</span>
                    <div className="assign-actions">
                      {u.role === 'shift_manager' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleAssign(u.id, true)}
                          disabled={loading}
                          title="Assign as shift manager"
                        >
                          as SM
                        </button>
                      )}
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleAssign(u.id, false)}
                        disabled={loading}
                      >
                        <LuPlus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}

          {canEdit && (
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={onDelete}>
                Delete
              </button>
              {shift.status === 'draft' && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const hasShiftManager = shift.assignments?.some(a => a.is_shift_manager === 1);
                    if (!hasShiftManager) {
                      setError('Cannot publish — assign a shift manager first.');
                      return;
                    }
                    onPublish();
                  }}
                  disabled={!shift.assignments?.length}
                >
                  Publish
                </button>
              )}
              {shift.status === 'published' && (
                <button className="btn btn-secondary" onClick={onUnpublish}>
                  Unpublish
                </button>
              )}
            </div>
          )}
      </div>
    </div>
  );
};

export default Schedule;