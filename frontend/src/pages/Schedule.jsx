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
  getMonthStart,
  addMonths,
  getMonthGridWeeks,
  formatMonthLabel,
} from '../utils/dateUtils';
import {
  LuPlus,
  LuUsers,
  LuX,
  LuSparkles,
} from 'react-icons/lu';
import ConfirmModal from '../components/ConfirmModal';
import WeekTimeGrid from '../components/WeekTimeGrid';
import MonthGrid from '../components/MonthGrid';
import CalendarNav from '../components/CalendarNav';
import AiCopilot from '../components/AiCopilot';
import AuditModal from '../components/AuditModal';
import {
  splitIntoDaySegments,
  layoutColumns,
  eventBlockStyle,
  getSlotForHour,
  SHIFT_EVENT_MIN_HEIGHT,
  SHIFT_EVENT_MIN_DURATION_HOURS,
} from '../utils/weekGridUtils';

const Schedule = () => {
  const { isAdmin, isLead, currentUser } = useAuth();

  const canEdit = isLead;
  const canPickDept = isAdmin;

  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  // A single anchor date drives both views, so switching between Week and
  // Month never resets the currently-selected date/time window — each view
  // just derives its own window (week/month) from wherever the anchor is.
  const [anchorDate, setAnchorDate] = useState(new Date());
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
  const [showUnpublishAllConfirm, setShowUnpublishAllConfirm] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessages, setBulkMessages] = useState([]); // [{ text, type }]

  // AI Schedule Auditor
  const [showAudit, setShowAudit] = useState(false);
  const [auditReport, setAuditReport] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');

  const weekStart = getWeekStart(anchorDate);
  const monthStart = getMonthStart(anchorDate);
  const weekDays = getWeekDays(weekStart);
  const monthWeeks = getMonthGridWeeks(monthStart);

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

  // Fetches shifts for whatever window the current view actually displays —
  // the full padded month range in month view, or the plain 7-day window in
  // week view — so callers never have to know which view is active.
  const fetchShiftsForCurrentView = async () => {
    if (viewMode === 'month') {
      const weeks = getMonthGridWeeks(getMonthStart(anchorDate));
      return api.getShifts({
        department_id: selectedDept,
        start_date: toDateString(weeks[0][0]),
        end_date: toDateString(weeks[weeks.length - 1][6]),
      });
    }
    return api.getShifts({
      department_id: selectedDept,
      week_start: toDateString(getWeekStart(anchorDate)),
    });
  };

  // load shifts when the view, date, or department changes
  useEffect(() => {
    if (!selectedDept) return;
    const loadShifts = async () => {
      setLoading(true);
      try {
        const data = await fetchShiftsForCurrentView();
        setShifts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadShifts();
    // anchorDate.getTime() (a primitive) is the real dependency here — the
    // weekStart/monthStart derived above get fresh Date identities every
    // render and must not be listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDept, viewMode, anchorDate.getTime()]);

  const prevWeek = () => setAnchorDate(d => {
    const n = new Date(d);
    n.setDate(n.getDate() - 7);
    return n;
  });

  const nextWeek = () => setAnchorDate(d => {
    const n = new Date(d);
    n.setDate(n.getDate() + 7);
    return n;
  });

  const prevMonth = () => setAnchorDate(d => addMonths(d, -1));
  const nextMonth = () => setAnchorDate(d => addMonths(d, 1));

  const goToToday = () => setAnchorDate(new Date());

  const getSegmentsForDay = (day) => {
    const segments = [];
    shifts.forEach(shift => {
      splitIntoDaySegments(new Date(shift.start_time), new Date(shift.end_time)).forEach(seg => {
        if (seg.dayStart.toDateString() === day.toDateString()) {
          segments.push({ shift, ...seg });
        }
      });
    });
    return layoutColumns(segments, SHIFT_EVENT_MIN_DURATION_HOURS);
  };

  const getShiftsForDay = (day) => {
    return shifts.filter(shift => new Date(shift.start_time).toDateString() === day.toDateString());
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
      setShifts(await fetchShiftsForCurrentView());
      setShowPublishConfirm(false);
      setShowAssignModal(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnpublish = async () => {
    try {
      await api.unpublishShift(selectedShift.id);
      setShifts(await fetchShiftsForCurrentView());
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
    setShifts(await fetchShiftsForCurrentView());
  };

  const handleBulkClear = async () => {
    setBulkLoading(true);
    setBulkMessages([]);
    try {
      const { deleted } = await api.bulkClearShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      await refreshShifts();
      setBulkMessages([{ text: `Cleared ${deleted} draft shift${deleted !== 1 ? 's' : ''}.`, type: 'success' }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
      setShowClearConfirm(false);
    }
  };

  const handleAutoAssign = async () => {
    setBulkLoading(true);
    setBulkMessages([]);
    try {
      const result = await api.autoAssignShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      await refreshShifts();
      const messages = [];
      if (result.assigned > 0) {
        const base = `Auto-assigned ${result.assigned} employee slot${result.assigned !== 1 ? 's' : ''} across draft shifts.`;
        const warn = result.noAvailability ? ' No availability was submitted — employees were distributed evenly.' : '';
        messages.push({ text: base + warn, type: 'success' });
      }
      if (result.failures?.length > 0) {
        result.failures.forEach(f => {
          messages.push({ text: `"${f.title}" was not auto-assigned: ${f.reason}.`, type: 'warning' });
        });
      }
      if (messages.length === 0) {
        messages.push({ text: result.message || 'No changes made.', type: 'success' });
      }
      setBulkMessages(messages);
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkPublish = async () => {
    setBulkLoading(true);
    setBulkMessages([]);
    try {
      const { published, skipped } = await api.bulkPublishShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      await refreshShifts();
      if (skipped > 0) {
        setBulkMessages([{
          text: `Published ${published} shift${published !== 1 ? 's' : ''}. ` +
            `${skipped} shift${skipped !== 1 ? 's' : ''} could not be published because no workers are assigned.`,
          type: 'warning',
        }]);
      } else {
        setBulkMessages([{ text: `Published ${published} shift${published !== 1 ? 's' : ''}.`, type: 'success' }]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUnpublish = async () => {
    setBulkLoading(true);
    setBulkMessages([]);
    try {
      const { unpublished } = await api.bulkUnpublishShifts({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      await refreshShifts();
      setBulkMessages([{ text: `Unpublished ${unpublished} shift${unpublished !== 1 ? 's' : ''}.`, type: 'success' }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
      setShowUnpublishAllConfirm(false);
    }
  };

  const handleAudit = async () => {
    setShowAudit(true);
    setAuditLoading(true);
    setAuditError('');
    setAuditReport('');
    try {
      const { report } = await api.auditSchedule({
        department_id: selectedDept,
        week_start: toDateString(weekStart),
      });
      setAuditReport(report);
    } catch (err) {
      setAuditError(err.message);
    } finally {
      setAuditLoading(false);
    }
  };

  const draftCount = shifts.filter(s => s.status === 'draft').length;
  const publishedCount = shifts.filter(s => s.status === 'published').length;
  const currentDeptName = departments.find(d => d.id === selectedDept)?.name;

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h2>Schedule</h2>
        <p className="page-subtitle">
          {isLead && currentDeptName ? `${currentDeptName} · ` : ''}
          {viewMode === 'month' ? formatMonthLabel(monthStart) : formatWeekRange(weekStart)}
        </p>
      </div>

      {/* Controls */}
      <div className="schedule-controls">
        <CalendarNav
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPrevMonth={prevMonth}
          onPrevWeek={prevWeek}
          onToday={goToToday}
          onNextWeek={nextWeek}
          onNextMonth={nextMonth}
        />

        {canPickDept && departments.length > 0 && (
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

        {canEdit && selectedDept && (
          <button
            className="btn btn-secondary"
            onClick={handleAudit}
            disabled={auditLoading}
            title="Get an AI-generated fairness and burnout report for this week"
          >
            <LuSparkles size={16} />
            Analyze Schedule with AI
          </button>
        )}

        {viewMode === 'week' && canEdit && selectedDept && (draftCount > 0 || publishedCount > 0) && (
          <div className="bulk-actions">
            {draftCount > 0 && (
              <>
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
              </>
            )}
            {publishedCount > 0 && (
              <button
                className="btn btn-danger-outline"
                onClick={() => setShowUnpublishAllConfirm(true)}
                disabled={bulkLoading}
              >
                Unpublish All ({publishedCount})
              </button>
            )}
          </div>
        )}
      </div>

      {bulkMessages.map((m, i) => (
        <div
          key={i}
          className={m.type === 'warning' ? 'warning-message' : 'success-message'}
          style={{ marginBottom: '0.5rem' }}
        >
          {m.text}
        </div>
      ))}

      {error && <div className="page-error">{error}</div>}

      {/* Grid */}
      {loading ? (
        <div className="page-loading">Loading schedule...</div>
      ) : viewMode === 'month' ? (
        <MonthGrid
          monthStart={monthStart}
          weeks={monthWeeks}
          isToday={isToday}
          renderDay={(day) => getShiftsForDay(day).map(shift => {
            const statusClass = shift.status === 'published'
              ? (shift.assigned_count >= shift.required_staff ? 'shift-published' : 'shift-understaffed')
              : 'shift-draft';
            return (
              <div
                key={shift.id}
                className={`month-shift-pill ${statusClass} ${canEdit ? 'clickable' : ''}`}
                onClick={canEdit ? (e => handleShiftClick(e, shift)) : undefined}
                title={`${shift.title} · ${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}`}
              >
                <span className="month-shift-pill-title">{shift.title}</span>
                <span className={`badge badge-${shift.status}`}>{shift.status}</span>
              </div>
            );
          })}
        />
      ) : (
        <WeekTimeGrid
          weekDays={weekDays}
          isToday={isToday}
          renderDayLabel={formatDay}
          onDayLabelClick={canEdit ? handleDayClick : undefined}
          renderDay={(day) => getSegmentsForDay(day).map(seg => {
            const shift = seg.shift;
            const statusClass = shift.status === 'published'
              ? (shift.assigned_count >= shift.required_staff ? 'shift-published' : 'shift-understaffed')
              : 'shift-draft';
            return (
              <div
                key={`${shift.id}-${seg.startHour}`}
                className={`tg-event ${statusClass} ${canEdit ? 'clickable' : ''}`}
                style={eventBlockStyle(seg, SHIFT_EVENT_MIN_HEIGHT)}
                onClick={canEdit ? (e => handleShiftClick(e, shift)) : undefined}
                title={`${shift.title} · ${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}`}
              >
                <div className="tg-event-title">{shift.title}</div>
                <div className="tg-event-time">
                  {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                </div>
                <div className="tg-event-meta">
                  <span className="tg-event-staff">
                    <LuUsers size={11} />
                    {shift.assigned_count}/{shift.required_staff}
                  </span>
                  <span className={`badge badge-${shift.status}`}>{shift.status}</span>
                </div>
              </div>
            );
          })}
        />
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

      {showUnpublishAllConfirm && (
        <ConfirmModal
          title="Unpublish all shifts"
          message={`Move all ${publishedCount} published shift${publishedCount !== 1 ? 's' : ''} back to draft? Assigned employees will be notified.`}
          confirmLabel="Unpublish all"
          danger={true}
          onConfirm={handleBulkUnpublish}
          onCancel={() => setShowUnpublishAllConfirm(false)}
        />
      )}

      {showAudit && (
        <AuditModal
          report={auditReport}
          loading={auditLoading}
          error={auditError}
          onClose={() => setShowAudit(false)}
        />
      )}

      {canEdit && <AiCopilot weekStart={toDateString(weekStart)} />}
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
  // Local staging area for assign/unassign clicks — nothing is persisted to the
  // server until Save or Publish is clicked, so closing the modal any other way
  // discards pending changes for free (we simply never wrote them anywhere).
  const [pendingAssignments, setPendingAssignments] = useState(initialShift.assignments || []);
  const [teamMembers, setTeamMembers] = useState([]);
  const [unavailableUsernames, setUnavailableUsernames] = useState(new Set());
  const [onLeaveUsernames, setOnLeaveUsernames] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDetail = async () => {
      try {
        const [detail, users] = await Promise.all([
          api.getShiftById(shift.id),
          api.getUsers(),
        ]);
        setShift(detail);
        setPendingAssignments(detail.assignments || []);
        setTeamMembers(users.filter(u =>
          u.role === 'employee' || u.role === 'shift_manager' && u.department_id === departmentId
        ));

        // figure out which candidates are unavailable for this shift's slot,
        // or on approved leave that day, so they can be filtered out below
        const shiftDate = new Date(detail.start_time);
        const dayOfWeek = shiftDate.getDay();
        const slot = getSlotForHour(shiftDate.getHours());
        const shiftDateStr = toDateString(shiftDate);
        const weekStartStr = toDateString(getWeekStart(shiftDate));

        const [teamAvail, leaveRequests] = await Promise.all([
          api.getTeamAvailability({ week_start: weekStartStr }),
          api.getLeave(),
        ]);

        setUnavailableUsernames(new Set(
          teamAvail
            .filter(a => a.day_of_week === dayOfWeek && a.slot === slot && a.status === 'unavailable')
            .map(a => a.username)
        ));
        setOnLeaveUsernames(new Set(
          leaveRequests
            .filter(l => l.status === 'approved' && l.start_date <= shiftDateStr && l.end_date >= shiftDateStr)
            .map(l => l.username)
        ));
      } catch (err) {
        setError(err.message);
      }
    };
    loadDetail();
  }, [departmentId, shift.id]);

  const handleAssign = (member, isShiftManager) => {
    setError('');
    setPendingAssignments(prev => [...prev, {
      user_id: member.id,
      username: member.username,
      name: member.name,
      is_shift_manager: isShiftManager ? 1 : 0,
    }]);
  };

  const handleUnassign = (username) => {
    setError('');
    setPendingAssignments(prev => prev.filter(a => a.username !== username));
  };

  // Diffs pendingAssignments against the last known server state and persists
  // only the delta (adds/removes), then refreshes both the server-truth
  // `shift` and the pending staging list from the result.
  const handleSaveChanges = async () => {
    setSaving(true);
    setError('');
    try {
      const original = shift.assignments || [];
      const originalUsernames = new Set(original.map(a => a.username));
      const pendingUsernames = new Set(pendingAssignments.map(a => a.username));

      const toRemove = original.filter(a => !pendingUsernames.has(a.username));
      const toAdd = pendingAssignments.filter(a => !originalUsernames.has(a.username));

      for (const a of toRemove) {
        const member = teamMembers.find(u => u.username === a.username);
        if (member) await api.unassignEmployee(shift.id, member.id);
      }
      for (const a of toAdd) {
        await api.assignEmployee(shift.id, { user_id: a.user_id, is_shift_manager: !!a.is_shift_manager });
      }

      const detail = await api.getShiftById(shift.id);
      setShift(detail);
      setPendingAssignments(detail.assignments || []);
      onAssigned(detail);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const assignedUsernames = pendingAssignments.map(a => a.username);
  const unassigned = teamMembers.filter(u =>
    !assignedUsernames.includes(u.username) &&
    !unavailableUsernames.has(u.username) &&
    !onLeaveUsernames.has(u.username)
  );
  const atCapacity = pendingAssignments.length >= shift.required_staff;
  const hasShiftManagerPending = pendingAssignments.some(a => a.is_shift_manager === 1 || a.is_shift_manager === true);

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
            <h4>Assigned ({pendingAssignments.length}/{shift.required_staff})</h4>
            {pendingAssignments.length === 0 ? (
              <p className="empty-state">No employees assigned yet</p>
            ) : (
              <div className="assigned-list">
                {pendingAssignments.map(a => (
                  <div key={a.username} className="assigned-item">
                    <div className="assigned-item-info">
                      <span className="assigned-name">{a.name}</span>
                      {(a.is_shift_manager === 1 || a.is_shift_manager === true) && (
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
              {atCapacity && (
                <p className="empty-state">
                  Shift is at full capacity ({pendingAssignments.length}/{shift.required_staff}). Remove someone to add another.
                </p>
              )}
              <div className="unassigned-list">
                {unassigned.map(u => (
                  <div key={u.username} className="unassigned-item">
                    <span>{u.name}</span>
                    <div className="assign-actions">
                      {u.role === 'shift_manager' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleAssign(u, true)}
                          disabled={atCapacity || hasShiftManagerPending}
                          title={hasShiftManagerPending ? 'A shift manager is already assigned' : 'Assign as shift manager'}
                        >
                          as SM
                        </button>
                      )}
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleAssign(u, false)}
                        disabled={atCapacity}
                        title={atCapacity ? 'Shift is at full capacity' : undefined}
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
              <button className="btn btn-danger" onClick={onDelete} disabled={saving}>
                Delete
              </button>
              {shift.status === 'draft' && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => { if (await handleSaveChanges()) onClose(); }}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      if (pendingAssignments.length === 0) {
                        setError('Cannot publish a shift with no assigned workers.');
                        return;
                      }
                      if (!hasShiftManagerPending) {
                        setError('Cannot publish — assign a shift manager first.');
                        return;
                      }
                      setError('');
                      if (await handleSaveChanges()) onPublish();
                    }}
                    disabled={saving}
                  >
                    Publish
                  </button>
                </>
              )}
              {shift.status === 'published' && (
                <button className="btn btn-secondary" onClick={onUnpublish} disabled={saving}>
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