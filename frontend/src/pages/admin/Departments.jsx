import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import ConfirmModal from '../../components/ConfirmModal';

const AdminDepartments = () => {
  const refreshRef = useRef(null);

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [formName, setFormName] = useState('');
  const [formLeadId, setFormLeadId] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);

  // The lead-selection dropdown's user list — not fetched at page mount (the
  // grid itself only needs GET /departments, which already carries
  // lead_name/lead_username/member_count), only the first time the New/Edit
  // Department modal is actually opened, then cached here for every
  // subsequent open this session. null means "not fetched yet", as opposed
  // to [] (fetched, empty).
  const [allUsers, setAllUsers] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const ensureUsers = useCallback(() => {
    if (allUsers) return Promise.resolve(allUsers);
    setUsersLoading(true);
    return api.getUsers()
      .then(users => {
        setAllUsers(users);
        return users;
      })
      .finally(() => setUsersLoading(false));
  }, [allUsers]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        setDepartments(await api.getDepartments());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    refreshRef.current = loadAll;
    loadAll();
  }, []);

  const leads = (allUsers || []).filter(u => u.role === 'lead');

  const openCreate = () => {
    setEditingDept(null);
    setFormName('');
    setFormLeadId('');
    setFormError('');
    setShowModal(true);
    ensureUsers().catch(err => setFormError(err.message));
  };

  const openEdit = (dept) => {
    setEditingDept(dept);
    setFormName(dept.name);
    setFormLeadId('');
    setFormError('');
    setShowModal(true);
    ensureUsers()
      .then(users => {
        const existingLead = users.find(u => u.role === 'lead' && u.username === dept.lead_username);
        setFormLeadId(existingLead?.id || '');
      })
      .catch(err => setFormError(err.message));
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
      await api.deleteDepartment(confirmDelete.id, { confirm: true });
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
            <Plus size={16} />
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
              const count = dept.member_count;
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
                      <Pencil size={14} />
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirmDelete(dept)}
                    >
                      <Trash2 size={14} />
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
                <X size={18} />
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
                disabled={usersLoading}
              >
                <option value="">{usersLoading ? 'Loading team leads…' : '— Assign later —'}</option>
                {leads.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} (@{u.username})
                  </option>
                ))}
              </select>
              {!usersLoading && leads.length === 0 && (
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
          message={
            confirmDelete.member_count > 0
              ? `This department has ${confirmDelete.member_count} active member${confirmDelete.member_count !== 1 ? 's' : ''}. Deleting it will unassign ${confirmDelete.member_count !== 1 ? 'them' : 'that member'} from this department — their accounts stay active. Are you sure?`
              : `Delete "${confirmDelete.name}"? This cannot be undone.`
          }
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
