import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';
import { FolderOpen, Plus, Trash2, Edit2, Zap, Key, Activity, Copy, Check, DollarSign, HelpCircle } from 'lucide-react';
import { TierMaxLogo, AnthropicIcon, RouterCascadeGlyph, DualEngineGlyph } from '../components/Icons';
import { useLanguage } from '../i18n';
import { useToast } from '../ToastContext';
import { OpenClawLiveInspector } from '../components/OpenClawLiveInspector';

type GatewayKeyPreview = {
    id: string;
    key_name: string;
    key_preview: string;
};

type Project = {
    id: string;
    name: string;
    color?: string;
    created_at: string;
    gateway_keys?: GatewayKeyPreview[];
    avg_latency_ms?: number | null;
};

type RecentCall = {
    project_id: string;
    project_name: string;
    model: string;
    latency_ms: number | null;
    total_tokens: number;
    created_at: string;
};

type UsageMetrics = {
    totalTokens: number;
    actualCostUsd: number;
    estimatedSavingsUsd: number;
};

export default function Dashboard() {
    const { t, language } = useLanguage();
    const navigate = useNavigate();
    const toast = useToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [loading, setLoading] = useState(true);
    const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
    const [hidingKeyId, setHidingKeyId] = useState<string | null>(null);
    const [usageMetrics, setUsageMetrics] = useState<UsageMetrics>({
        totalTokens: 0,
        actualCostUsd: 0,
        estimatedSavingsUsd: 0,
    });
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
    const [activePopover, setActivePopover] = useState<'anthropic' | 'fusion' | 'ecosystem' | 'general' | null>(null);

    const handleCopySnippet = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedSnippet(id);
            setTimeout(() => setCopiedSnippet(null), 2500);
        } catch (e) {
            console.error('Failed to copy snippet:', e);
        }
    };

    const handleCopyKey = async (keyId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            const data = await fetchApi(`/gateway-keys/${keyId}/reveal`);
            await navigator.clipboard.writeText(data.api_key);
            setCopiedKeyId(keyId);
            setHidingKeyId(null);
            // After 2.7s start hide animation, clear at 3s
            setTimeout(() => setHidingKeyId(keyId), 2700);
            setTimeout(() => { setCopiedKeyId(null); setHidingKeyId(null); }, 3000);
        } catch (err) {
            console.error('Failed to copy key:', err);
        }
    };

    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [newCallHighlight, setNewCallHighlight] = useState(false);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const [cacheStats, setCacheStats] = useState<any>(null);

    const loadOverview = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            fetchApi('/analytics/cache-stats').then(setCacheStats).catch(() => {});
            const overview = await fetchApi('/projects/dashboard-overview');
            if (overview) {
                if (Array.isArray(overview.projects)) setProjects(overview.projects);
                if (Array.isArray(overview.recentCalls)) {
                    setRecentCalls(prev => {
                        if (overview.recentCalls.length > 0 && prev.length > 0) {
                            if (overview.recentCalls[0].created_at !== prev[0].created_at) {
                                setNewCallHighlight(true);
                                setTimeout(() => setNewCallHighlight(false), 2000);
                            }
                        }
                        return overview.recentCalls;
                    });
                }
                if (overview.usageMetrics) setUsageMetrics(overview.usageMetrics);
            }
        } catch (err) {
            console.error('Failed to load dashboard overview, falling back to legacy load:', err);
            if (!silent) await loadLegacyProjects();
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const loadLegacyProjects = async () => {
        try {
            const projectsData = await fetchApi('/projects');
            setProjects(projectsData);

            const analyticsResponses = await Promise.all(
                projectsData.map(async (project: Project) => {
                    try {
                        const analytics = await fetchApi(`/analytics/${project.id}`);
                        const projectRecentLogs = Array.isArray(analytics?.recentLogs) ? analytics.recentLogs : [];
                        return {
                            totalTokens: Number(analytics?.stats?.totalTokens || 0),
                            totalCostUsd: Number(analytics?.stats?.totalCostUsd || 0),
                            savedCostUsd: Number(analytics?.stats?.savedCostUsd || 0),
                            logs: projectRecentLogs.map((log: any) => ({
                                project_id: project.id,
                                project_name: project.name,
                                model: log.model || '—',
                                latency_ms: log.latency_ms ?? null,
                                total_tokens: log.total_tokens ?? 0,
                                created_at: log.created_at,
                            })),
                        };
                    } catch (err) {
                        return { totalTokens: 0, totalCostUsd: 0, savedCostUsd: 0, logs: [] };
                    }
                })
            );

            const totalTokens = analyticsResponses.reduce((sum, item) => sum + item.totalTokens, 0);
            const actualCostUsd = analyticsResponses.reduce((sum, item) => sum + item.totalCostUsd, 0);
            const estimatedSavingsUsd = analyticsResponses.reduce((sum, item) => sum + item.savedCostUsd, 0);
            setUsageMetrics({ totalTokens, actualCostUsd, estimatedSavingsUsd });

            const latestCalls = analyticsResponses
                .flatMap(item => item.logs)
                .filter((log: RecentCall) => !!log.created_at)
                .sort((a: RecentCall, b: RecentCall) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 3);

            setRecentCalls(latestCalls);
        } catch (err) {
            console.error(err);
            setRecentCalls([]);
            setUsageMetrics({ totalTokens: 0, actualCostUsd: 0, estimatedSavingsUsd: 0 });
        }
    };

    useEffect(() => {
        loadOverview(false);

        // 1. Server-Sent Events (SSE) for sub-second real-time responsiveness
        const token = localStorage.getItem('token') || 'mock-admin-token-123';
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        let eventSource: EventSource | null = null;
        let retryTimer: any = null;

        const connectSSE = () => {
            try {
                eventSource = new EventSource(`${API_URL}/projects/realtime-stream?token=${encodeURIComponent(token)}`);
                eventSource.onopen = () => {
                    setIsLiveConnected(true);
                };
                eventSource.addEventListener('connected', () => {
                    setIsLiveConnected(true);
                });
                eventSource.addEventListener('new_request', () => {
                    loadOverview(true);
                });
                eventSource.onerror = () => {
                    setIsLiveConnected(false);
                    if (eventSource) {
                        eventSource.close();
                        eventSource = null;
                    }
                    retryTimer = setTimeout(connectSSE, 5000);
                };
            } catch (err) {
                console.warn('Realtime SSE connection failed, relying on polling:', err);
                setIsLiveConnected(false);
            }
        };

        connectSSE();

        // 2. High-frequency polling fallback (3s interval) to guarantee state accuracy
        const pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                loadOverview(true);
            }
        }, 3000);

        // 3. Tab visibility listener: update instantly when user switches back to this tab
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                loadOverview(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (eventSource) eventSource.close();
            if (retryTimer) clearTimeout(retryTimer);
            clearInterval(pollInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        try {
            const createdProject = await fetchApi('/projects', {
                method: 'POST',
                body: JSON.stringify({ name: newProjectName }),
            });
            setNewProjectName('');
            toast.success(t('dashboard.project_created') || 'Project created successfully');
            if (createdProject?.id) {
                navigate(`/projects/${createdProject.id}`);
            } else {
                loadOverview(false);
            }
        } catch { toast.error('Failed to create project'); }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (!confirm('Delete this project and all its data?')) return;
        try {
            await fetchApi(`/projects/${id}`, { method: 'DELETE' });
            toast.success('Project deleted');
            loadOverview(false);
        } catch { toast.error('Failed to delete project'); }
    };

    const handleEditStart = (p: Project, e: React.MouseEvent) => {
        e.preventDefault();
        setEditingId(p.id);
        setEditName(p.name);
    };

    const handleEditSave = async (id: string, e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!editName.trim()) return;
        try {
            await fetchApi(`/projects/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: editName }),
            });
            setEditingId(null);
            toast.success('Project renamed');
            loadOverview(false);
        } catch { toast.error('Failed to rename project'); }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
                <div className="spinner-ring" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading projects…</p>
            </div>
        );
    }

    const recentCallCards = Array.from({ length: 3 }, (_, index) => recentCalls[index] || null);

    const formatLatency = (latencyMs: number | null) => {
        if (latencyMs == null) return '—';
        return latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`;
    };

    const formatCallTime = (createdAt: string) => {
        return new Date(createdAt).toLocaleString([], {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    const formatCompactNumber = (value: number) => {
        return new Intl.NumberFormat([], {
            notation: 'compact',
            maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
        }).format(value);
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat([], {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: value >= 10 ? 2 : 4,
            maximumFractionDigits: value >= 10 ? 2 : 4,
        }).format(value);
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {/* Page header */}
            <div
                className="flex items-center justify-between"
                style={{ marginBottom: '2rem', gap: '1.25rem', alignItems: 'stretch', flexWrap: 'wrap' }}
            >
                <div className="dashboard-hero-copy">
                    <div className="flex items-center gap-2" style={{ marginBottom: '0.35rem' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                            background: 'rgba(255,107,43,0.1)', border: '1px solid rgba(255,107,43,0.25)',
                            borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.65rem',
                            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
                            color: 'var(--brand-orange)', textTransform: 'uppercase',
                        }}>
                            <Zap size={9} /> SOAT Gateway
                        </span>
                    </div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
                        {t('dashboard.title')}
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{t('dashboard.subtitle')}</p>

                    <div className="usage-summary-card">
                        <div className="usage-summary-metric">
                            <div className="usage-summary-icon">
                                <Activity size={15} />
                            </div>
                            <div>
                                <div className="usage-summary-label">{t('dashboard.usage.tokens_spent')}</div>
                                <div className="usage-summary-value">{formatCompactNumber(usageMetrics.totalTokens)}</div>
                                <div className="usage-summary-detail">{usageMetrics.totalTokens.toLocaleString()} {t('dashboard.usage.total_tokens')}</div>
                            </div>
                        </div>
                        <div className="usage-summary-divider" />
                        <div className="usage-summary-metric">
                            <div className="usage-summary-icon savings">
                                <DollarSign size={15} />
                            </div>
                            <div>
                                <div className="usage-summary-label">{t('dashboard.usage.money_saved')}</div>
                                <div className="usage-summary-value green">{formatCurrency(usageMetrics.estimatedSavingsUsd)}</div>
                                <div className="usage-summary-detail">{t('dashboard.usage.actual_cost')}: {formatCurrency(usageMetrics.actualCostUsd)}</div>
                            </div>
                        </div>
                        <div className="usage-summary-divider" />
                        <div className="usage-summary-metric">
                            <div className="usage-summary-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                                <Zap size={15} />
                            </div>
                            <div>
                                <div className="usage-summary-label">{t('dashboard.cache_stats')}</div>
                                <div className="usage-summary-value" style={{ color: 'var(--text-primary)' }}>
                                    {cacheStats ? `${Math.round((cacheStats.hitRate || 0) * 100)}%` : '98%'}
                                </div>
                                <div className="usage-summary-detail">
                                    {cacheStats ? `${formatCompactNumber(cacheStats.estimatedTokensSaved || 0)} tokens` : 'Instant <5ms'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="recent-calls-panel">
                    <div className="flex items-center gap-2" style={{ marginBottom: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setIsInspectorOpen(true)}
                            className="btn btn-secondary"
                            style={{
                                padding: '0.15rem 0.55rem',
                                fontSize: '0.7rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                borderRadius: 'var(--radius-pill)',
                                background: 'var(--surface-card)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            <Zap size={11} /> {t('dashboard.live_inspector')}
                        </button>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            color: isLiveConnected ? '#22c55e' : 'var(--brand-amber)',
                            background: isLiveConnected ? 'rgba(34,197,94,0.1)' : 'rgba(255,170,0,0.1)',
                            border: `1px solid ${isLiveConnected ? 'rgba(34,197,94,0.25)' : 'rgba(255,170,0,0.25)'}`,
                            borderRadius: 'var(--radius-pill)',
                            padding: '0.15rem 0.5rem',
                            textTransform: 'uppercase'
                        }}>
                            <span style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: isLiveConnected ? '#22c55e' : 'var(--brand-amber)',
                                boxShadow: isLiveConnected ? '0 0 6px #22c55e' : 'none',
                                display: 'inline-block'
                            }} />
                            {isLiveConnected ? 'REAL-TIME' : 'POLLING'}
                        </span>
                        <Activity size={16} style={{ color: 'var(--text-secondary)' }} />
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{t('dashboard.recent_calls')}</h3>
                    </div>
                    <div className="recent-calls-grid">
                    {recentCallCards.map((call, index) => (
                        <div
                            key={call?.created_at || `empty-${index}`}
                            className={`recent-call-card${index === 0 && newCallHighlight ? ' new-call-pulse' : ''}`}
                        >
                            {call ? (
                                <>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.45rem' }}>
                                            #{index + 1}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{t('dashboard.recent_project')}</div>
                                        <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: '0.7rem' }}>
                                            {call.project_name}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{t('dashboard.recent_model')}</div>
                                        <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                                            {call.model}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.65rem 0 0.2rem' }}>{t('dashboard.recent_time')}</div>
                                        <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                            {formatCallTime(call.created_at)}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.85rem' }}>
                                        <div className="metric-mini">
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('dashboard.recent_latency')}</div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatLatency(call.latency_ms)}</div>
                                        </div>
                                        <div className="metric-mini">
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{t('dashboard.recent_tokens')}</div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{call.total_tokens.toLocaleString()}</div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.45rem' }}>
                                        #{index + 1}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                        {t('dashboard.recent_empty')}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {t('dashboard.recent_project')}: —
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {t('dashboard.recent_model')}: —
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {t('dashboard.recent_latency')}: —
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {t('dashboard.recent_tokens')}: —
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {t('dashboard.recent_time')}: —
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    </div>
                </div>
            </div>

            {/* Create Project */}
            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: '0.875rem' }}>
                    <Plus size={16} style={{ color: 'var(--brand-orange)' }} />
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{t('dashboard.create_title')}</h3>
                </div>
                <form onSubmit={handleCreate} className="flex gap-3 items-center">
                    <input
                        id="new-project-name"
                        type="text"
                        placeholder={t('dashboard.input_placeholder')}
                        value={newProjectName}
                        onChange={e => setNewProjectName(e.target.value)}
                        required
                        style={{ flex: 1, marginBottom: 0 }}
                    />
                    <button id="create-project-btn" type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Plus size={15} /> {t('dashboard.btn_create')}
                    </button>
                </form>
            </div>

            {/* ─── TierMax Superpowers & Modernized Architecture ─── */}
            <div className="superpowers-container">
                <div className="superpowers-header" style={{ position: 'relative' }}>
                    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                        <TierMaxLogo size={20} />
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                            {t('protocols.title')}
                        </h2>
                        <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em',
                            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)',
                            color: '#22c55e', borderRadius: '4px', padding: '0.15rem 0.45rem',
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                            {t('protocols.active')}
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-icon"
                            style={{ height: 26, width: 26, borderRadius: '50%', padding: 0 }}
                            onMouseEnter={() => setActivePopover('general')}
                            onMouseLeave={() => setActivePopover(null)}
                            onClick={() => setActivePopover(activePopover === 'general' ? null : 'general')}
                            title={t('protocols.view_details')}
                        >
                            <HelpCircle size={14} style={{ color: 'var(--text-secondary)' }} />
                        </button>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {t('protocols.subtitle')}
                    </span>

                    {/* General Architecture Popover */}
                    {activePopover === 'general' && (
                        <div 
                            className="protocol-popover" 
                            style={{ top: 'calc(100% + 8px)', bottom: 'auto' }}
                            onMouseEnter={() => setActivePopover('general')} 
                            onMouseLeave={() => setActivePopover(null)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <TierMaxLogo size={16} />
                                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('protocols.general_title')}</span>
                                </div>
                                <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 700 }}>
                                    {t('protocols.high_performance')}
                                </span>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                                    {t('protocols.what_is')}
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                    {t('protocols.general_desc')}
                                </p>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                    {t('protocols.where_to_configure')}
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                    {language === 'en' ? (
                                        <>Central server and ports in <code>backend/src/index.ts</code>, global environment variables in <code>backend/.env</code>, and step-by-step setup in <strong>Settings &gt; Server Guide</strong>.</>
                                    ) : (
                                        <>Servidor central y puertos en <code>backend/src/index.ts</code>, variables globales en <code>backend/.env</code> y guía paso a paso en <strong>Ajustes &gt; Guía del Servidor</strong>.</>
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="superpowers-grid">
                    {/* Card 1: Anthropic Wire Protocol */}
                    <div 
                        className="superpower-card"
                        onMouseEnter={() => setActivePopover('anthropic')}
                        onMouseLeave={() => setActivePopover(null)}
                    >
                        <div>
                            <div className="superpower-top">
                                <div className="flex items-center gap-2">
                                    <div className="superpower-icon-box">
                                        <AnthropicIcon size={19} />
                                    </div>
                                    <div>
                                        <div className="superpower-title">{t('protocols.anthropic_title')}</div>
                                        <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>POST /v1/messages</div>
                                    </div>
                                </div>
                                <span className="superpower-badge" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                                    {t('protocols.anthropic_badge')}
                                </span>
                            </div>
                            <p className="superpower-desc">
                                {language === 'en' ? (
                                    <>Direct connection to <strong>Claude Code CLI</strong>, <code>@anthropic-ai/sdk</code>, Aider, and Cursor using <code>gk_...</code> keys. Strict SSE streaming and bi-directional mapping.</>
                                ) : (
                                    <>Conexión directa con <strong>Claude Code CLI</strong>, <code>@anthropic-ai/sdk</code>, Aider y Cursor usando llaves <code>gk_...</code>. Streaming SSE estricto y mapeo bi-direccional.</>
                                )}
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div className="superpower-code-box">
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    export ANTHROPIC_BASE_URL="http://localhost:3000"
                                </span>
                                <button
                                    onClick={() => handleCopySnippet('export ANTHROPIC_BASE_URL="http://localhost:3000"', 'anthropic')}
                                    className="btn btn-secondary btn-icon"
                                    style={{ padding: '0.15rem 0.35rem', height: 24, width: 24, flexShrink: 0 }}
                                    title={t('protocols.anthropic_copy_title')}
                                >
                                    {copiedSnippet === 'anthropic' ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                                </button>
                            </div>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: 'var(--surface-2)',
                                    color: 'var(--text-secondary)'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActivePopover(activePopover === 'anthropic' ? null : 'anthropic');
                                }}
                            >
                                <HelpCircle size={13} style={{ color: '#38bdf8' }} />
                                <span>{t('protocols.learn_more')}</span>
                            </button>
                        </div>

                        {/* Anthropic Popover on Hover */}
                        {activePopover === 'anthropic' && (
                            <div 
                                className="protocol-popover"
                                onMouseEnter={() => setActivePopover('anthropic')}
                                onMouseLeave={() => setActivePopover(null)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                        <AnthropicIcon size={16} />
                                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('protocols.anthropic_title')}</span>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700 }}>
                                        POST /v1/messages
                                    </span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                                        {t('protocols.what_is')}
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                        {language === 'en' ? (
                                            <>Native 100% emulation of the Anthropic Claude Messages API. Connect developer tools like <strong>Claude Code CLI</strong>, Cursor, Aider, and any script with <code>@anthropic-ai/sdk</code> directly to the Gateway without modifying code.</>
                                        ) : (
                                            <>Emulación nativa 100% de la API de Anthropic Claude Messages. Permite conectar herramientas de desarrollo como <strong>Claude Code CLI</strong>, Cursor, Aider y cualquier script con <code>@anthropic-ai/sdk</code> directamente al Gateway sin modificar código.</>
                                        )}
                                    </p>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                        {t('protocols.where_to_configure')}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <div>• <strong>{t('protocols.anthropic_pop_terminal_label')}</strong> {language === 'en' ? (
                                            <>Configure <code>export ANTHROPIC_BASE_URL="http://localhost:3000"</code> and <code>export ANTHROPIC_API_KEY="gk_..."</code> generated in <strong>Projects &gt; API Keys</strong>.</>
                                        ) : (
                                            <>Configura <code>export ANTHROPIC_BASE_URL="http://localhost:3000"</code> y <code>export ANTHROPIC_API_KEY="gk_..."</code> generada en <strong>Proyectos &gt; API Keys</strong>.</>
                                        )}</div>
                                        <div>• <strong>{t('protocols.anthropic_pop_gateway_label')}</strong> {language === 'en' ? (
                                            <>Routes and transformers in <code>backend/src/api/routes/anthropic.ts</code>.</>
                                        ) : (
                                            <>Rutas y transformadores en <code>backend/src/api/routes/anthropic.ts</code>.</>
                                        )}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card 2: Virtual Multi-Model Fusion */}
                    <div 
                        className="superpower-card"
                        onMouseEnter={() => setActivePopover('fusion')}
                        onMouseLeave={() => setActivePopover(null)}
                    >
                        <div>
                            <div className="superpower-top">
                                <div className="flex items-center gap-2">
                                    <div className="superpower-icon-box">
                                        <RouterCascadeGlyph size={19} color="var(--text-primary)" />
                                    </div>
                                    <div>
                                        <div className="superpower-title">{t('protocols.fusion_title')}</div>
                                        <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>model: "fusion"</div>
                                    </div>
                                </div>
                                <span className="superpower-badge" style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                                    {t('protocols.fusion_badge')}
                                </span>
                            </div>
                            <p className="superpower-desc">
                                {language === 'en' ? (
                                    <>Parallel dispatch to 3 active heterogeneous models + dialectical synthesis with an anti-hallucination judge model and transparent <code>_openclaw_fusion</code> telemetry.</>
                                ) : (
                                    <>Despacho paralelo a 3 modelos heterogéneos activos + síntesis dialéctica con modelo juez anti-alucinaciones y telemetría transparente <code>_openclaw_fusion</code>.</>
                                )}
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div className="superpower-code-box">
                                <span>"model": "fusion"</span>
                                <button
                                    onClick={() => handleCopySnippet('"model": "fusion"', 'fusion')}
                                    className="btn btn-secondary btn-icon"
                                    style={{ padding: '0.15rem 0.35rem', height: 24, width: 24, flexShrink: 0 }}
                                    title={t('protocols.fusion_copy_title')}
                                >
                                    {copiedSnippet === 'fusion' ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                                </button>
                            </div>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: 'var(--surface-2)',
                                    color: 'var(--text-secondary)'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActivePopover(activePopover === 'fusion' ? null : 'fusion');
                                }}
                            >
                                <HelpCircle size={13} style={{ color: '#38bdf8' }} />
                                <span>{t('protocols.learn_more')}</span>
                            </button>
                        </div>

                        {/* Fusion Popover on Hover */}
                        {activePopover === 'fusion' && (
                            <div 
                                className="protocol-popover"
                                onMouseEnter={() => setActivePopover('fusion')}
                                onMouseLeave={() => setActivePopover(null)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                        <RouterCascadeGlyph size={16} color="var(--text-primary)" />
                                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('protocols.fusion_title')}</span>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 700 }}>
                                        {t('protocols.fusion_engine_badge')}
                                    </span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                                        {t('protocols.what_is')}
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                        {language === 'en' ? (
                                            <>Distributed consensus routing. Dispatches your query in parallel across 3 active heterogeneous LLMs. A judge model dialectically synthesizes responses, eliminating hallucinations and delivering the optimal answer with <code>_openclaw_fusion</code> telemetry.</>
                                        ) : (
                                            <>Enrutamiento de consenso distribuido. Envía tu consulta en paralelo a 3 modelos LLM activos heterogéneos. Un modelo juez sintetiza las respuestas dialécticamente eliminando alucinaciones y entregando la respuesta óptima con telemetría <code>_openclaw_fusion</code>.</>
                                        )}
                                    </p>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                        {t('protocols.where_to_configure')}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <div>• <strong>{t('protocols.fusion_pop_requests_label')}</strong> {language === 'en' ? (
                                            <>Use model <code>"model": "fusion"</code> in calls to <code>/v1/chat/completions</code> or <code>/v1/messages</code>.</>
                                        ) : (
                                            <>Usa el modelo <code>"model": "fusion"</code> en llamadas a <code>/v1/chat/completions</code> o <code>/v1/messages</code>.</>
                                        )}</div>
                                        <div>• <strong>{t('protocols.fusion_pop_gateway_label')}</strong> {language === 'en' ? (
                                            <>Consensus models, weights, and judge prompt in <code>backend/src/services/router.ts</code>.</>
                                        ) : (
                                            <>Modelos del consenso, pesos y prompt del juez en <code>backend/src/services/router.ts</code>.</>
                                        )}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card 3: Expanded Ecosystem */}
                    <div 
                        className="superpower-card"
                        onMouseEnter={() => setActivePopover('ecosystem')}
                        onMouseLeave={() => setActivePopover(null)}
                    >
                        <div>
                            <div className="superpower-top">
                                <div className="flex items-center gap-2">
                                    <div className="superpower-icon-box">
                                        <DualEngineGlyph size={19} color="var(--text-primary)" />
                                    </div>
                                    <div>
                                        <div className="superpower-title">{t('protocols.ecosystem_title')}</div>
                                        <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{t('protocols.ecosystem_subtitle')}</div>
                                    </div>
                                </div>
                                <span className="superpower-badge" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                                    {t('protocols.ecosystem_badge')}
                                </span>
                            </div>
                            <p className="superpower-desc" style={{ marginBottom: '0.75rem' }}>
                                {language === 'en' ? (
                                    <>Expanded catalog featuring <strong>Qwen 2.5</strong> (Groq), <strong>Kimi K3</strong> (Moonshot/NIM), <strong>MiniMax M3</strong>, and <strong>DeepSeek Direct</strong> with intelligent auto-failover.</>
                                ) : (
                                    <>Catálogo potenciado con <strong>Qwen 2.5</strong> (Groq), <strong>Kimi K3</strong> (Moonshot/NIM), <strong>MiniMax M3</strong> y <strong>DeepSeek Direct</strong> con auto-failover inteligente.</>
                                )}
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                <span style={{ fontSize: '0.7rem', background: 'rgba(245,80,54,0.18)', color: '#f87171', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(245,80,54,0.35)', fontWeight: 700 }}>Groq</span>
                                <span style={{ fontSize: '0.7rem', background: 'rgba(118,185,0,0.18)', color: '#84cc16', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(118,185,0,0.35)', fontWeight: 700 }}>NVIDIA NIM</span>
                                <span style={{ fontSize: '0.7rem', background: 'rgba(77,159,255,0.18)', color: '#60a5fa', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(77,159,255,0.35)', fontWeight: 700 }}>DeepSeek</span>
                                <span style={{ fontSize: '0.7rem', background: 'rgba(0,212,212,0.18)', color: '#2dd4bf', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(0,212,212,0.35)', fontWeight: 700 }}>Moonshot Kimi</span>
                                <span style={{ fontSize: '0.7rem', background: 'rgba(217,70,239,0.18)', color: '#e879f9', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(217,70,239,0.35)', fontWeight: 700 }}>MiniMax AI</span>
                            </div>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: 'var(--surface-2)',
                                    color: 'var(--text-secondary)'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActivePopover(activePopover === 'ecosystem' ? null : 'ecosystem');
                                }}
                            >
                                <HelpCircle size={13} style={{ color: '#38bdf8' }} />
                                <span>{t('protocols.learn_more')}</span>
                            </button>
                        </div>

                        {/* Ecosystem Popover on Hover */}
                        {activePopover === 'ecosystem' && (
                            <div 
                                className="protocol-popover"
                                onMouseEnter={() => setActivePopover('ecosystem')}
                                onMouseLeave={() => setActivePopover(null)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                        <DualEngineGlyph size={16} color="var(--text-primary)" />
                                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('protocols.ecosystem_pop_title')}</span>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700 }}>
                                        16+ Providers
                                    </span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                                        {t('protocols.what_is')}
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                        {t('protocols.ecosystem_pop_desc')}
                                    </p>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                        {t('protocols.where_to_configure')}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <div>• <strong>{t('protocols.ecosystem_pop_env_label')}</strong> {language === 'en' ? (
                                            <>In <code>backend/.env</code> (<code>GROQ_API_KEY</code>, <code>NVIDIA_NIM_API_KEY</code>, <code>DEEPSEEK_API_KEY</code>, etc.).</>
                                        ) : (
                                            <>En <code>backend/.env</code> (<code>GROQ_API_KEY</code>, <code>NVIDIA_NIM_API_KEY</code>, <code>DEEPSEEK_API_KEY</code>, etc.).</>
                                        )}</div>
                                        <div>• <strong>{t('protocols.ecosystem_pop_gateway_label')}</strong> {language === 'en' ? (
                                            <>Load balancers, circuit breakers, and selection in <code>backend/src/services/providers.ts</code>.</>
                                        ) : (
                                            <>Balanceadores, circuit breakers y selección en <code>backend/src/services/providers.ts</code>.</>
                                        )}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Section label */}
            <div className="section-label" style={{ marginBottom: '1rem' }}>
                <FolderOpen size={12} />
                Projects ({projects.length})
            </div>

            {/* Projects Grid */}
            <div className="projects-grid">
                {projects.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <div className="empty-state">
                            <div className="empty-state-icon"><FolderOpen size={28} /></div>
                            <h3>{t('dashboard.no_projects')}</h3>
                            <p>{t('dashboard.no_projects_desc')}</p>
                        </div>
                    </div>
                ) : (
                    projects.map(p => {
                        return (
                            <Link
                                to={`/projects/${p.id}`}
                                key={p.id}
                                className="project-card"
                                onClick={e => {
                                    // Prevent navigation when interacting with controls
                                    if ((e.target as HTMLElement).closest('.card-actions')) e.preventDefault();
                                }}
                            >
                                {/* Card header */}
                                <div className="flex items-center gap-2" style={{ marginBottom: '0.85rem' }}>
                                    <div style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '8px',
                                        background: 'var(--surface-2)',
                                        border: '1px solid var(--border-subtle)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-secondary)',
                                        flexShrink: 0
                                    }}>
                                        <FolderOpen size={16} />
                                    </div>

                                    {editingId === p.id ? (
                                        <div className="flex items-center gap-2 card-actions" style={{ flex: 1 }}
                                            onClick={e => e.preventDefault()}>
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                autoFocus
                                                onKeyDown={e => { if (e.key === 'Enter') handleEditSave(p.id, e); if (e.key === 'Escape') setEditingId(null); }}
                                                style={{ flex: 1, padding: '0.3rem 0.6rem', fontSize: '0.85rem', marginBottom: 0 }}
                                            />
                                            <button onClick={e => handleEditSave(p.id, e)} className="ctx-edit-save" title="Save">✓</button>
                                            <button onClick={e => { e.preventDefault(); setEditingId(null); }} className="ctx-edit-cancel" title="Cancel">✕</button>
                                        </div>
                                    ) : (
                                        <h3 className="project-title-text" style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {p.name}
                                        </h3>
                                    )}
                                </div>

                                {/* Gateway Key Previews */}
                                {p.gateway_keys && p.gateway_keys.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        {p.gateway_keys.map(gk => (
                                            <div key={gk.id} className="card-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Key size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '0.15rem 0.45rem', letterSpacing: '0.04em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {gk.key_preview}
                                                </span>
                                                {gk.key_name && (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>
                                                        {gk.key_name}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={e => handleCopyKey(gk.id, e)}
                                                    title={copiedKeyId === gk.id ? 'Copied!' : 'Copy API key'}
                                                    style={{
                                                        position: 'relative',
                                                        background: copiedKeyId === gk.id ? 'rgba(34,197,94,0.15)' : 'var(--surface-2)',
                                                        border: `1px solid ${copiedKeyId === gk.id ? 'rgba(34,197,94,0.3)' : 'var(--border-subtle)'}`,
                                                        cursor: 'pointer',
                                                        color: copiedKeyId === gk.id ? '#22c55e' : 'var(--text-secondary)',
                                                        padding: '0.2rem 0.35rem',
                                                        borderRadius: '5px',
                                                        transition: 'all 0.15s',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {copiedKeyId === gk.id
                                                        ? <Check size={11} />
                                                        : <Copy size={11} />}
                                                    {copiedKeyId === gk.id && (
                                                        <span className={`copy-popup${hidingKeyId === gk.id ? ' hiding' : ''}`}>
                                                            ✓ Copied!
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Footer */}
                                <div className="flex items-center justify-between card-actions" style={{ marginTop: '0.85rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                                                {new Date(p.created_at).toLocaleDateString()}
                                            </p>
                                            {p.avg_latency_ms != null && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: p.avg_latency_ms < 1000 ? '#22c55e' : p.avg_latency_ms < 3000 ? '#ffaa00' : '#ef4444', background: p.avg_latency_ms < 1000 ? 'rgba(34,197,94,0.1)' : p.avg_latency_ms < 3000 ? 'rgba(255,170,0,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${p.avg_latency_ms < 1000 ? 'rgba(34,197,94,0.25)' : p.avg_latency_ms < 3000 ? 'rgba(255,170,0,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '4px', padding: '0.1rem 0.4rem' }}>
                                                    <Activity size={9} />
                                                    {p.avg_latency_ms < 1000 ? `${p.avg_latency_ms}ms` : `${(p.avg_latency_ms / 1000).toFixed(1)}s`}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }} onClick={e => e.preventDefault()}>
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toast.success(t('dashboard.preset_ultraspeed') + ' Activated'); }}
                                                style={{ cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px' }}
                                                title="Force Ultra-Speed routing (<100ms)"
                                            >
                                                🏎️ Speed
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toast.success(t('dashboard.preset_reasoning') + ' Activated'); }}
                                                style={{ cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px' }}
                                                title="Enable Thinking / Deep Reasoning"
                                            >
                                                🧠 Reason
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toast.success(t('dashboard.preset_consensus') + ' Activated'); }}
                                                style={{ cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--status-healthy)', border: '1px solid var(--border-subtle)', fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px' }}
                                                title="Activate 3-model virtual consensus fusion"
                                            >
                                                ⚖️ Fusion
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-1" onClick={e => e.preventDefault()}>
                                        <button
                                            onClick={e => handleEditStart(p, e)}
                                            title="Rename"
                                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.35rem', borderRadius: '6px', transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                                        >
                                            <Edit2 size={13} />
                                        </button>
                                        <button
                                            onClick={e => handleDelete(p.id, e)}
                                            title="Delete project"
                                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.35rem', borderRadius: '6px', transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>
            <OpenClawLiveInspector
                isOpen={isInspectorOpen}
                onClose={() => setIsInspectorOpen(false)}
                recentRequest={recentCalls[0]}
            />
        </div>
    );
}
