import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import useAuth from '../hooks/useAuth';
import ConfirmModal from '../components/ConfirmModal';

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
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const refreshRef = useRef(null);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [depts, users] = await Promise.all([
          api.getDepartments(),
          api.getUsers(),
        ]);
        setDepartments(depts);
        setAllUsers(users.filter(u => u.role !== 'admin'));
        if (depts.length > 0) {
          if (isLead && !isAdmin) {
            const myDepartment = depts.find(d => d.lead_username === currentUser.username);
            setSelectedDept(myDepartment?.id || depts[0].id);
          } else {
            setSelectedDept(depts[0].id);
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    refreshRef.current = loadAll;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const members = allUsers.filter(u => u.department_id === selectedDept);

  const handleConfirmAction = async () => {
    try {
      if (confirmAction.isDelete) {
        await api.deleteUser(confirmAction.userId);
      } else {
        await api.updateUserRole(confirmAction.userId, {
          role: confirmAction.newRole,
          department_id: selectedDept,
        });
      }
      refreshRef.current?.();
      setConfirmAction(null);
    } catch (err) {
      setError(err.message);
      setConfirmAction(null);
    }
  };

  const currentDept = departments.find(d => d.id === selectedDept);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Team</h2>
            <p className="page-subtitle">
              {currentDept ? `${currentDept.name} — ${members.length} members` : 'Loading...'}
            </p>
          </div>

          {isAdmin && departments.length > 1 && (
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
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading team...</div>
      ) : (
        <div className="team-list">
          {members.length === 0 ? (
            <p className="empty-state">No members in this department</p>
          ) : (
            members.map(member => (
              <div key={member.username} className="team-card">
                <div className="team-card-left">
                  <div className="team-avatar">
                    {member.avatar_url ? (
                      <img src={`http://localhost:3000${member.avatar_url}`} alt={member.name} />
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