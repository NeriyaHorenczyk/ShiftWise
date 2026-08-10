import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, CalendarCheck, Zap, Bookmark, Save, FolderOpen } from 'lucide-react';
import { api } from '../services/api';
import { getWeekStart, toDateString, formatWeekRange } from '../utils/dateUtils';
import ConfirmModal from '../components/ConfirmModal';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatTimeStr = (t) => {
  if (!t) return '';
  const [h, min] = t.split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(min, 10), 0);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Shift slot form modal (template days, overrides, and new presets) ─────────
const ShiftSlotFormModal = ({ modalTitle, presets, onSubmit, onClose }) => {
  // a shift manager is always required for a shift — not user-configurable here
  const [form, setForm] = useState({ title: '', start_time: '', end_time: '', required_staff: 1, needs_shift_manager: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handlePresetClick = async (preset) => {
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        title: preset.title,
        start_time: preset.start_time,
        end_time: preset.end_time,
        required_staff: preset.required_staff,
        needs_shift_manager: preset.needs_shift_manager,
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{modalTitle}</h3>

        {presets?.length > 0 && (
          <div className="preset-picker">
            <p className="preset-picker-label">Saved presets</p>
            <div className="preset-picker-list">
              {presets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="preset-chip"
                  onClick={() => handlePresetClick(p)}
                  disabled={loading}
                >
                  <span className="preset-chip-title">{p.title}</span>
                  <span className="preset-chip-detail">
                    {formatTimeStr(p.start_time)}–{formatTimeStr(p.end_time)} · {p.required_staff} staff{p.needs_shift_manager ? ' · SM' : ''}
                  </span>
                </button>
              ))}
            </div>
            <div className="preset-divider"><span>or fill manually</span></div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label>Title</label>
            <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. Morning Shift" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start Time</label>
              <input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} required />
            </div>
          </div>
          <div className="form-group">
            <label>Required Staff</label>
            <input type="number" min="1" max="50" value={form.required_staff} onChange={e => setForm(p => ({ ...p, required_staff: parseInt(e.target.value) || 1 }))} required />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding…' : 'Add Shift'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Save Weekly Template Modal ───────────────────────────────────────────────
const SaveTemplateModal = ({ onSubmit, onClose }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Save as Weekly Template</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Snapshots the current weekly template grid (all 7 days) under a name you can reload later.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label>Template name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. Summer Schedule"
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Add Override Modal ───────────────────────────────────────────────────────
const AddOverrideModal = ({ blueprintId, onClose, onAdded }) => {
  const [form, setForm] = useState({ override_date: '', label: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const todayStr = toDateString(new Date());
  const isPastDate = form.override_date !== '' && form.override_date < todayStr;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Belt-and-suspenders against the `min` attribute being bypassed (some
    // browsers still accept a manually typed date outside the allowed
    // range) — the backend re-validates this regardless, but failing fast
    // client-side avoids a round trip for the common case.
    if (isPastDate) {
      setError('Cannot create or modify date overrides for past dates.');
      return;
    }
    setLoading(true);
    try {
      await api.addBlueprintOverride(blueprintId, form);
      onAdded();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Add Date Override</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Override a specific date with custom shifts. Leave shifts empty to skip the day entirely.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              min={todayStr}
              value={form.override_date}
              onChange={e => setForm(p => ({ ...p, override_date: e.target.value }))}
              required
            />
            {isPastDate && (
              <p className="error-message" style={{ marginTop: '0.5rem' }}>
                Cannot create or modify date overrides for past dates.
              </p>
            )}
          </div>
          <div className="form-group">
            <label>Label</label>
            <input type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} required placeholder="e.g. Independence Day" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || isPastDate}>{loading ? 'Adding…' : 'Add Override'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Blueprint Shift Card (template grid) ─────────────────────────────────────
const BpShiftCard = ({ slot, onRemove }) => (
  <div className="bp-shift-card">
    <div className="bp-shift-body">
      <span className="bp-shift-title">{slot.title}</span>
      <span className="bp-shift-time">{formatTimeStr(slot.start_time)} – {formatTimeStr(slot.end_time)}</span>
      <div className="bp-shift-meta">
        <span className="bp-shift-staff">{slot.required_staff} staff</span>
        {slot.needs_shift_manager && <span className="sm-badge">SM</span>}
      </div>
    </div>
    <button className="icon-btn-danger" onClick={onRemove} title="Remove slot">
      <Trash2 size={13} />
    </button>
  </div>
);

// ── Override Shift Row ────────────────────────────────────────────────────────
const OverrideShiftRow = ({ shift, onRemove }) => (
  <div className="bp-override-shift-row">
    <span className="bp-shift-title">{shift.title}</span>
    <span className="bp-shift-time">{formatTimeStr(shift.start_time)} – {formatTimeStr(shift.end_time)}</span>
    <span className="bp-shift-staff">{shift.required_staff} staff</span>
    {shift.needs_shift_manager && <span className="sm-badge">SM</span>}
    <button className="icon-btn-danger" onClick={onRemove} title="Remove shift">
      <Trash2 size={12} />
    </button>
  </div>
);

// ── Main Page ────────────────────────────────────────────────────────────────
const Blueprint = () => {
  const navigate = useNavigate();

  const [blueprint, setBlueprint] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // template grid: which day's add-shift modal is open (0–6 or null)
  const [addShiftDay, setAddShiftDay] = useState(null);
  // overrides
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [addOverrideShiftId, setAddOverrideShiftId] = useState(null);
  // presets
  const [showAddPreset, setShowAddPreset] = useState(false);
  // weekly templates (named snapshots of the whole grid)
  const [templates, setTemplates] = useState([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [applyTemplateId, setApplyTemplateId] = useState(null); // pending confirm
  const [templateError, setTemplateError] = useState('');

  const [weekToGenerate, setWeekToGenerate] = useState(() => toDateString(getWeekStart()));
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState(null);
  const [generateError, setGenerateError] = useState('');

  const refreshRef = useRef(null);
  const templatesRefreshRef = useRef(null);

  // Both fetched together on mount via Promise.all — listWeeklyTemplates no
  // longer needs the blueprint's id (it resolves the department server-side,
  // same as getBlueprint does), so there's no data dependency forcing these
  // into a waterfall. Each keeps its own error channel and its own refresh
  // function (assigned to the refs below) since saving/deleting a template
  // shouldn't need to refetch the whole grid, and vice versa — only the
  // *initial* load is combined.
  useEffect(() => {
    const loadBlueprint = async () => {
      try {
        const data = await api.getBlueprint();
        setBlueprint(data);
      } catch (err) {
        setError(err.message);
      }
    };
    const loadTemplates = async () => {
      try {
        const list = await api.listWeeklyTemplates();
        setTemplates(list);
      } catch (err) {
        setTemplateError(err.message);
      }
    };
    refreshRef.current = loadBlueprint;
    templatesRefreshRef.current = loadTemplates;

    const init = async () => {
      setLoading(true);
      setError('');
      setTemplateError('');
      await Promise.all([loadBlueprint(), loadTemplates()]);
      setLoading(false);
    };
    init();
  }, []);

  const handleCreate = async () => {
    setError('');
    try {
      const data = await api.createBlueprint({ name: 'Standard Week' });
      setBlueprint(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveShift = async (slotId) => {
    try {
      await api.removeBlueprintShift(blueprint.id, slotId);
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemovePreset = async (presetId) => {
    try {
      await api.removeBlueprintPreset(blueprint.id, presetId);
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveTemplate = async (name) => {
    await api.saveWeeklyTemplate(blueprint.id, { name });
    setShowSaveTemplateModal(false);
    templatesRefreshRef.current?.();
  };

  const handleApplyTemplate = async () => {
    const templateId = applyTemplateId;
    setApplyTemplateId(null);
    setTemplateError('');
    try {
      await api.applyWeeklyTemplate(blueprint.id, templateId);
      refreshRef.current?.();
    } catch (err) {
      setTemplateError(err.message);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      await api.deleteWeeklyTemplate(blueprint.id, templateId);
      templatesRefreshRef.current?.();
    } catch (err) {
      setTemplateError(err.message);
    }
  };

  const handleRemoveOverride = async (ovId) => {
    try {
      await api.removeBlueprintOverride(blueprint.id, ovId);
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveOverrideShift = async (ovId, shiftId) => {
    try {
      await api.removeBlueprintOverrideShift(blueprint.id, ovId, shiftId);
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWeekChange = (e) => {
    const picked = new Date(e.target.value + 'T00:00:00');
    setWeekToGenerate(toDateString(getWeekStart(picked)));
    setGenerateResult(null);
    setGenerateError('');
  };

  const handleGenerate = async () => {
    setGenerateError('');
    setGenerateResult(null);
    setGenerating(true);
    try {
      const result = await api.generateBlueprint(blueprint.id, { week_start: weekToGenerate });
      setGenerateResult(result);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const presets = blueprint?.presets || [];
  const shiftsByDay = Array.from({ length: 7 }, (_, i) =>
    (blueprint?.shifts || []).filter(s => s.day_of_week === i)
  );

  const activeOverride = blueprint?.overrides?.find(o => o.id === addOverrideShiftId);

  if (loading) return <div className="page-loading">Loading blueprint…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Schedule Blueprint</h2>
          <p className="page-subtitle">Define your department's recurring weekly shift template</p>
        </div>
      </div>

      {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!blueprint ? (
        <div className="blueprint-empty">
          <CalendarCheck size={48} strokeWidth={1.5} />
          <h3>No blueprint yet</h3>
          <p>Create a weekly template and generate draft shifts for any week in seconds.</p>
          <button className="btn btn-primary" onClick={handleCreate}>Create Blueprint</button>
        </div>
      ) : (
        <>
          {/* ── Shift Presets library ── */}
          <section className="blueprint-section">
            <div className="blueprint-section-header">
              <div>
                <h3 className="blueprint-section-title">Shift Presets</h3>
                <p className="blueprint-section-hint">Save commonly used shifts here — they appear as one-click shortcuts when adding shifts to any day.</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddPreset(true)}>
                <Bookmark size={14} /> Save Preset
              </button>
            </div>

            {presets.length === 0 ? (
              <p className="blueprint-empty-hint">No presets saved yet. Add your common shifts (Morning, Afternoon, Evening…) to speed up template editing.</p>
            ) : (
              <div className="bp-presets-grid">
                {presets.map(p => (
                  <div key={p.id} className="bp-preset-card">
                    <div className="bp-preset-body">
                      <span className="bp-shift-title">{p.title}</span>
                      <span className="bp-shift-time">{formatTimeStr(p.start_time)} – {formatTimeStr(p.end_time)}</span>
                      <div className="bp-shift-meta">
                        <span className="bp-shift-staff">{p.required_staff} staff</span>
                        {p.needs_shift_manager && <span className="sm-badge">SM</span>}
                      </div>
                    </div>
                    <button className="icon-btn-danger" onClick={() => handleRemovePreset(p.id)} title="Remove preset">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Weekly template ── */}
          <section className="blueprint-section">
            <div className="blueprint-section-header">
              <div>
                <h3 className="blueprint-section-title">Weekly Template</h3>
                <p className="blueprint-section-hint">Click <strong>+</strong> on any day to add a recurring shift slot.</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSaveTemplateModal(true)}>
                <Save size={14} /> Save as Template
              </button>
            </div>

            {templateError && <div className="error-message" style={{ marginBottom: '1rem' }}>{templateError}</div>}

            {templates.length > 0 && (
              <div className="bp-presets-grid" style={{ marginBottom: '1rem' }}>
                {templates.map(t => (
                  <div key={t.id} className="bp-preset-card">
                    <div className="bp-preset-body">
                      <span className="bp-shift-title">{t.name}</span>
                      <span className="bp-shift-time">{t.shift_count} shift{t.shift_count !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setApplyTemplateId(t.id)}
                        title="Load this template into the grid below"
                      >
                        <FolderOpen size={13} /> Load
                      </button>
                      <button
                        className="icon-btn-danger"
                        onClick={() => handleDeleteTemplate(t.id)}
                        title="Delete template"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="schedule-grid">
              {DAY_NAMES.map((name, i) => (
                <div key={i} className="schedule-day">
                  <div className="schedule-day-header">
                    <span className="day-name">{name}</span>
                    <button className="add-shift-btn" onClick={() => setAddShiftDay(i)} title={`Add shift on ${name}`}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="schedule-day-shifts">
                    {shiftsByDay[i].length === 0
                      ? <p className="no-shifts">No shifts</p>
                      : shiftsByDay[i].map(slot => (
                          <BpShiftCard key={slot.id} slot={slot} onRemove={() => handleRemoveShift(slot.id)} />
                        ))
                    }
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Date overrides ── */}
          <section className="blueprint-section">
            <div className="blueprint-section-header">
              <h3 className="blueprint-section-title">Date Overrides</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowOverrideModal(true)}>
                <Plus size={14} /> Add Override
              </button>
            </div>

            {blueprint.overrides.length === 0 ? (
              <p className="blueprint-empty-hint">
                No overrides — every week uses the standard template. Add an override to customize shifts for holidays or special dates.
              </p>
            ) : (
              <div className="bp-overrides-list">
                {blueprint.overrides.map(ov => (
                  <div key={ov.id} className="bp-override-card">
                    <div className="bp-override-header">
                      <div className="bp-override-info">
                        <span className="bp-override-date">
                          {new Date(ov.override_date + 'T00:00:00').toLocaleDateString('en-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="bp-override-label">{ov.label}</span>
                      </div>
                      <button className="icon-btn-danger" onClick={() => handleRemoveOverride(ov.id)} title="Remove override">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="bp-override-shifts-section">
                      {ov.shifts.length === 0 ? (
                        <p className="bp-override-empty-hint">No shifts — this day will be skipped when generating.</p>
                      ) : (
                        ov.shifts.map(s => (
                          <OverrideShiftRow
                            key={s.id}
                            shift={s}
                            onRemove={() => handleRemoveOverrideShift(ov.id, s.id)}
                          />
                        ))
                      )}
                      <button className="btn-link-sm" onClick={() => setAddOverrideShiftId(ov.id)}>
                        <Plus size={13} /> Add shift for this date
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Generate ── */}
          <section className="blueprint-generate">
            <div className="blueprint-section-header">
              <h3 className="blueprint-section-title">Generate Shifts</h3>
            </div>
            <p className="blueprint-section-hint">
              Pick any week — draft shifts are created on the Schedule page using the template, with overridden dates using their custom shifts.
            </p>
            <div className="blueprint-generate-row">
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.375rem', display: 'block' }}>Week starting</label>
                <input className="date-input" type="date" value={weekToGenerate} onChange={handleWeekChange} />
              </div>
              <button className="btn btn-primary" onClick={handleGenerate} disabled={generating || !weekToGenerate}>
                <Zap size={15} />
                {generating ? 'Generating…' : 'Generate Draft Shifts'}
              </button>
            </div>
            {weekToGenerate && (
              <p className="blueprint-week-label">
                Week: {formatWeekRange(new Date(weekToGenerate + 'T00:00:00'))}
              </p>
            )}
            {generateError && <div className="error-message" style={{ marginTop: '0.75rem' }}>{generateError}</div>}
            {generateResult && (
              <div className="blueprint-generate-result">
                <span>
                  Created <strong>{generateResult.created}</strong> draft shift{generateResult.created !== 1 ? 's' : ''}
                  {generateResult.overrideDays > 0 && ` (${generateResult.overrideDays} day${generateResult.overrideDays !== 1 ? 's' : ''} used custom overrides)`}.
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/schedule')}>
                  View in Schedule →
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* Save new preset modal (no presets list shown here — creating one) */}
      {showAddPreset && (
        <ShiftSlotFormModal
          modalTitle="Save Shift Preset"
          onSubmit={async (form) => {
            await api.addBlueprintPreset(blueprint.id, form);
            setShowAddPreset(false);
            refreshRef.current?.();
          }}
          onClose={() => setShowAddPreset(false)}
        />
      )}

      {/* Template day shift modal — shows presets */}
      {addShiftDay !== null && (
        <ShiftSlotFormModal
          modalTitle={`Add Shift — ${DAY_NAMES[addShiftDay]}`}
          presets={presets}
          onSubmit={async (form) => {
            await api.addBlueprintShift(blueprint.id, { ...form, day_of_week: addShiftDay });
            setAddShiftDay(null);
            refreshRef.current?.();
          }}
          onClose={() => setAddShiftDay(null)}
        />
      )}

      {/* Override date modal */}
      {showOverrideModal && (
        <AddOverrideModal
          blueprintId={blueprint.id}
          onClose={() => setShowOverrideModal(false)}
          onAdded={() => { setShowOverrideModal(false); refreshRef.current?.(); }}
        />
      )}

      {/* Override shift modal — shows presets */}
      {addOverrideShiftId && activeOverride && (
        <ShiftSlotFormModal
          modalTitle={`Add Shift — ${activeOverride.label}`}
          presets={presets}
          onSubmit={async (form) => {
            await api.addBlueprintOverrideShift(blueprint.id, addOverrideShiftId, form);
            setAddOverrideShiftId(null);
            refreshRef.current?.();
          }}
          onClose={() => setAddOverrideShiftId(null)}
        />
      )}

      {/* Save current grid as a named weekly template */}
      {showSaveTemplateModal && (
        <SaveTemplateModal
          onSubmit={handleSaveTemplate}
          onClose={() => setShowSaveTemplateModal(false)}
        />
      )}

      {/* Confirm before replacing the current grid with a saved template */}
      {applyTemplateId && (
        <ConfirmModal
          title="Load weekly template"
          message={`Replace the current weekly template grid with "${templates.find(t => t.id === applyTemplateId)?.name}"? This overwrites every day's shifts below and cannot be undone.`}
          confirmLabel="Load template"
          danger
          onConfirm={handleApplyTemplate}
          onCancel={() => setApplyTemplateId(null)}
        />
      )}
    </div>
  );
};

export default Blueprint;
