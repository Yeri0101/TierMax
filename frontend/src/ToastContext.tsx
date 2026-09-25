import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Safe fallback so calls don't crash if rendered outside provider
        return {
            showToast: (m: string) => console.log('[Toast]', m),
            success: (m: string) => console.log('[Toast:success]', m),
            error: (m: string) => console.error('[Toast:error]', m),
            info: (m: string) => console.info('[Toast:info]', m),
            warning: (m: string) => console.warn('[Toast:warning]', m),
        };
    }
    return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => removeToast(id), 4000);
    }, [removeToast]);

    const success = useCallback((msg: string) => showToast(msg, 'success'), [showToast]);
    const error = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
    const info = useCallback((msg: string) => showToast(msg, 'info'), [showToast]);
    const warning = useCallback((msg: string) => showToast(msg, 'warning'), [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
            {children}
            {/* Toast Container */}
            <div
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    right: '1.5rem',
                    zIndex: 99999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                    maxWidth: 420,
                    width: 'calc(100vw - 3rem)',
                    pointerEvents: 'none',
                }}
            >
                {toasts.map(toast => {
                    const isSuccess = toast.type === 'success';
                    const isError = toast.type === 'error';
                    const isWarning = toast.type === 'warning';

                    const borderColor = isSuccess
                        ? 'rgba(34, 197, 94, 0.4)'
                        : isError
                        ? 'rgba(239, 68, 68, 0.45)'
                        : isWarning
                        ? 'rgba(245, 158, 11, 0.45)'
                        : 'rgba(255, 107, 43, 0.35)';

                    const bgGlow = isSuccess
                        ? 'rgba(34, 197, 94, 0.12)'
                        : isError
                        ? 'rgba(239, 68, 68, 0.14)'
                        : isWarning
                        ? 'rgba(245, 158, 11, 0.14)'
                        : 'rgba(255, 107, 43, 0.12)';

                    const iconColor = isSuccess
                        ? '#22c55e'
                        : isError
                        ? '#ef4444'
                        : isWarning
                        ? '#f59e0b'
                        : 'var(--brand-orange, #ff6b2b)';

                    return (
                        <div
                            key={toast.id}
                            style={{
                                pointerEvents: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.85rem 1.1rem',
                                borderRadius: 'var(--radius-lg, 12px)',
                                background: 'var(--surface-card, rgba(26, 22, 19, 0.95))',
                                backdropFilter: 'blur(16px)',
                                border: `1px solid ${borderColor}`,
                                boxShadow: `0 8px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px ${bgGlow}`,
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                animation: 'slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                        >
                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                {isSuccess && <CheckCircle2 size={18} style={{ color: iconColor }} />}
                                {isError && <AlertCircle size={18} style={{ color: iconColor }} />}
                                {isWarning && <AlertCircle size={18} style={{ color: iconColor }} />}
                                {!isSuccess && !isError && !isWarning && <Info size={18} style={{ color: iconColor }} />}
                            </div>
                            <div style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.4 }}>
                                {toast.message}
                            </div>
                            <button
                                onClick={() => removeToast(toast.id)}
                                aria-label="Close notification"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '0.2rem',
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
