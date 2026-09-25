import { useState, Component } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Sun, Moon, LayoutDashboard, ShieldCheck, Globe, Settings as SettingsIcon, BarChart3 } from 'lucide-react';
import { TierMaxLogo, CyberTerminalGlyph, DualEngineGlyph } from './components/Icons';
import { WelcomeServerModal } from './components/WelcomeServerModal';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Playground from './pages/Playground';
import EngineSettings from './pages/EngineSettings';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import GlobalAnalytics from './pages/GlobalAnalytics';
import { LanguageProvider, useLanguage } from './i18n';
import { ThemeProvider, useTheme } from './ThemeContext';
import { ToastProvider } from './ToastContext';
import './index.css';

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
  const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(() => {
    return localStorage.getItem('tiermax_hide_welcome') !== 'true';
  });
  const isLoggedIn = !!localStorage.getItem('token');

  const toggleLanguage = () => setLanguage(language === 'en' ? 'es' : 'en');

  return (
    <>
      <nav className="navbar">
        {/* Left: Brand + Status chips (LIVE, Supabase/SQLite, TenantSwitcher) */}
        <div className="navbar-left">
          <Link to="/" className="navbar-brand">
            <div className="navbar-logo" style={{ background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TierMaxLogo size={30} />
            </div>
            <div>
              <div className="navbar-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                TierMax
                <span className="navbar-version-badge">v2.5 · Fusion & Anthropic</span>
              </div>
              <div className="navbar-subtitle">Universal AI Gateway · SOAT</div>
            </div>
          </Link>

          {/* Left-aligned subtle LIVE pulse */}
          {isLoggedIn && (
            <div className="navbar-live-chip" title="Gateway Engine Online">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', animation: 'pulseGlow 2s infinite' }} />
              LIVE
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="navbar-right">
          {isLoggedIn && (
            <div className="navbar-nav-links">
              <Link
                to="/"
                className={`btn btn-sm ${location.pathname === '/' || location.pathname.startsWith('/projects') ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.projects')}
              >
                <LayoutDashboard size={13} />
                <span className="nav-link-text">{t('nav.projects')}</span>
              </Link>
              <Link
                to="/analytics"
                className={`btn btn-sm ${location.pathname === '/analytics' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.analytics')}
              >
                <BarChart3 size={13} />
                <span className="nav-link-text">{t('nav.analytics')}</span>
              </Link>
              <Link
                to="/playground"
                className={`btn btn-sm ${location.pathname === '/playground' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.playground')}
              >
                <CyberTerminalGlyph size={13} />
                <span className="nav-link-text">{t('nav.playground')}</span>
              </Link>
              <Link
                to="/engine"
                className={`btn btn-sm ${location.pathname === '/engine' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.engine')}
              >
                <DualEngineGlyph size={13} />
                <span className="nav-link-text">{t('nav.engine')}</span>
              </Link>
              <Link
                to="/audit"
                className={`btn btn-sm ${location.pathname === '/audit' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.audit')}
              >
                <ShieldCheck size={13} />
                <span className="nav-link-text">{t('nav.audit')}</span>
              </Link>
              <Link
                to="/settings"
                className={`btn btn-sm ${location.pathname === '/settings' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-pill)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title={t('nav.settings')}
              >
                <SettingsIcon size={13} />
                <span className="nav-link-text">{t('nav.settings')}</span>
              </Link>
            </div>
          )}

          {/* Quick theme toggle */}
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

          {/* Quick language toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="btn btn-secondary"
            title={language === 'en' ? 'Cambiar a Español' : 'Switch to English'}
            style={{
              height: 32,
              padding: '0 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.74rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              letterSpacing: '0.04em'
            }}
          >
            <Globe size={13} style={{ color: 'var(--text-secondary)' }} />
            <span>{language.toUpperCase()}</span>
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>

      {/* Welcome & Startup Guide Modal */}
      <WelcomeServerModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
      />
    </>
  );
};

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  let token = localStorage.getItem('token');
  if (!token) {
    localStorage.setItem('token', 'mock-admin-token-123');
    localStorage.setItem('user', 'admin');
    token = 'mock-admin-token-123';
  }
  return children;
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
                  <Route path="/analytics" element={<PrivateRoute><GlobalAnalytics /></PrivateRoute>} />
                  <Route path="/playground" element={<PrivateRoute><Playground /></PrivateRoute>} />
                  <Route path="/engine" element={<PrivateRoute><EngineSettings /></PrivateRoute>} />
                  <Route path="/audit" element={<PrivateRoute><AuditLogs /></PrivateRoute>} />
                  <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
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
