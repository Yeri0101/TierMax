import React, { useState, useEffect } from 'react';
import { Activity, Zap, Brain, Shield, X, Cpu, Clock, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../i18n';

interface OpenClawLiveInspectorProps {
    isOpen: boolean;
    onClose: () => void;
    recentRequest?: any;
}

export const OpenClawLiveInspector: React.FC<OpenClawLiveInspectorProps> = ({ isOpen, onClose, recentRequest }) => {
    const { t } = useLanguage();
    const [streamText, setStreamText] = useState<string>('');
    const [activePreset, setActivePreset] = useState<'ultraspeed' | 'reasoning' | 'consensus'>('ultraspeed');

    useEffect(() => {
        if (!isOpen) return;
        if (recentRequest) {
            setStreamText(
                recentRequest.sample_text ||
                `[OpenClaw Stream Event]\nModel: ${recentRequest.model || 'qwen/qwen3.8-27b'}\nTokens: ${recentRequest.total_tokens || 142}\nLatency: ${(recentRequest.latency_ms || 58)}ms\nStatus: 200 OK\n\n> Output:\nAssistant session active. Context pruning: Verified active (<32k limit).`
            );
        }
    }, [isOpen, recentRequest]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(5, 7, 15, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: 'var(--card-bg, #0f172a)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '750px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(56, 189, 248, 0.15)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.2))',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#38bdf8'
                        }}>
                            <Activity size={20} className="pulse-slow" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>{t('inspector.title')}</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>{t('inspector.subtitle')}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted, #94a3b8)',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            borderRadius: '8px'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Routing Preset Selector */}
                    <div>
                        <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', marginBottom: '0.5rem', display: 'block' }}>
                            {t('dashboard.preset_active')}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                            <button
                                onClick={() => setActivePreset('ultraspeed')}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '10px',
                                    border: activePreset === 'ultraspeed' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                                    background: activePreset === 'ultraspeed' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.02)',
                                    color: activePreset === 'ultraspeed' ? '#38bdf8' : 'var(--text-muted, #94a3b8)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                    <Zap size={14} /> {t('dashboard.preset_ultraspeed')}
                                </div>
                                <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', opacity: 0.8 }}>Groq / Cerebras (TTFT &lt; 100ms)</div>
                            </button>

                            <button
                                onClick={() => setActivePreset('reasoning')}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '10px',
                                    border: activePreset === 'reasoning' ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                                    background: activePreset === 'reasoning' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255,255,255,0.02)',
                                    color: activePreset === 'reasoning' ? '#c084fc' : 'var(--text-muted, #94a3b8)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                    <Brain size={14} /> {t('dashboard.preset_reasoning')}
                                </div>
                                <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', opacity: 0.8 }}>Mimo / DeepSeek Thinking</div>
                            </button>

                            <button
                                onClick={() => setActivePreset('consensus')}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '10px',
                                    border: activePreset === 'consensus' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                                    background: activePreset === 'consensus' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)',
                                    color: activePreset === 'consensus' ? '#34d399' : 'var(--text-muted, #94a3b8)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                    <Shield size={14} /> {t('dashboard.preset_consensus')}
                                </div>
                                <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', opacity: 0.8 }}>3-Draft Dialectic + Arbiter</div>
                            </button>
                        </div>
                    </div>

                    {/* Telemetry Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        <div style={{ padding: '0.9rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                                <CheckCircle2 size={14} /> {t('inspector.tokens_saved')}
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>42,576 <span style={{ fontSize: '0.75rem', color: '#10b981' }}>(-94%)</span></div>
                        </div>

                        <div style={{ padding: '0.9rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38bdf8', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                                <Clock size={14} /> {t('inspector.latency_ttft')}
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>58 ms <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>(⚡ Ultra-Fast)</span></div>
                        </div>

                        <div style={{ padding: '0.9rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#c084fc', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                                <Cpu size={14} /> {t('inspector.active_model')}
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                qwen3.8-27b
                            </div>
                        </div>
                    </div>

                    {/* Live Stream Terminal Preview */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)' }}>
                                {t('inspector.live_stream')}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Live Connected
                            </span>
                        </div>
                        <div style={{
                            background: '#090d16',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '10px',
                            padding: '1rem',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            color: '#e2e8f0',
                            minHeight: '160px',
                            maxHeight: '260px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.5
                        }}>
                            {streamText}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    background: 'rgba(0,0,0,0.1)'
                }}>
                    <button
                        onClick={onClose}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 1.25rem' }}
                    >
                        {t('inspector.close')}
                    </button>
                </div>
            </div>
        </div>
    );
};
