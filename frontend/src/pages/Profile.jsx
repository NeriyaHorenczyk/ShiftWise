import { useState, useRef } from 'react';
import { Camera, X } from 'lucide-react';
import { api, getAssetUrl } from '../services/api';
import useAuth from '../hooks/useAuth';

const ROLE_LABELS = {
  employee: 'Employee',
  shift_manager: 'Shift Manager',
  lead: 'Team Lead',
  admin: 'Admin',
};

const Profile = () => {
  const { currentUser, updateUser, isLead } = useAuth();

  const fileInputRef = useRef(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);

  // Seeded straight from AuthContext's cached user object (populated at
  // login, see authController.login's department join) instead of fetching
  // GET /departments/:id on mount just to show a name the login response
  // already carried.
  const [deptName, setDeptName] = useState(currentUser?.department || '');
  const [deptSaving, setDeptSaving] = useState(false);
  const [deptError, setDeptError] = useState('');
  const [deptSuccess, setDeptSuccess] = useState('');

  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoSuccess, setInfoSuccess] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const result = await api.uploadAvatar(currentUser.id, formData);
      updateUser({ avatar_url: result.avatar_url });
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarLoading(false);
      e.target.value = '';
    }
  };

  const handleInfoSave = async (e) => {
    e.preventDefault();
    setInfoError('');
    setInfoSuccess('');
    setInfoLoading(true);
    try {
      await api.updateUser(currentUser.id, { name: name.trim(), email: email.trim() });
      updateUser({ name: name.trim(), email: email.trim() });
      setInfoSuccess('Profile updated.');
    } catch (err) {
      setInfoError(err.message);
    } finally {
      setInfoLoading(false);
    }
  };

  const handleDeptSave = async (e) => {
    e.preventDefault();
    setDeptError('');
    setDeptSuccess('');
    setDeptSaving(true);
    try {
      await api.updateDepartment(currentUser.department_id, { name: deptName.trim() });
      // Keep AuthContext's cached copy in sync so it stays correct for the
      // rest of the session without needing a refetch.
      updateUser({ department: deptName.trim() });
      setDeptSuccess('Department name updated.');
    } catch (err) {
      setDeptError(err.message);
    } finally {
      setDeptSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    setPwLoading(true);
    try {
      await api.updateUser(currentUser.id, { password: newPassword, currentPassword });
      setPwSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwLoading(false);
    }
  };

  const initials = currentUser?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Profile</h2>
        <p className="page-subtitle">Manage your account settings</p>
      </div>

      <div className="profile-layout">

        <div className="profile-left">
          {/* Avatar */}
          <div className="profile-card">
            <h3 className="profile-card-title">Avatar</h3>
            <div className="profile-avatar-section">
              <div className="profile-avatar-btn">
                <div
                  className="profile-avatar-lg"
                  onClick={() => {
                    if (avatarLoading) return;
                    currentUser?.avatar_url
                      ? setShowAvatarPreview(true)
                      : fileInputRef.current?.click();
                  }}
                  title={currentUser?.avatar_url ? 'Click to view full size' : 'Click to upload a photo'}
                >
                  {currentUser?.avatar_url ? (
                    <img src={getAssetUrl(currentUser.avatar_url)} alt={currentUser.name} />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="profile-avatar-camera-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Change photo"
                  disabled={avatarLoading}
                >
                  <Camera size={16} />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
              {avatarLoading && <p className="profile-hint">Uploading…</p>}
              {avatarError && <div className="error-message" style={{ marginTop: '0.5rem' }}>{avatarError}</div>}
              {!avatarLoading && !avatarError && (
                <p className="profile-hint">Click to upload a photo.<br />JPEG or PNG, max 5MB.</p>
              )}
            </div>
          </div>

          {/* Account info — read only */}
          <div className="profile-card">
            <h3 className="profile-card-title">Account</h3>
            <div className="profile-info-rows">
              <div className="profile-info-row">
                <span className="profile-info-label">Username</span>
                <span className="profile-info-value">@{currentUser?.username}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Role</span>
                <span className="profile-info-value">{ROLE_LABELS[currentUser?.role]}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Member since</span>
                <span className="profile-info-value">
                  {currentUser?.created_at
                    ? new Date(currentUser.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-right">
          {/* Department name — leads only */}
          {isLead && (
            <div className="profile-card">
              <h3 className="profile-card-title">Department</h3>
              <form onSubmit={handleDeptSave}>
                {deptError && <div className="error-message">{deptError}</div>}
                {deptSuccess && <div className="success-message">{deptSuccess}</div>}
                <div className="form-group">
                  <label>Department Name</label>
                  <input
                    type="text"
                    value={deptName}
                    onChange={e => setDeptName(e.target.value)}
                    disabled={deptSaving}
                    required
                  />
                </div>
                <button type="submit" disabled={deptSaving}>
                  {deptSaving ? 'Saving…' : 'Save Department Name'}
                </button>
              </form>
            </div>
          )}

          {/* Personal info */}
          <div className="profile-card">
            <h3 className="profile-card-title">Personal Info</h3>
            <form onSubmit={handleInfoSave}>
              {infoError && <div className="error-message">{infoError}</div>}
              {infoSuccess && <div className="success-message">{infoSuccess}</div>}
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={infoLoading}>
                {infoLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="profile-card">
            <h3 className="profile-card-title">Change Password</h3>
            <form onSubmit={handlePasswordChange}>
              {pwError && <div className="error-message">{pwError}</div>}
              {pwSuccess && <div className="success-message">{pwSuccess}</div>}
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" disabled={pwLoading}>
                {pwLoading ? 'Changing…' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>

      </div>

      {showAvatarPreview && currentUser?.avatar_url && (
        <div className="avatar-preview-overlay" onClick={() => setShowAvatarPreview(false)}>
          <button
            className="avatar-preview-close"
            onClick={() => setShowAvatarPreview(false)}
            title="Close"
          >
            <X size={22} />
          </button>
          <img
            src={getAssetUrl(currentUser.avatar_url)}
            alt={currentUser.name}
            className="avatar-preview-img"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default Profile;
