import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { api, getAssetUrl } from '../services/api';
import useAuth from '../hooks/useAuth';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 15;

const ROLE_LABELS = {
  employee: 'Employee',
  shift_manager: 'Shift Manager',
  lead: 'Team Lead',
  admin: 'Admin',
};

const ROLE_COLORS = {
  employee: 'badge-draft',
  shift_manager: 'badge-accepted',
  lead: 'badge-approved',
  admin: 'badge-published',
};

const Team = () => {
  const { isAdmin, isLead, currentUser } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const refreshRef = useRef(null);
  // Only the very first fetch shows the full-page loader — a page-turn
  // re-runs the members effect below too, and flipping `loading` back to
  // true for that would unmount this whole tree unnecessarily.
  const hasLoadedOnce = useRef(false);

  // A real department is always a UUID; this sentinel is the one non-UUID
  // value selectedDept can hold, so it can never collide with a real id.
  const UNASSIGNED = 'unassigned';

  // Departments (and the default selectedDept they imply) only need loading
  // once — member pagination is driven by the effect below instead.
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const depts = await api.getDepartments();
        setDepartments(depts);
        // Only pick a default the first time — re-picking on a later call
        // would yank an admin back to the first department mid-cleanup
        // (e.g. right after reassigning someone out of "Unassigned").
        setSelectedDept(prev => {
          if (prev || depts.length === 0) return prev;
          if (isLead && !isAdmin) {
            const myDepartment = depts.find(d => d.lead_username === currentUser.username);
            return myDepartment?.id || depts[0].id;
          }
          return depts[0].id;
        });
      } catch (err) {
        setError(err.message);
      }
    };
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only an admin needs to wait for a department to be picked (or scoped to
  // "Unassigned") — usersController.getAllUsers already resolves a lead's
  // roster server-side from their own user record and ignores whatever
  // department_id is sent, so gating their fetch on `selectedDept` (which
  // only exists for the admin dropdown) would just be an artificial wait for
  // the departments list to resolve first.
  const deptFilter = isAdmin ? selectedDept : null;

  useEffect(() => {
    if (isAdmin && !deptFilter) return;

    let cancelled = false;
    const loadMembers = async () => {
      if (!hasLoadedOnce.current) setLoading(true);
      try {
        const data = await api.getUsers({
          role: 'employee,shift_manager,lead',
          ...(deptFilter ? { department_id: deptFilter } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        if (cancelled) return;
        setMembers(data.items);
        setTotalMembers(data.total);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      }
    };

    refreshRef.current = loadMembers;
    loadMembers();

    return () => { cancelled = true; };
  }, [deptFilter, isAdmin, search, page]);

  const handleConfirmAction = async () => {
    try {
      if (confirmAction.isDelete) {
        await api.deleteUser(confirmAction.userId);
      } else {
        await api.updateUserRole(confirmAction.userId, {
          role: confirmAction.newRole,
          // The "Unassigned" tab is a view filter, not a real department —
          // promoting someone from it must not write that sentinel string
          // into their department_id.
          department_id: selectedDept === UNASSIGNED ? null : selectedDept,
        });
      }
      refreshRef.current?.();
      setConfirmAction(null);
    } catch (err) {
      setError(err.message);
      setConfirmAction(null);
    }
  };

  const handleDepartmentChange = async (member, newDeptId) => {
    setError('');
    setSuccess('');
    try {
      await api.updateUser(member.id, { department_id: newDeptId || null });
      setSuccess(`${member.name}'s department was updated.`);
      setTimeout(() => setSuccess(''), 3000);
      refreshRef.current?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const currentDeptName = selectedDept === UNASSIGNED
    ? 'Unassigned'
    : departments.find(d => d.id === selectedDept)?.name;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Team</h2>
            <p className="page-subtitle">
              {currentDeptName ? `${currentDeptName} — ${totalMembers} members` : 'Loading...'}
            </p>
          </div>

          <div className="admin-filters">
            {isAdmin && (
              <select
                className="dept-select"
                value={selectedDept}
                onChange={e => { setSelectedDept(e.target.value); setPage(0); }}
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
                <option value={UNASSIGNED}>Unassigned</option>
              </select>
            )}
            <div className="search-wrap">
              <Search className="search-icon" size={16} />
              <input
                type="text"
                className="search-input"
                placeholder="Search by name..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
              />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {loading ? (
        <div className="page-loading">Loading team...</div>
      ) : (
        <div className="team-list">
          {members.length === 0 ? (
            <p className="empty-state">
              {search.trim() ? 'No members match your search' : 'No members in this department'}
            </p>
          ) : (
            members.map(member => (
              <div key={member.username} className="team-card">
                <div className="team-card-left">
                  <div className="team-avatar">
                    {member.avatar_url ? (
                      <img src={getAssetUrl(member.avatar_url)} alt={member.name} />
                    ) : (
                      <span>
                        {member.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div className="team-member-info">
                    <span className="team-member-name">{member.name}</span>
                    <span className="team-member-username">@{member.username}</span>
                  </div>
                </div>

                <div className="team-card-right">
                  <span className={`badge ${ROLE_COLORS[member.role]}`}>
                    {ROLE_LABELS[member.role]}
                  </span>

                  {isAdmin && (
                    <select
                      className="dept-select dept-select-sm"
                      value={member.department_id || ''}
                      title="Assign or transfer department"
                      onChange={e => handleDepartmentChange(member, e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  )}

                  <div className="team-card-actions">
                    {member.role === 'employee' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmAction({
                          label: 'Promote to Shift Manager',
                          newRole: 'shift_manager',
                          confirmMsg: `Promote ${member.name} to Shift Manager?`,
                          userId: member.id,
                        })}
                      >
                        Promote to SM
                      </button>
                    )}

                    {member.role === 'shift_manager' && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmAction({
                            label: 'Demote to Employee',
                            newRole: 'employee',
                            confirmMsg: `Demote ${member.name} to Employee?`,
                            danger: true,
                            userId: member.id,
                          })}
                        >
                          Demote
                        </button>
                        {isAdmin && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setConfirmAction({
                              label: 'Promote to Team Lead',
                              newRole: 'lead',
                              confirmMsg: `Promote ${member.name} to Team Lead? They will manage this department's schedule.`,
                              userId: member.id,
                            })}
                          >
                            Promote to Lead
                          </button>
                        )}
                      </>
                    )}

                    {member.role === 'lead' && isAdmin && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmAction({
                          label: 'Demote to Shift Manager',
                          newRole: 'shift_manager',
                          confirmMsg: `Demote ${member.name} from Team Lead to Shift Manager?`,
                          danger: true,
                          userId: member.id,
                        })}
                      >
                        Demote to SM
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmAction({
                          label: 'Delete user',
                          confirmMsg: `Permanently delete ${member.name}? This cannot be undone.`,
                          danger: true,
                          userId: member.id,
                          isDelete: true,
                        })}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={totalMembers} onPageChange={setPage} />

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.label}
          message={confirmAction.confirmMsg}
          confirmLabel="Confirm"
          danger={confirmAction.danger}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
};

export default Team;