import { useState, useEffect, useRef } from 'react';
import { LuSearch } from 'react-icons/lu';
import { api } from '../../services/api';
import useAuth from '../../hooks/useAuth';
import ConfirmModal from '../../components/ConfirmModal';

const ROLE_LABELS = {
  employee: 'Employee',
  shift_manager: 'Shift Manager',
  lead: 'Team Lead',
  admin: 'Admin',
};

const ROLE_BADGE = {
  employee: 'badge-draft',
  shift_manager: 'badge-accepted',
  lead: 'badge-approved',
  admin: 'badge-published',
};

const ALL_ROLES = ['employee', 'shift_manager', 'lead', 'admin'];

const AdminUsers = () => {
  const { currentUser } = useAuth();
  const refreshRef = useRef(null);

  const [allUsers, setAllUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [users, depts] = await Promise.all([api.getUsers(), api.getDepartments()]);
        setAllUsers(users);
        setDepartments(depts);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    refreshRef.current = loadAll;
    loadAll();
  }, []);

  const filtered = allUsers
    .filter(u => u.id !== currentUser?.id)
    .filter(u => selectedDept === '' || u.department_id === selectedDept)
    .filter(u => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    });

  const getDeptName = (deptId) => departments.find(d => d.id === deptId)?.name ?? '—';

  const openEdit = (user) => {
    setEditingUser(user);
    setNewRole(user.role);
    setNewDeptId(user.department_id || '');
    setModalError('');
  };

  const handleRoleChange = async () => {
    setModalError('');
    setModalLoading(true);
    try {
      const wasLeadOfDept = editingUser.role === 'lead'
        ? departments.find(d => d.lead_username === editingUser.username)
        : null;

      await api.updateUserRole(editingUser.id, {
        role: newRole,
        department_id: newDeptId || null,
      });

      // Unset old department's lead_id if user was a lead and is moving out
      if (wasLeadOfDept && (newRole !== 'lead' || newDeptId !== wasLeadOfDept.id)) {
        await api.updateDepartment(wasLeadOfDept.id, { lead_id: null });
      }

      // Set new department's lead_id if promoting to lead
      if (newRole === 'lead' && newDeptId) {
        await api.updateDepartment(newDeptId, { lead_id: editingUser.id });
      }

      setEditingUser(null);
      refreshRef.current?.();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteUser(confirmDelete.id);
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
            <h2>Users</h2>
            <p className="page-subtitle">
              {allUsers.length} users across {departments.length} departments
            </p>
          </div>
        </div>
      </div>

      <div className="admin-filters">
        <div className="search-wrap">
          <LuSearch size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, username or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="dept-select"
          value={selectedDept}
          onChange={e => setSelectedDept(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading users…</div>
      ) : (
        <div className="team-list">
          {filtered.length === 0 ? (
            <p className="empty-state">No users match the current filter.</p>
          ) : (
            filtered.map(user => (
              <div key={user.id} className="team-card">
                <div className="team-card-left">
                  <div className="team-avatar">
                    {user.avatar_url ? (
                      <img src={`http://localhost:3000${user.avatar_url}`} alt={user.name} />
                    ) : (
                      <span>
                        {user.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div className="team-member-info">
                    <span className="team-member-name">{user.name}</span>
                    <span className="team-member-username">
                      @{user.username}
                      {user.email && <> · {user.email}</>}
                    </span>
                    <span className="team-member-dept">{getDeptName(user.department_id)}</span>
                  </div>
                </div>

                <div className="team-card-right">
                  <span className={`badge ${ROLE_BADGE[user.role]}`}>
                    {ROLE_LABELS[user.role]}
                  </span>

                  {user.role !== 'admin' && (
                    <div className="team-card-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(user)}
                      >
                        Change Role
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmDelete(user)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Change Role</div>
                <div className="modal-subtitle">
                  {editingUser.name} · currently {ROLE_LABELS[editingUser.role]}
                </div>
              </div>
            </div>

            {modalError && <div className="error-message">{modalError}</div>}

            <div className="form-group">
              <label>New Role</label>
              <select
                className="dept-select"
                style={{ width: '100%' }}
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
              >
                {ALL_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Department</label>
              <select
                className="dept-select"
                style={{ width: '100%' }}
                value={newDeptId}
                onChange={e => setNewDeptId(e.target.value)}
              >
                <option value="">— No Department —</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditingUser(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={modalLoading}
                onClick={handleRoleChange}
              >
                {modalLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete User"
          message={`Permanently delete ${confirmDelete.name}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};

export default AdminUsers;
