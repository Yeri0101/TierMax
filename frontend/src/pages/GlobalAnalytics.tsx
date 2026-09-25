import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchApi } from '../api';
import {
    Activity,
    BarChart3,
    Search,
    RotateCcw,
    RefreshCw,
    Download,
    Trash2,
    Eye,
    X,
    Copy,
    Check,
    Cpu,
    Zap,
    Shield,
    AlertCircle,
    Clock,
    CheckCircle2,
    Server,
    Layers,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../i18n';
import { useToast } from '../ToastContext';
import { ProviderIcon } from '../components/Icons';

interface EnrichedLog {
    id: string;
    project_id?: string;
    project_name?: string;
    gateway_key_id?: string;
    gateway_key_name?: string;
    upstream_key_id?: string;
    upstream_project_id?: string;
    upstream_project_name?: string;
    provider?: string;
    model?: string;
    billing_type?: 'free' | 'paid';
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    latency_ms?: number;
    status_code?: number;
    error_message?: string;
    total_cost_usd?: number | string;
    created_at: string;
}

interface AnalyticsStats {
    totalRequests: number;
    successRate: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCostUsd: number;
    savedCostUsd: number;
    paidTokens: number;
    freeTokens: number;
    averageLatency: number;
}

interface GlobalAnalyticsResponse {
    stats: AnalyticsStats;
    providerUsage: Record<string, { requests: number; tokens: number; cost: number }>;
    modelUsage: Record<string, { requests: number; tokens: number; cost: number }>;
    projectUsage: Record<string, { requests: number; tokens: number; cost: number; name: string }>;
    totalFilteredCount: number;
    totalRecords: number;
    recentLogs: EnrichedLog[];
    projects: Array<{ id: string; name: string }>;
}

export default function GlobalAnalytics() {
    const { t, language } = useLanguage();
    const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

    // ─── Filters & Pagination State ───
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [selectedBilling, setSelectedBilling] = useState<string>('');
    const [selectedStatus, setSelectedStatus] = useState<string>('');
    const [selectedProvider, setSelectedProvider] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [pageSize, setPageSize] = useState<number>(50);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // ─── Real-time & Data State ───
    const [data, setData] = useState<GlobalAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
    const [inspectingLog, setInspectingLog] = useState<EnrichedLog | null>(null);
    const [copiedJson, setCopiedJson] = useState<boolean>(false);
    const [copiedError, setCopiedError] = useState<boolean>(false);

    // ─── Fetch Analytics Data ───
    const loadAnalytics = useCallback(async (showSpin = false) => {
        if (showSpin) setIsRefreshing(true);
        try {
            const params = new URLSearchParams();
            if (selectedProject) params.append('projectId', selectedProject);
            if (selectedBilling) params.append('billingType', selectedBilling);
            if (selectedStatus) params.append('status', selectedStatus);
            if (selectedProvider) params.append('provider', selectedProvider);
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            params.append('limit', String(pageSize));
            params.append('offset', String((currentPage - 1) * pageSize));

            const res = await fetchApi(`/analytics/global?${params.toString()}`);
            setData(res);
        } catch (err: any) {
            console.error('Error fetching global analytics:', err);
            toastError(err.message || 'Error loading global analytics');
        } finally {
            setLoading(false);
            if (showSpin) setIsRefreshing(false);
        }
    }, [selectedProject, selectedBilling, selectedStatus, selectedProvider, searchQuery, pageSize, currentPage, toastError]);

    // Initial load and filter change trigger
    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    // Live auto-refresh interval (every 6 seconds if active)
    useEffect(() => {
        if (!isLiveActive) return;
        const interval = setInterval(() => {
            loadAnalytics(false);
        }, 6000);
        return () => clearInterval(interval);
    }, [isLiveActive, loadAnalytics]);

    // Reset pagination to page 1 whenever filters change
    const handleFilterChange = (setter: (val: any) => void, val: any) => {
        setter(val);
        setCurrentPage(1);
    };

    const handleResetFilters = () => {
        setSelectedProject('');
        setSelectedBilling('');
        setSelectedStatus('');
        setSelectedProvider('');
        setSearchQuery('');
        setCurrentPage(1);
    };

    // ─── CSV & JSON Exports ───
    const handleExportCSV = () => {
        if (!data || !data.recentLogs.length) {
            toastWarning('No data to export');
            return;
        }
        const headers = ['Timestamp', 'Project', 'Upstream Channel', 'Tier', 'Provider', 'Model', 'Status Code', 'Latency (ms)', 'Prompt Tokens', 'Completion Tokens', 'Total Tokens', 'Cost USD', 'Error'];
        const rows = data.recentLogs.map(l => [
            `"${l.created_at}"`,
            `"${(l.project_name || '').replace(/"/g, '""')}"`,
            `"${(l.upstream_project_name || '').replace(/"/g, '""')}"`,
            `"${l.billing_type || 'free'}"`,
            `"${l.provider || ''}"`,
            `"${l.model || ''}"`,
            l.status_code || '',
            l.latency_ms || 0,
            l.prompt_tokens || 0,
            l.completion_tokens || 0,
            l.total_tokens || 0,
            l.total_cost_usd || 0,
            `"${(l.error_message || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `openclaw_global_calls_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toastSuccess('Exported CSV successfully');
    };

    const handleExportJSON = () => {
        if (!data) return;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openclaw_global_telemetry_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toastSuccess('Exported JSON telemetry successfully');
    };

    const handleClearLogs = async () => {
        if (!window.confirm(t('analytics.clear_confirm') || 'Are you sure you want to clear all call logs? This cannot be undone.')) {
            return;
        }
        try {
            await fetchApi('/analytics/global', { method: 'DELETE' });
            toastSuccess('All call history cleared');
            loadAnalytics(true);
        } catch (err: any) {
            toastError(err.message || 'Failed to clear logs');
        }
    };

    const copyToClipboard = (text: string, isError = false) => {
        navigator.clipboard.writeText(text);
        if (isError) {
            setCopiedError(true);
            setTimeout(() => setCopiedError(false), 2000);
        } else {
            setCopiedJson(true);
            setTimeout(() => setCopiedJson(false), 2000);
        }
        toastSuccess(t('analytics.inspector.copied') || 'Copied to clipboard');
    };

    // Calculate pagination values
    const totalFiltered = data?.totalFilteredCount || 0;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const startRecordIndex = totalFiltered === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endRecordIndex = Math.min(currentPage * pageSize, totalFiltered);

    // Formatters
    const formatNumber = (num: number) => num.toLocaleString(language === 'es' ? 'es-ES' : 'en-US');
    const formatCost = (val: number | string | undefined) => `$${Number(val || 0).toFixed(6)}`;
    const formatLatency = (ms?: number) => {
        if (ms == null) return '—';
        if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
        return `${ms}ms`;
    };
    const formatDateTime = (iso: string) => {
        try {
            const d = new Date(iso);
            return d.toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        } catch {
            return iso;
        }
    };

    // Unique providers present in stats for filtering
    const availableProviders = useMemo(() => {
        if (!data?.providerUsage) return [];
        return Object.keys(data.providerUsage).sort();
    }, [data?.providerUsage]);

    // Top 5 providers by requests
    const topProviders = useMemo(() => {
        if (!data?.providerUsage) return [];
        const entries = Object.entries(data.providerUsage);
        const total = entries.reduce((acc, [, val]) => acc + val.requests, 0);
        return entries
            .sort((a, b) => b[1].requests - a[1].requests)
            .slice(0, 5)
            .map(([prov, stats]) => ({
                provider: prov,
                requests: stats.requests,
                tokens: stats.tokens,
                cost: stats.cost,
                pct: total > 0 ? Math.round((stats.requests / total) * 100) : 0
            }));
    }, [data?.providerUsage]);

    // Top 5 models by requests
    const topModels = useMemo(() => {
        if (!data?.modelUsage) return [];
        const entries = Object.entries(data.modelUsage);
        const total = entries.reduce((acc, [, val]) => acc + val.requests, 0);
        return entries
            .sort((a, b) => b[1].requests - a[1].requests)
            .slice(0, 5)
            .map(([mod, stats]) => ({
                model: mod,
                requests: stats.requests,
                tokens: stats.tokens,
                cost: stats.cost,
                pct: total > 0 ? Math.round((stats.requests / total) * 100) : 0
            }));
    }, [data?.modelUsage]);

    // Top 5 projects by requests
    const topProjects = useMemo(() => {
        if (!data?.projectUsage) return [];
        const entries = Object.entries(data.projectUsage);
        const total = entries.reduce((acc, [, val]) => acc + val.requests, 0);
        return entries
            .sort((a, b) => b[1].requests - a[1].requests)
            .slice(0, 5)
            .map(([projId, stats]) => ({
                id: projId,
                name: stats.name || 'Proyecto',
                requests: stats.requests,
                tokens: stats.tokens,
                cost: stats.cost,
                pct: total > 0 ? Math.round((stats.requests / total) * 100) : 0
            }));
    }, [data?.projectUsage]);

    const stats = data?.stats;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', paddingBottom: '3rem' }}>
            {/* ═══ Header ═══ */}
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: '10px',
                            background: 'rgba(255,107,43,0.12)',
                            border: '1px solid rgba(255,107,43,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--brand-orange)'
                        }}>
                            <BarChart3 size={20} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                                {t('analytics.title') || 'Global Call Analytics & Telemetry'}
                            </h1>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                {t('analytics.subtitle') || 'Unified real-time monitoring and telemetry of every AI call across all projects'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    {/* Live Toggle Pill */}
                    <button
                        type="button"
                        onClick={() => setIsLiveActive(!isLiveActive)}
                        className="btn btn-secondary btn-sm"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            borderRadius: 'var(--radius-pill)',
                            borderColor: isLiveActive ? 'rgba(34,197,94,0.35)' : 'var(--border-subtle)',
                            background: isLiveActive ? 'rgba(34,197,94,0.08)' : 'var(--surface-card)',
                            color: isLiveActive ? '#22c55e' : 'var(--text-muted)'
                        }}
                        title={isLiveActive ? 'Auto-refreshing every 6s' : 'Auto-refresh paused'}
                    >
                        <span style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: isLiveActive ? '#22c55e' : 'var(--text-muted)',
                            boxShadow: isLiveActive ? '0 0 6px #22c55e' : 'none',
                            animation: isLiveActive ? 'pulseGlow 2s infinite' : 'none'
                        }} />
                        <span style={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.04em' }}>
                            {isLiveActive ? (t('analytics.realtime') || 'LIVE') : (t('analytics.paused') || 'PAUSED')}
                        </span>
                    </button>

                    {/* Refresh Manual Button */}
                    <button
                        type="button"
                        onClick={() => loadAnalytics(true)}
                        disabled={isRefreshing}
                        className="btn btn-secondary btn-sm"
                        title={t('analytics.refresh') || 'Refresh'}
                    >
                        <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
                        <span>{t('analytics.refresh') || 'Refresh'}</span>
                    </button>

                    {/* Export CSV */}
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="btn btn-secondary btn-sm"
                        title={t('analytics.export_csv') || 'Export CSV'}
                    >
                        <Download size={13} />
                        <span>CSV</span>
                    </button>

                    {/* Export JSON */}
                    <button
                        type="button"
                        onClick={handleExportJSON}
                        className="btn btn-secondary btn-sm"
                        title={t('analytics.export_json') || 'Export JSON'}
                    >
                        <Layers size={13} />
                        <span>JSON</span>
                    </button>

                    {/* Clear Logs */}
                    <button
                        type="button"
                        onClick={handleClearLogs}
                        className="btn btn-danger btn-sm"
                        title={t('analytics.clear_logs') || 'Clear Logs'}
                    >
                        <Trash2 size={13} />
                        <span>{t('analytics.clear_logs') || 'Clear'}</span>
                    </button>
                </div>
            </div>

            {/* ═══ Top Metric Cards (KPIs) ═══ */}
            <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                {/* Total Requests */}
                <div className="stat-card">
                    <div className="stat-label">
                        <Activity size={12} style={{ color: 'var(--brand-orange)' }} />
                        {t('analytics.kpi.total_calls') || 'Total Requests'}
                    </div>
                    <div className="stat-value white">
                        {loading && !stats ? '—' : formatNumber(stats?.totalRequests || 0)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {formatNumber(data?.totalRecords || 0)} {language === 'es' ? 'en base de datos' : 'in database'}
                    </div>
                </div>

                {/* Success Rate */}
                <div className="stat-card">
                    <div className="stat-label">
                        <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
                        {t('analytics.kpi.success_rate') || 'Success Rate'}
                    </div>
                    <div className="stat-value green">
                        {loading && !stats ? '—' : `${stats?.successRate || 0}%`}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {language === 'es' ? 'respuestas HTTP 2xx/3xx' : 'HTTP 2xx/3xx replies'}
                    </div>
                </div>

                {/* Total Tokens */}
                <div className="stat-card">
                    <div className="stat-label">
                        <Cpu size={12} style={{ color: 'var(--brand-amber)' }} />
                        {t('analytics.kpi.total_tokens') || 'Total Tokens'}
                    </div>
                    <div className="stat-value amber">
                        {loading && !stats ? '—' : formatNumber(stats?.totalTokens || 0)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                        P: {formatNumber(stats?.totalPromptTokens || 0)} · C: {formatNumber(stats?.totalCompletionTokens || 0)}
                    </div>
                </div>

                {/* Actual Cost */}
                <div className="stat-card">
                    <div className="stat-label">
                        <Shield size={12} style={{ color: '#ef4444' }} />
                        {t('analytics.kpi.actual_cost') || 'Actual Cost (Paid)'}
                    </div>
                    <div className="stat-value white">
                        {loading && !stats ? '—' : formatCost(stats?.totalCostUsd)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {formatNumber(stats?.paidTokens || 0)} tokens pagados
                    </div>
                </div>

                {/* Free Tier Savings */}
                <div className="stat-card">
                    <div className="stat-label">
                        <Zap size={12} style={{ color: '#22c55e' }} />
                        {t('analytics.kpi.free_savings') || 'Free Tier Savings'}
                    </div>
                    <div className="stat-value green">
                        {loading && !stats ? '—' : formatCost(stats?.savedCostUsd)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {formatNumber(stats?.freeTokens || 0)} tokens gratuitos
                    </div>
                </div>

                {/* Average Latency */}
                <div className="stat-card">
                    <div className="stat-label">
                        <Clock size={12} style={{ color: 'var(--brand-orange)' }} />
                        {t('analytics.kpi.avg_latency') || 'Avg Latency'}
                    </div>
                    <div className="stat-value orange">
                        {loading && !stats ? '—' : formatLatency(stats?.averageLatency)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {language === 'es' ? 'tiempo medio de respuesta' : 'round-trip response time'}
                    </div>
                </div>
            </div>

            {/* ═══ Distributions Row: Providers, Models & Projects ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
                {/* Top Providers */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                        <Server size={13} style={{ color: 'var(--brand-orange)' }} />
                        {t('analytics.top_providers') || 'Provider Distribution'}
                    </div>
                    {topProviders.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No data</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {topProviders.map(p => (
                                <div key={p.provider}>
                                    <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <ProviderIcon provider={p.provider} size={14} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'capitalize' }}>
                                                {p.provider}
                                            </span>
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                            <span style={{ color: 'var(--brand-orange)', fontWeight: 700 }}>{formatNumber(p.requests)}</span> reqs ({p.pct}%)
                                        </div>
                                    </div>
                                    <div className="progress-bar" style={{ height: 6 }}>
                                        <div className="progress-fill" style={{ width: `${p.pct}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top Models */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                        <Cpu size={13} style={{ color: 'var(--brand-amber)' }} />
                        {t('analytics.top_models') || 'Top Models'}
                    </div>
                    {topModels.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No data</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {topModels.map(m => (
                                <div key={m.model}>
                                    <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                                        <span style={{
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: '0.76rem',
                                            color: 'var(--text-primary)',
                                            maxWidth: '65%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }} title={m.model}>
                                            {m.model}
                                        </span>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                            <span style={{ color: 'var(--brand-amber)', fontWeight: 700 }}>{formatNumber(m.requests)}</span> reqs ({m.pct}%)
                                        </div>
                                    </div>
                                    <div className="progress-bar" style={{ height: 6 }}>
                                        <div className="progress-fill" style={{ width: `${m.pct}%`, background: 'linear-gradient(90deg, var(--brand-amber), var(--brand-orange))' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top Projects */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                        <TrendingUp size={13} style={{ color: '#22c55e' }} />
                        {t('analytics.top_projects') || 'Project Activity'}
                    </div>
                    {topProjects.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No data</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {topProjects.map(proj => (
                                <div key={proj.id}>
                                    <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                                        <Link
                                            to={`/projects/${proj.id}`}
                                            style={{
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                color: 'var(--text-primary)',
                                                textDecoration: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                maxWidth: '65%',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title={proj.name}
                                        >
                                            <span>{proj.name}</span>
                                            <ExternalLink size={10} style={{ color: 'var(--text-muted)' }} />
                                        </Link>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                            <span style={{ color: '#22c55e', fontWeight: 700 }}>{formatNumber(proj.requests)}</span> reqs ({proj.pct}%)
                                        </div>
                                    </div>
                                    <div className="progress-bar" style={{ height: 6 }}>
                                        <div className="progress-fill" style={{ width: `${proj.pct}%`, background: 'linear-gradient(90deg, #10b981, #22c55e)' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ Filter Toolbar & Search Bar ═══ */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Search and Main Selects */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                        {/* Search Bar */}
                        <div style={{ flex: '2 1 240px', position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder={t('analytics.search_placeholder') || 'Search by model, provider, project, key, error...'}
                                value={searchQuery}
                                onChange={e => handleFilterChange(setSearchQuery, e.target.value)}
                                style={{
                                    width: '100%',
                                    paddingLeft: '2.25rem',
                                    marginBottom: 0,
                                    height: 38,
                                    fontSize: '0.84rem'
                                }}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => handleFilterChange(setSearchQuery, '')}
                                    style={{
                                        position: 'absolute',
                                        right: 10,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Project Filter */}
                        <div style={{ flex: '1 1 170px' }}>
                            <select
                                value={selectedProject}
                                onChange={e => handleFilterChange(setSelectedProject, e.target.value)}
                                style={{ width: '100%', marginBottom: 0, height: 38, fontSize: '0.82rem' }}
                            >
                                <option value="">{t('analytics.filter_all_projects') || 'All Projects'}</option>
                                {(data?.projects || []).map(p => (
                                    <option key={p.id} value={p.id}>📁 {p.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Billing Type Filter */}
                        <div style={{ flex: '1 1 140px' }}>
                            <select
                                value={selectedBilling}
                                onChange={e => handleFilterChange(setSelectedBilling, e.target.value)}
                                style={{ width: '100%', marginBottom: 0, height: 38, fontSize: '0.82rem' }}
                            >
                                <option value="">{t('analytics.billing_all') || 'All Rates'}</option>
                                <option value="free">⚡ {t('analytics.billing_free') || 'Free Tier'}</option>
                                <option value="paid">💳 {t('analytics.billing_paid') || 'Paid Tier'}</option>
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div style={{ flex: '1 1 140px' }}>
                            <select
                                value={selectedStatus}
                                onChange={e => handleFilterChange(setSelectedStatus, e.target.value)}
                                style={{ width: '100%', marginBottom: 0, height: 38, fontSize: '0.82rem' }}
                            >
                                <option value="">{t('analytics.status_all') || 'All Statuses'}</option>
                                <option value="success">🟢 {t('analytics.status_success') || 'Success (2xx)'}</option>
                                <option value="error">🔴 {t('analytics.status_error') || 'Errors (4xx/5xx)'}</option>
                            </select>
                        </div>

                        {/* Provider Filter */}
                        <div style={{ flex: '1 1 140px' }}>
                            <select
                                value={selectedProvider}
                                onChange={e => handleFilterChange(setSelectedProvider, e.target.value)}
                                style={{ width: '100%', marginBottom: 0, height: 38, fontSize: '0.82rem' }}
                            >
                                <option value="">{t('analytics.provider_all') || 'All Providers'}</option>
                                {availableProviders.map(pr => (
                                    <option key={pr} value={pr}>{pr.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>

                        {/* Page Size */}
                        <div style={{ width: 100 }}>
                            <select
                                value={pageSize}
                                onChange={e => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                style={{ width: '100%', marginBottom: 0, height: 38, fontSize: '0.82rem' }}
                            >
                                <option value={25}>25 / pág</option>
                                <option value={50}>50 / pág</option>
                                <option value={100}>100 / pág</option>
                                <option value={200}>200 / pág</option>
                            </select>
                        </div>

                        {/* Reset Filters */}
                        {(selectedProject || selectedBilling || selectedStatus || selectedProvider || searchQuery) && (
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="btn btn-secondary btn-sm"
                                style={{ height: 38, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <RotateCcw size={12} />
                                <span>{t('analytics.reset_filters') || 'Reset'}</span>
                            </button>
                        )}
                    </div>

                    {/* Filter Summary & Count Bar */}
                    <div className="flex justify-between items-center" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                            {language === 'es' ? (
                                <>Mostrando <strong>{startRecordIndex} - {endRecordIndex}</strong> de <strong>{formatNumber(totalFiltered)}</strong> llamadas coincidentes</>
                            ) : (
                                <>Showing <strong>{startRecordIndex} - {endRecordIndex}</strong> of <strong>{formatNumber(totalFiltered)}</strong> matching calls</>
                            )}
                        </div>

                        {/* Pagination mini buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.2rem 0.6rem', height: 28 }}
                            >
                                <ChevronLeft size={13} />
                            </button>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.2rem 0.6rem', height: 28 }}
                            >
                                <ChevronRight size={13} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Data Table ═══ */}
            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrapper" style={{ maxHeight: 620 }}>
                    <table className="data-table" style={{ margin: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-card)' }}>
                            <tr>
                                <th style={{ width: 140 }}>{t('analytics.table.time') || 'Time'}</th>
                                <th>{t('analytics.table.client_project') || 'Client Project'}</th>
                                <th>{t('analytics.table.upstream_channel') || 'Upstream Channel'}</th>
                                <th style={{ width: 95 }}>{t('analytics.table.billing') || 'Tier'}</th>
                                <th>{t('analytics.table.model') || 'Model'}</th>
                                <th style={{ width: 85 }}>{t('analytics.table.status') || 'Status'}</th>
                                <th style={{ width: 90 }}>{t('analytics.table.latency') || 'Latency'}</th>
                                <th style={{ width: 110 }}>{t('analytics.table.tokens') || 'Tokens'}</th>
                                <th style={{ width: 110 }}>{t('analytics.table.cost') || 'Cost'}</th>
                                <th style={{ width: 70, textAlign: 'center' }}>{t('analytics.table.actions') || 'Inspect'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && !data ? (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem', display: 'block', color: 'var(--brand-orange)' }} />
                                        <span>Cargando telemetría global...</span>
                                    </td>
                                </tr>
                            ) : (data?.recentLogs || []).length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                                        <Activity size={24} style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.4 }} />
                                        <span>{t('analytics.no_records') || 'No calls match the selected criteria'}</span>
                                    </td>
                                </tr>
                            ) : (
                                (data?.recentLogs || []).map(log => {
                                    const isSuccess = (log.status_code || 200) < 400;
                                    const is429 = log.status_code === 429;
                                    const isFree = log.billing_type === 'free';
                                    const lat = log.latency_ms || 0;
                                    const latColor = lat > 4000 ? '#ef4444' : lat > 1500 ? 'var(--brand-amber)' : 'var(--text-secondary)';

                                    return (
                                        <tr
                                            key={log.id}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setInspectingLog(log)}
                                            className="hover-row"
                                        >
                                            {/* Timestamp */}
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {formatDateTime(log.created_at)}
                                            </td>

                                            {/* Client Project */}
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                                        {log.project_name || 'Proyecto'}
                                                    </span>
                                                    {log.gateway_key_name && (
                                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                                            ({log.gateway_key_name})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Upstream Channel */}
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <ProviderIcon provider={log.provider || 'unknown'} size={13} />
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                        {log.upstream_project_name || log.provider || '—'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Tier / Billing */}
                                            <td>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 700,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    background: isFree ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
                                                    color: isFree ? '#22c55e' : '#60a5fa',
                                                    border: `1px solid ${isFree ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`
                                                }}>
                                                    {isFree ? '⚡ Gratis' : '💳 Pago'}
                                                </span>
                                            </td>

                                            {/* Model */}
                                            <td style={{ maxWidth: 190 }}>
                                                <span style={{
                                                    fontFamily: 'var(--font-mono)',
                                                    fontSize: '0.74rem',
                                                    color: 'var(--text-primary)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    display: 'block'
                                                }} title={log.model}>
                                                    {log.model}
                                                </span>
                                            </td>

                                            {/* Status Badge */}
                                            <td>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '0.12rem 0.45rem',
                                                    borderRadius: 'var(--radius-pill)',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    fontFamily: 'var(--font-mono)',
                                                    background: isSuccess
                                                        ? 'rgba(34,197,94,0.1)'
                                                        : is429
                                                            ? 'rgba(255,170,0,0.1)'
                                                            : 'rgba(239,68,68,0.1)',
                                                    color: isSuccess ? '#22c55e' : is429 ? 'var(--brand-amber)' : '#ef4444',
                                                    border: `1px solid ${isSuccess ? 'rgba(34,197,94,0.25)' : is429 ? 'rgba(255,170,0,0.25)' : 'rgba(239,68,68,0.25)'}`
                                                }}>
                                                    {log.status_code || (isSuccess ? 200 : 500)}
                                                </span>
                                            </td>

                                            {/* Latency */}
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: latColor, fontWeight: 600 }}>
                                                {formatLatency(log.latency_ms)}
                                            </td>

                                            {/* Tokens */}
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                {formatNumber(log.total_tokens || 0)}
                                            </td>

                                            {/* Cost / Savings */}
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: isFree ? '#22c55e' : 'var(--text-muted)' }}>
                                                {isFree ? `+$${Number(log.total_cost_usd || 0).toFixed(4)}` : formatCost(log.total_cost_usd)}
                                            </td>

                                            {/* Inspect Button */}
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setInspectingLog(log);
                                                    }}
                                                    className="btn btn-secondary btn-icon"
                                                    style={{ padding: '0.25rem', width: 26, height: 26 }}
                                                    title={t('analytics.inspector.title') || 'Inspect call'}
                                                >
                                                    <Eye size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Table Footer with Pagination Controls */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1.25rem',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'var(--surface-card)',
                    fontSize: '0.8rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                        Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage(1)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.25rem 0.65rem' }}
                        >
                            Primera
                        </button>
                        <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            <ChevronLeft size={13} /> Anterior
                        </button>
                        <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            Siguiente <ChevronRight size={13} />
                        </button>
                        <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(totalPages)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.25rem 0.65rem' }}
                        >
                            Última
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ Call Telemetry Inspector Modal ═══ */}
            {inspectingLog && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.72)',
                        backdropFilter: 'blur(5px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1050,
                        padding: '1rem',
                        animation: 'fadeIn 0.15s ease-out'
                    }}
                    onClick={() => setInspectingLog(null)}
                >
                    <div
                        className="glass-panel"
                        style={{
                            maxWidth: 760,
                            width: '100%',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: 0,
                            overflow: 'hidden',
                            borderRadius: '16px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'var(--surface-card)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '8px',
                                    background: 'rgba(255,107,43,0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--brand-orange)'
                                }}>
                                    <Activity size={16} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                                        {t('analytics.inspector.title') || 'Call Telemetry Inspector'}
                                    </h3>
                                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                        ID: {inspectingLog.id}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setInspectingLog(null)}
                                className="btn btn-secondary btn-icon"
                                style={{ width: 30, height: 30 }}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Error Banner if any */}
                            {inspectingLog.error_message && (
                                <div style={{
                                    padding: '0.9rem 1rem',
                                    borderRadius: '10px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#fca5a5'
                                }}>
                                    <div className="flex justify-between items-center" style={{ marginBottom: '0.35rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.82rem', color: '#ef4444' }}>
                                            <AlertCircle size={14} />
                                            {t('analytics.inspector.error_header') || 'Execution Error'}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(inspectingLog.error_message!, true)}
                                            className="btn btn-secondary btn-sm"
                                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                                        >
                                            {copiedError ? <Check size={11} /> : <Copy size={11} />}
                                            <span>{copiedError ? '¡Copiado!' : 'Copiar error'}</span>
                                        </button>
                                    </div>
                                    <pre style={{
                                        margin: 0,
                                        fontSize: '0.76rem',
                                        fontFamily: 'var(--font-mono)',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        background: 'rgba(0,0,0,0.2)',
                                        padding: '0.65rem',
                                        borderRadius: '6px'
                                    }}>
                                        {inspectingLog.error_message}
                                    </pre>
                                </div>
                            )}

                            {/* Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                                <div className="metric-mini" style={{ padding: '0.75rem 0.9rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                                        {t('analytics.inspector.created_at') || 'Timestamp'}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                        {formatDateTime(inspectingLog.created_at)}
                                    </div>
                                </div>

                                <div className="metric-mini" style={{ padding: '0.75rem 0.9rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                                        {t('analytics.inspector.client_project') || 'Client Project'}
                                    </div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {inspectingLog.project_name || '—'}
                                    </div>
                                </div>

                                <div className="metric-mini" style={{ padding: '0.75rem 0.9rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                                        {t('analytics.inspector.upstream_project') || 'Upstream Channel'}
                                    </div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        {inspectingLog.upstream_project_name || inspectingLog.provider || '—'}
                                    </div>
                                </div>

                                <div className="metric-mini" style={{ padding: '0.75rem 0.9rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                                        {t('analytics.inspector.model') || 'Requested Model'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-amber)', wordBreak: 'break-all' }}>
                                        {inspectingLog.model || '—'}
                                    </div>
                                </div>

                                <div className="metric-mini" style={{ padding: '0.75rem 0.9rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                                        {t('analytics.inspector.latency') || 'Latency'}
                                    </div>
                                    <div style={{ fontSize: '0.88rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-orange)' }}>
                                        {formatLatency(inspectingLog.latency_ms)}
                                    </div>
                                </div>

                                <div className="metric-mini" style={{ padding: '0.75rem 0.9rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                                        {t('analytics.inspector.cost_usd') || 'Cost (USD)'}
                                    </div>
                                    <div style={{ fontSize: '0.88rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                        {formatCost(inspectingLog.total_cost_usd)}
                                    </div>
                                </div>
                            </div>

                            {/* Token Consumption Card */}
                            <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                                <div className="section-label" style={{ marginBottom: '0.75rem' }}>
                                    <Cpu size={12} style={{ color: 'var(--brand-amber)' }} />
                                    {t('analytics.inspector.tokens_breakdown') || 'Token Consumption'}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
                                    <div style={{ padding: '0.6rem', borderRadius: 8, background: 'var(--surface-card)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Prompt (Input)</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                                            {formatNumber(inspectingLog.prompt_tokens || 0)}
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.6rem', borderRadius: 8, background: 'var(--surface-card)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Completion (Output)</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                                            {formatNumber(inspectingLog.completion_tokens || 0)}
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.6rem', borderRadius: 8, background: 'var(--surface-card)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Total Tokens</div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--brand-amber)' }}>
                                            {formatNumber(inspectingLog.total_tokens || 0)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Raw JSON View */}
                            <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)' }}>
                                <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                                    <div className="section-label" style={{ marginBottom: 0 }}>
                                        <Layers size={12} />
                                        {t('analytics.inspector.raw_json') || 'Raw Telemetry Payload'}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(JSON.stringify(inspectingLog, null, 2))}
                                        className="btn btn-secondary btn-sm"
                                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem' }}
                                    >
                                        {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                                        <span>{copiedJson ? (t('analytics.inspector.copied') || 'Copied!') : (t('analytics.inspector.copy_json') || 'Copy JSON')}</span>
                                    </button>
                                </div>
                                <pre style={{
                                    margin: 0,
                                    maxHeight: 180,
                                    overflowY: 'auto',
                                    fontSize: '0.72rem',
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--text-secondary)',
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    background: 'var(--bg-void)'
                                }}>
                                    {JSON.stringify(inspectingLog, null, 2)}
                                </pre>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '0.85rem 1.5rem',
                            borderTop: '1px solid var(--border-subtle)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            background: 'var(--surface-card)'
                        }}>
                            <button
                                type="button"
                                onClick={() => setInspectingLog(null)}
                                className="btn btn-secondary"
                            >
                                {t('analytics.inspector.close') || 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
