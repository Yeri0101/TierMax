import { useState, useEffect, useContext, createContext, Component } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Globe, KeyRound, LogOut, Sun, Moon, LayoutDashboard } from 'lucide-react';
import { TierMaxLogo, CyberTerminalGlyph, DualEngineGlyph } from './components/Icons';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Playground from './pages/Playground';
import EngineSettings from './pages/EngineSettings';
import { LanguageProvider, useLanguage } from './i18n';
import { ToastProvider } from './ToastContext';
import { fetchApi } from './api';
import './index.css';

/* ─── Theme Context ─── */
type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'dark',
  toggleTheme: () => {},
});

const useTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/* ─── Error Boundary — prevents blank screen on render crash ─── */
class ErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    componentDidCatch(error: Error, info: any) {
        console.error('[ErrorBoundary] Caught render error:', error, info);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: '1rem',
                    background: 'var(--bg-void)', color: 'var(--text-primary)', padding: '2rem',
                }}>
                    <div style={{ fontSize: '2rem' }}>⚠️</div>
                    <h2 style={{ margin: 0, color: '#ef4444' }}>Error de renderizado</h2>
                    <pre style={{
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 8, padding: '1rem', fontSize: '0.75rem', maxWidth: 600,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#fca5a5',
                    }}>
                        {this.state.error?.message}
                        {'\n\n'}
                        {this.state.error?.stack?.split('\n').slice(0, 6).join('\n')}
                    </pre>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            padding: '0.5rem 1.5rem', background: 'var(--accent-gradient)',
                            border: 'none', borderRadius: 8, color: 'white',
                            fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                        }}
                    >
                        Reintentar
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '0.4rem 1.2rem', background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
                            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem',
                        }}
                    >
                        Recargar página
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}


const Layout = ({ children }: { children: React.ReactNode }) => {
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const isLoggedIn = !!localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const toggleLanguage = () => setLanguage(language === 'en' ? 'es' : 'en');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordLoading(true);
    const username = localStorage.getItem('user') || 'admin';
    try {
      await fetchApi('/auth/credentials', {
        method: 'PUT',
        body: JSON.stringify({ currentUsername: username, currentPassword, newPassword }),
      });
      setPasswordSuccess(t('settings.success'));
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setShowPasswordModal(false), 2000);
    } catch (err: any) {
      setPasswordError(err.message || t('settings.error'));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <>
      <nav className="navbar">
        {/* Brand */}
        <Link to="/" className="navbar-brand">
          <div className="navbar-logo" style={{ background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TierMaxLogo size={30} />
          </div>
          <div>
            <div className="navbar-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              TierMax
              <span style={{
                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.06em',
                background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)',
                color: '#a78bfa', borderRadius: '4px',
                padding: '0.05rem 0.35rem', lineHeight: 1.4,
              }}>v2.5 · Fusion & Anthropic</span>
            </div>
            <div className="navbar-subtitle">Universal AI Gateway · SOAT</div>
          </div>
        </Link>

        {/* Center status chips */}
        {isLoggedIn && (
          <div className="navbar-status flex items-center gap-2">
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.6rem',
              fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: '#22c55e',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', animation: 'pulseGlow 2s infinite' }} />
              LIVE
            </div>
          </div>
        )}

        {/* Right actions */}
        <div className="navbar-right">
          {isLoggedIn && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'var(--surface-card)',
              padding: '0.2rem',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-subtle)',
              marginRight: '0.35rem',
            }}>
              <Link
                to="/"
                className={`btn btn-sm ${location.pathname === '/' || location.pathname.startsWith('/projects') ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.projects')}
              >
                <LayoutDashboard size={13} />
                <span>{t('nav.projects')}</span>
              </Link>
              <Link
                to="/playground"
                className={`btn btn-sm ${location.pathname === '/playground' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.playground')}
              >
                <CyberTerminalGlyph size={13} />
                <span>{t('nav.playground')}</span>
              </Link>
              <Link
                to="/engine"
                className={`btn btn-sm ${location.pathname === '/engine' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.engine')}
              >
                <DualEngineGlyph size={13} />
                <span>{t('nav.engine')}</span>
              </Link>
            </div>
          )}

          <button
            onClick={toggleLanguage}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.7rem', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
          >
            <Globe size={13} /> {language.toUpperCase()}
          </button>

          <button
            onClick={toggleTheme}
            className="btn btn-secondary btn-icon"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s',
                transform: theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(180deg) scale(0)',
                opacity: theme === 'dark' ? 1 : 0,
                position: 'absolute',
              }}
            >
              <Sun size={15} style={{ color: 'var(--brand-amber)' }} />
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s',
                transform: theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(-180deg) scale(0)',
                opacity: theme === 'light' ? 1 : 0,
                position: 'absolute',
              }}
            >
              <Moon size={15} style={{ color: 'var(--text-muted)' }} />
            </span>
          </button>

          {isLoggedIn && (
            <>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="btn btn-secondary btn-icon"
                title={t('nav.change_password')}
              >
                <KeyRound size={15} />
              </button>

              <button
                onClick={handleLogout}
                className="btn btn-danger btn-icon"
                title={t('nav.logout')}
              >
                <LogOut size={15} />
              </button>
            </>
          )}
        </div>
      </nav>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div onClick={() => setShowPasswordModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} className="glass-panel" style={{
            width: '100%', maxWidth: 400, padding: '2rem', border: '1px solid var(--border-accent)',
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: '1.5rem' }}>
              <div className="flex items-center gap-2">
                <KeyRound size={17} style={{ color: 'var(--brand-orange)' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t('settings.password_title')}</h3>
              </div>
              <button onClick={() => setShowPasswordModal(false)} className="btn btn-secondary btn-icon" aria-label="Close modal">✕</button>
            </div>

            {passwordError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{passwordError}</div>}
            {passwordSuccess && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{passwordSuccess}</div>}

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t('settings.current_password')}</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <label>{t('settings.new_password')}</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPasswordModal(false)}>{t('settings.btn_cancel')}</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={passwordLoading}>
                  {passwordLoading ? <><span className="spinner-ring" style={{ width: 14, height: 14, borderWidth: 2 }} /> Updating…</> : t('settings.btn_update')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <Router>
              <Layout>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                  <Route path="/projects/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />
                  <Route path="/playground" element={<PrivateRoute><Playground /></PrivateRoute>} />
                  <Route path="/engine" element={<PrivateRoute><EngineSettings /></PrivateRoute>} />
                </Routes>
              </Layout>
            </Router>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
