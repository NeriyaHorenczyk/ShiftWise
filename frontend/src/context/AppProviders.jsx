import { AuthProvider } from './AuthProvider';
import { ThemeProvider } from './ThemeProvider';

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