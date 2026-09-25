import React, { useState, useEffect } from 'react';
import { 
    Sliders, 
    Globe, 
    Sun, 
    Moon, 
    KeyRound, 
    LogOut, 
    Server, 
    Database, 
    User, 
    Check, 
    Layers, 
    Copy, 
    Terminal
} from 'lucide-react';
import { useLanguage } from '../i18n';
import { useTheme } from '../ThemeContext';
import { useToast } from '../ToastContext';
import { fetchApi } from '../api';
import { TenantSwitcher } from '../components/aaa/TenantSwitcher';
import { WelcomeServerModal } from '../components/WelcomeServerModal';

export default function Settings() {
    const { t, language, setLanguage } = useLanguage();
    const { theme, setTheme } = useTheme();
    const toast = useToast();

    const [dbMode, setDbMode] = useState<{ is_local: boolean; db_type: string } | null>(null);
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

    // Password form state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    const username = localStorage.getItem('user') || 'Admin';

    useEffect(() => {
        fetchApi('/system/info')
            .then(data => setDbMode(data))
            .catch(() => {});
    }, []);

    const handleCopy = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedSnippet(id);
            setTimeout(() => setCopiedSnippet(null), 2200);
            toast.success(language === 'en' ? 'Command copied to clipboard' : 'Comando copiado al portapapeles');
        } catch (_) {}
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (newPassword !== confirmPassword) {
            setPasswordError(language === 'en' ? 'New passwords do not match' : 'Las nuevas contraseñas no coinciden');
            return;
        }

        if (newPassword.length < 4) {
            setPasswordError(language === 'en' ? 'Password must be at least 4 characters' : 'La contraseña debe tener al menos 4 caracteres');
            return;
        }

        setPasswordLoading(true);
        try {
            await fetchApi('/auth/credentials', {
                method: 'PUT',
                body: JSON.stringify({
                    currentUsername: username,
                    currentPassword,
                    newPassword
                }),
            });
            setPasswordSuccess(t('settings.success') || '¡Contraseña actualizada con éxito!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            toast.success(t('settings.success') || 'Password updated successfully');
        } catch (err: any) {
            setPasswordError(err.message || t('settings.error') || 'Error al actualizar la contraseña');
            toast.error(err.message || t('settings.error'));
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Top Page Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '1.25rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '12px',
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--brand-orange, #f97316)',
                        boxShadow: 'var(--shadow-sm)'
                    }}>
                        <Sliders size={22} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                            {t('nav.settings_menu') || 'Sistema y Preferencias'}
                        </h1>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            TierMax SOAT Gateway • {language === 'en' ? 'Global environment, server daemons, appearance and credentials' : 'Entorno global, demonios de servidor, apariencia y credenciales'}
                        </p>
                    </div>
                </div>

                {/* System Status Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        padding: '0.35rem 0.8rem',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)'
                    }}>
                        <User size={13} style={{ color: 'var(--text-secondary)' }} />
                        <span>{username}</span>
                    </div>

                    {dbMode && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.35rem 0.8rem',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--surface-card)',
                            border: '1px solid var(--border-subtle)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)'
                        }}>
                            <Database size={13} style={{ color: '#22c55e' }} />
                            <span>{dbMode.is_local ? 'SQLite Local' : 'Supabase Cloud'}</span>
                        </div>
                    )}

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.75rem',
                        borderRadius: 'var(--radius-pill)',
                        background: 'rgba(34, 197, 94, 0.12)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        color: '#22c55e',
                        fontSize: '0.75rem',
                        fontWeight: 700
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                        <span>ONLINE</span>
                    </div>
                </div>
            </div>

            {/* Main Settings Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '1.25rem'
            }}>
                {/* Card 1: Workspace & Multi-Tenant */}
                <div style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '14px',
                    padding: '1.35rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: 'var(--shadow-card)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            background: 'var(--surface-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-primary)'
                        }}>
                            <Layers size={17} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                {t('nav.org_env') || 'Organización & Entorno'}
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {language === 'en' ? 'Active workspace and tenant isolation' : 'Espacio de trabajo e inquilino activo'}
                            </p>
                        </div>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                        {language === 'en'
                            ? 'Switch the active multi-tenant workspace to isolate upstream provider keys, gateway keys, telemetry, and budget limits.'
                            : 'Cambia el espacio de trabajo multi-tenant activo para aislar proveedores upstream, llaves de gateway, telemetría y presupuestos.'}
                    </p>

                    <div style={{
                        background: 'var(--surface-2)',
                        padding: '1rem',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {language === 'en' ? 'Current Organization:' : 'Organización actual:'}
                        </span>
                        <TenantSwitcher />
                    </div>
                </div>

                {/* Card 2: Interface Preferences (Language & Theme) */}
                <div style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '14px',
                    padding: '1.35rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: 'var(--shadow-card)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            background: 'var(--surface-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-primary)'
                        }}>
                            <Globe size={17} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                {t('nav.preferences') || 'Preferencias de Interfaz'}
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {language === 'en' ? 'Console language and appearance' : 'Idioma de la consola y apariencia'}
                            </p>
                        </div>
                    </div>

                    {/* Language Selector */}
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                            {t('nav.language') || 'Idioma del Sistema'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            <button
                                type="button"
                                onClick={() => setLanguage('en')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    border: `1.5px solid ${language === 'en' ? 'var(--brand-orange, #f97316)' : 'var(--border-subtle)'}`,
                                    background: language === 'en' ? 'rgba(249, 115, 22, 0.1)' : 'var(--surface-2)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.82rem',
                                    fontWeight: language === 'en' ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>English (US)</span>
                                {language === 'en' && <Check size={14} style={{ color: 'var(--brand-orange, #f97316)' }} />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setLanguage('es')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    border: `1.5px solid ${language === 'es' ? 'var(--brand-orange, #f97316)' : 'var(--border-subtle)'}`,
                                    background: language === 'es' ? 'rgba(249, 115, 22, 0.1)' : 'var(--surface-2)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.82rem',
                                    fontWeight: language === 'es' ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>Español (ES)</span>
                                {language === 'es' && <Check size={14} style={{ color: 'var(--brand-orange, #f97316)' }} />}
                            </button>
                        </div>
                    </div>

                    {/* Theme Selector */}
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                            {t('nav.theme') || 'Tema de Interfaz'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            <button
                                type="button"
                                onClick={() => setTheme('dark')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    border: `1.5px solid ${theme === 'dark' ? 'var(--brand-orange, #f97316)' : 'var(--border-subtle)'}`,
                                    background: theme === 'dark' ? 'rgba(249, 115, 22, 0.1)' : 'var(--surface-2)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.82rem',
                                    fontWeight: theme === 'dark' ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Moon size={14} style={{ color: 'var(--text-secondary)' }} />
                                <span>{t('nav.theme_dark') || 'Modo Oscuro'}</span>
                                {theme === 'dark' && <Check size={14} style={{ color: 'var(--brand-orange, #f97316)' }} />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setTheme('light')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    border: `1.5px solid ${theme === 'light' ? 'var(--brand-orange, #f97316)' : 'var(--border-subtle)'}`,
                                    background: theme === 'light' ? 'rgba(249, 115, 22, 0.1)' : 'var(--surface-2)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.82rem',
                                    fontWeight: theme === 'light' ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Sun size={14} style={{ color: 'var(--brand-amber, #eab308)' }} />
                                <span>{t('nav.theme_light') || 'Modo Claro'}</span>
                                {theme === 'light' && <Check size={14} style={{ color: 'var(--brand-orange, #f97316)' }} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Card 3: Server & Daemons Guide */}
                <div style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '14px',
                    padding: '1.35rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: 'var(--shadow-card)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: '8px',
                                background: 'var(--surface-2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-primary)'
                            }}>
                                <Server size={17} />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                    {t('nav.server_guide') || 'Servidor & Demonios'}
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {language === 'en' ? 'Background services & runtime commands' : 'Servicios en segundo plano y comandos de ejecución'}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowWelcomeModal(true)}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                            <Terminal size={12} />
                            <span>{language === 'en' ? 'Full Guide' : 'Guía Completa'}</span>
                        </button>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                        {language === 'en'
                            ? 'Run background daemon processes using PM2, standard NPM, or Docker Compose in production.'
                            : 'Ejecuta procesos demonio en segundo plano usando PM2, NPM estándar o Docker Compose en producción.'}
                    </p>

                    {/* Quick Command Snippets */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                            { id: 'npm_all', label: language === 'en' ? 'Dev (Frontend + Backend):' : 'Desarrollo conjunto:', cmd: 'npm run dev:all' },
                            { id: 'pm2_start', label: language === 'en' ? 'PM2 Daemons (Background):' : 'Demonios PM2 (Background):', cmd: 'pm2 start ecosystem.config.js' },
                            { id: 'docker_up', label: language === 'en' ? 'Docker Production:' : 'Docker Producción:', cmd: 'docker compose up -d' },
                        ].map(item => (
                            <div
                                key={item.id}
                                style={{
                                    background: 'var(--surface-2)',
                                    borderRadius: '8px',
                                    padding: '0.5rem 0.75rem',
                                    border: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.5rem'
                                }}
                            >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.1rem' }}>
                                        {item.label}
                                    </div>
                                    <code style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                        {item.cmd}
                                    </code>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(item.cmd, item.id)}
                                    className="btn btn-secondary btn-icon"
                                    style={{ height: 26, width: 26, padding: 0 }}
                                    title={language === 'en' ? 'Copy command' : 'Copiar comando'}
                                >
                                    {copiedSnippet === item.id ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Card 4: Account & Security (Change Password) */}
                <div style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '14px',
                    padding: '1.35rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: 'var(--shadow-card)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            background: 'var(--surface-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-primary)'
                        }}>
                            <KeyRound size={17} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                {t('nav.account_security') || 'Cuenta & Seguridad'}
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {language === 'en' ? 'Update administrator credentials' : 'Actualizar credenciales de administrador'}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {passwordError && (
                            <div className="alert alert-error" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                                {passwordError}
                            </div>
                        )}
                        {passwordSuccess && (
                            <div className="alert alert-success" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                                {passwordSuccess}
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                {t('settings.current_password') || 'Contraseña Actual'}
                            </label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.55rem 0.75rem',
                                    borderRadius: '8px',
                                    background: 'var(--surface-2)',
                                    border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                    {t('settings.new_password') || 'Nueva Contraseña'}
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.55rem 0.75rem',
                                        borderRadius: '8px',
                                        background: 'var(--surface-2)',
                                        border: '1px solid var(--border-subtle)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                    {language === 'en' ? 'Confirm Password' : 'Confirmar Contraseña'}
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.55rem 0.75rem',
                                        borderRadius: '8px',
                                        background: 'var(--surface-2)',
                                        border: '1px solid var(--border-subtle)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={passwordLoading}
                            style={{
                                marginTop: '0.25rem',
                                padding: '0.6rem',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.45rem'
                            }}
                        >
                            {passwordLoading ? (
                                <>
                                    <span className="spinner-ring" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                    <span>{language === 'en' ? 'Updating...' : 'Actualizando...'}</span>
                                </>
                            ) : (
                                <>
                                    <Check size={14} />
                                    <span>{t('settings.btn_update') || 'Actualizar Contraseña'}</span>
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>

            {/* Session & Sign Out Section */}
            <div style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '14px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                boxShadow: 'var(--shadow-card)'
            }}>
                <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {language === 'en' ? 'Session Management' : 'Gestión de Sesión'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {language === 'en'
                            ? 'Close the current browser administrative session safely.'
                            : 'Cierra de forma segura la sesión administrativa en este navegador.'}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.55rem 1.1rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--status-error, #ef4444)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    }}
                >
                    <LogOut size={15} />
                    <span>{t('nav.logout') || 'Cerrar Sesión'}</span>
                </button>
            </div>

            {/* Interactive Server Startup Modal */}
            <WelcomeServerModal
                isOpen={showWelcomeModal}
                onClose={() => setShowWelcomeModal(false)}
            />
        </div>
    );
}
