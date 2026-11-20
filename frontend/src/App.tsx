import { useEffect } from 'react';
import { useUIStore, useAuthStore } from './store';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';

function App() {
  const currentView = useUIStore((state) => state.currentView);
  const setView = useUIStore((state) => state.setView);
  const setAuthModal = useUIStore((state) => state.setAuthModal);

  const user = useAuthStore((state) => state.user);
  const authChecked = useAuthStore((state) => state.authChecked);
  const initialize = useAuthStore((state) => state.initialize);

  // Restore auth state from HttpOnly cookie on first mount
  useEffect(() => {
    initialize();

    const handleAuthError = () => {
      useAuthStore.getState().logout();
      setView('landing');
      setAuthModal(true, 'login');
    };

    window.addEventListener('auth-error', handleAuthError);
    return () => window.removeEventListener('auth-error', handleAuthError);
  }, [initialize, setView, setAuthModal]);

  // If user is already authenticated on initial load, route directly to dashboard
  useEffect(() => {
    if (authChecked && user && currentView === 'landing') {
      setView('dashboard');
    }
  }, [authChecked, user, currentView, setView]);

  // Route guard: redirect unauthenticated users away from dashboard once auth check is complete
  useEffect(() => {
    if (!authChecked) return;

    if (currentView === 'dashboard' && !user) {
      setView('landing');
      setAuthModal(true, 'login');
    }
  }, [currentView, user, authChecked, setView, setAuthModal]);

  return (
    <div className="min-h-screen bg-[#0b0f19]">
      {currentView === 'landing' ? <LandingPage /> : <Dashboard />}
      <AuthModal />
    </div>
  );
}

export default App;
