import { useState, useEffect, useRef } from 'react';
import { LuPlus, LuPencil, LuTrash2, LuX } from 'react-icons/lu';
import { api } from '../../services/api';
import ConfirmModal from '../../components/ConfirmModal';

const AdminDepartments = () => {
  const refreshRef = useRef(null);

  const [departments, setDepartments] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [formName, setFormName] = useState('');
  const [formLeadId, setFormLeadId] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [depts, users] = await Promise.all([api.getDepartments(), api.getUsers()]);
        setDepartments(depts);
        setAllUsers(users);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    refreshRef.current = loadAll;
    loadAll();
  }, []);

  const memberCount = (deptId) => allUsers.filter(u => u.department_id === deptId).length;
  const leads = allUsers.filter(u => u.role === 'lead');

  const openCreate = () => {
    setEditingDept(null);
    setFormName('');
    setFormLeadId('');
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (dept) => {
    setEditingDept(dept);
    setFormName(dept.name);
    const existingLead = leads.find(u => u.username === dept.lead_username);
    setFormLeadId(existingLead?.id || '');
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingDept(null);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      setFormError('Department name is required.');
      return;
    }
    setFormError('');
    setFormLoading(true);
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept.id, {
          name: formName.trim(),
          lead_id: formLeadId || null,
        });
        // Keep lead's department_id in sync when assigning them to this dept
        if (formLeadId) {
          await api.updateUserRole(formLeadId, { role: 'lead', department_id: editingDept.id });
        }
      } else {
        const result = await api.createDepartment({
          name: formName.trim(),
          lead_id: formLeadId || null,
        });
        // Sync lead's department_id to the newly created dept
        if (formLeadId && result.id) {
          await api.updateUserRole(formLeadId, { role: 'lead', department_id: result.id });
        }
      }
      closeModal();
      refreshRef.current?.();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteDepartment(confirmDelete.id);
      setConfirmDelete(null);
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Departments</h2>
            <p className="page-subtitle">{departments.length} departments</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <LuPlus size={16} />
            New Department
          </button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading departments…</div>
      ) : (
        <div className="dept-list">
          {departments.length === 0 ? (
            <p className="empty-state">No departments yet. Create the first one.</p>
          ) : (
            departments.map(dept => {
              const count = memberCount(dept.id);
              return (
                <div key={dept.id} className="dept-card">
                  <div className="dept-card-info">
                    <span className="dept-card-name">{dept.name}</span>
                    <span className="dept-card-meta">
                      {dept.lead_name ? (
                        <>Lead: <strong>{dept.lead_name}</strong> (@{dept.lead_username})</>
                      ) : (
                        <span className="dept-no-lead">No lead assigned</span>
                      )}
                      &nbsp;&nbsp;·&nbsp;&nbsp;
                      {count} member{count !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="team-card-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(dept)}
                    >
                      <LuPencil size={14} />
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirmDelete(dept)}
                      disabled={count > 0}
                      title={count > 0 ? 'Move all members out before deleting' : undefined}
                    >
                      <LuTrash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {editingDept ? `Edit — ${editingDept.name}` : 'New Department'}
              </div>
              <button className="modal-close" onClick={closeModal}>
                <LuX size={18} />
              </button>
            </div>

            {formError && <div className="error-message">{formError}</div>}

            <div className="form-group">
              <label>Department Name</label>
              <input
                type="text"
                placeholder="e.g. Operations"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Team Lead</label>
              <select
                className="dept-select"
                style={{ width: '100%' }}
                value={formLeadId}
                onChange={e => setFormLeadId(e.target.value)}
              >
                <option value="">— Assign later —</option>
                {leads.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} (@{u.username})
                  </option>
                ))}
              </select>
              {leads.length === 0 && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.375rem' }}>
                  No users with role "lead" exist yet. Promote someone on the Users page first.
                </p>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={formLoading}
                onClick={handleSubmit}
              >
                {formLoading ? 'Saving…' : editingDept ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Department"
          message={`Delete "${confirmDelete.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};

export default AdminDepartments;
