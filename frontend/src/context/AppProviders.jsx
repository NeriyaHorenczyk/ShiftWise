import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';

const AppProviders = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
};

export default AppProviders;