import { createContext, useState } from 'react';
import { clearApiCache } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const login = (userData, userToken) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', userToken);
    setCurrentUser(userData);
    setToken(userToken);
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
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
      isAdmin,
      isLead,
      isShiftManager,
      isEmployee,
    }}>
      {children}
    </AuthContext.Provider>
  );
};