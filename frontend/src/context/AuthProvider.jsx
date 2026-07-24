import { useState } from 'react';
import { AuthContext } from './AuthContext';
import { clearApiCache } from '../services/api';
import { isTokenExpired } from '../utils/jwt';

// A token left over from a previous session that's already expired by the
// time the app loads is worthless — treat it exactly like no session at all
// rather than briefly reporting a logged-in user with no valid credentials.
const readStoredToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  if (!isTokenExpired(token)) return token;

  localStorage.removeItem('token');
  localStorage.removeItem('user');
  return null;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    if (!readStoredToken()) return null;
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(readStoredToken);

  const login = (userData, userToken) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', userToken);
    setCurrentUser(userData);
    setToken(userToken);
  };

  const updateUser = (fields) => {
    const updated = { ...currentUser, ...fields };
    localStorage.setItem('user', JSON.stringify(updated));
    setCurrentUser(updated);
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    sessionStorage.clear();
    clearApiCache();
    setCurrentUser(null);
    setToken(null);
  };

  const isAdmin = currentUser?.role === 'admin';
  const isLead = currentUser?.role === 'lead';
  const isShiftManager = currentUser?.role === 'shift_manager';
  const isEmployee = currentUser?.role === 'employee';

  return (
    <AuthContext.Provider value={{
      currentUser,
      token,
      login,
      logout,
      updateUser,
      isAdmin,
      isLead,
      isShiftManager,
      isEmployee,
    }}>
      {children}
    </AuthContext.Provider>
  );
};