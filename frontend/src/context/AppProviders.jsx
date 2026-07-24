import { AuthProvider } from './AuthProvider';
import { ThemeProvider } from './ThemeProvider';
import { SocketProvider } from './SocketProvider';

const AppProviders = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* Needs the token from AuthProvider, so it must be nested inside it */}
        <SocketProvider>
          {children}
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default AppProviders;