import { useState, useEffect } from 'react';
import { fetchApi } from '../api';
import {
    Check, AlertCircle, RefreshCw, Save, ExternalLink, Play
} from 'lucide-react';
import { DualEngineGlyph, PromptAnchorGlyph, RateGuardianGlyph, ProviderIcon, RouterCascadeGlyph } from '../components/Icons';
import { useLanguage } from '../i18n';

interface EngineConfig {
    typesafeApiKey?: string;
    typesafeEndpoint?: string;
    typesafeModel?: string;
    enableJevRouting: boolean;
    managerProvider: string;
    managerApiKey?: string;
    managerModel?: string;
    managerBaseUrl?: string;
    managerTemperature: number;
    managerProjectId?: string;
    managerUpstreamKeyId?: string;
    fusionDefaultModels?: string[];
    fusionDefaultJudge?: string;
    fusionSlotProjects?: string[];
}

const PROVIDER_BASE_URLS: Record<string, string> = {
    google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    vertex: 'https://generativelanguage.googleapis.com/v1beta/openai',
    groq: 'https://api.groq.com/openai/v1',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    cerebras: 'https://api.cerebras.ai/v1',
    mistral: 'https://api.mistral.ai/v1',
    nvidia: 'https://integrate.api.nvidia.com/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    minimax: 'https://api.minimax.chat/v1',
    mimo: 'https://api.xiaomimimo.com/v1',
    puter: 'https://api.puter.com/v1',
};

export default function EngineSettings() {
    const { t } = useLanguage();
    const [config, setConfig] = useState<EngineConfig>({
        enableJevRouting: false,
        typesafeEndpoint: 'https://openrouter.ai/api/alpha/decisions',
        typesafeModel: '~typesafe/jev-latest',
        managerProvider: 'google',
        managerModel: 'gemini-2.5-flash',
        managerBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        managerTemperature: 0.2,
        managerProjectId: '',
        managerUpstreamKeyId: '',
        fusionDefaultModels: ['deepseek-chat', 'qwen/qwen3.8-27b', 'moonshotai/kimi-k3'],
        fusionDefaultJudge: 'deepseek-chat',
        fusionSlotProjects: ['', '', '', ''],
    });

    const [typesafeKeyInput, setTypesafeKeyInput] = useState('');
    const [managerKeyInput, setManagerKeyInput] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');
    const [saveError, setSaveError] = useState('');

    // Project & Upstream Key Providers
    const [projects, setProjects] = useState<any[]>([]);
    const [upstreamKeys, setUpstreamKeys] = useState<any[]>([]);
    const [apiModels, setApiModels] = useState<string[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [isCustomModel, setIsCustomModel] = useState(false);
    const [selectedSource, setSelectedSource] = useState<string>('');

    // Shared model cache per provider key
    const [modelsCache, setModelsCache] = useState<Record<string, string[]>>({});
    const [loadingKeyModels, setLoadingKeyModels] = useState<Record<string, boolean>>({});

    // Virtual Consensus Fusion Slots: 0: Draft A, 1: Draft B, 2: Draft C, 3: Judge
    const [fusionSlotKeys, setFusionSlotKeys] = useState<string[]>(['', '', '', '']);
    const [fusionSlotManual, setFusionSlotManual] = useState<boolean[]>([false, false, false, false]);

    // Testing states
    const [testingJev, setTestingJev] = useState(false);
    const [jevTestResult, setJevTestResult] = useState<any>(null);

    const [testingManager, setTestingManager] = useState(false);
    const [managerTestResult, setManagerTestResult] = useState<any>(null);

    // Auto-calibration
    const [calibrating, setCalibrating] = useState(false);
    const [calibrationResult, setCalibrationResult] = useState<any>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const fetchModelsForKey = async (sourceId: string): Promise<string[]> => {
        if (!sourceId) return [];
        if (modelsCache[sourceId] && modelsCache[sourceId].length > 0) {
            return modelsCache[sourceId];
        }
        setLoadingKeyModels(prev => ({ ...prev, [sourceId]: true }));
        try {
            let modelsList: string[] = [];
            if (sourceId.startsWith('project:')) {
                const projId = sourceId.replace('project:', '');
                // 1. Try project models endpoint
                try {
                    const projRes = await fetchApi(`/projects/${projId}/models`);
                    if (projRes?.models && Array.isArray(projRes.models) && projRes.models.length > 0) {
                        modelsList = projRes.models;
                    }
                } catch {}

                // 2. Query upstream keys of this project to get full available catalog
                const projKeys = upstreamKeys.filter((k: any) => k.project_id === projId);
                for (const pk of projKeys) {
                    try {
                        const res = await fetchApi(`/providers/${pk.id}/models`);
                        const kModels = (res?.models || []).map((m: any) => typeof m === 'string' ? m : m.id || m.name).filter(Boolean);
                        kModels.forEach((m: string) => {
                            if (!modelsList.includes(m)) modelsList.push(m);
                        });
                        if (modelsList.length > 0) break;
                    } catch {}
                }
            } else {
                const keyId = sourceId.replace('key:', '');
                const res = await fetchApi(`/providers/${keyId}/models`);
                modelsList = (res?.models || []).map((m: any) => typeof m === 'string' ? m : m.id || m.name).filter(Boolean);
            }

            setModelsCache(prev => ({ ...prev, [sourceId]: modelsList }));
            return modelsList;
        } catch (err) {
            console.warn(`[EngineSettings] Could not fetch models for source ${sourceId}:`, err);
            return [];
        } finally {
            setLoadingKeyModels(prev => ({ ...prev, [sourceId]: false }));
        }
    };

    const loadModelsForProvider = async (sourceId: string, currentModelToKeep?: string) => {
        if (!sourceId) return;
        setLoadingModels(true);
        try {
            const modelsList = await fetchModelsForKey(sourceId);
            setApiModels(modelsList);

            if (modelsList.length > 0) {
                const targetModel = currentModelToKeep || config.managerModel;
                if (targetModel) {
                    setConfig(prev => ({ ...prev, managerModel: targetModel }));
                    if (!modelsList.includes(targetModel)) {
                        setIsCustomModel(true);
                    }
                } else {
                    const preferred = modelsList.find((m: string) =>
                        m.includes('flash') || m.includes('mini') || m.includes('versatile') || m.includes('chat')
                    ) || modelsList[0];
                    setConfig(prev => ({ ...prev, managerModel: preferred }));
                }
            }
        } finally {
            setLoadingModels(false);
        }
    };

    const handleFusionSlotKeyChange = async (slotIndex: number, newKeyId: string) => {
        const updatedKeys = [...fusionSlotKeys];
        updatedKeys[slotIndex] = newKeyId;
        setFusionSlotKeys(updatedKeys);
        setConfig(prev => ({ ...prev, fusionSlotProjects: updatedKeys }));

        if (!newKeyId) return;

        const updatedManual = [...fusionSlotManual];
        updatedManual[slotIndex] = false;
        setFusionSlotManual(updatedManual);

        const models = await fetchModelsForKey(newKeyId);
        if (models.length > 0) {
            const currentVal = slotIndex === 3
                ? config.fusionDefaultJudge
                : (config.fusionDefaultModels?.[slotIndex] || '');

            if (!currentVal) {
                const preferred = models.find((m: string) =>
                    m.includes('flash') || m.includes('mini') || m.includes('chat') || m.includes('versatile')
                ) || models[0];

                if (slotIndex === 3) {
                    setConfig(prev => ({ ...prev, fusionDefaultJudge: preferred, fusionSlotProjects: updatedKeys }));
                } else {
                    setConfig(prev => {
                        const next = [...(prev.fusionDefaultModels || ['deepseek-chat', 'qwen/qwen3.8-27b', 'moonshotai/kimi-k3'])];
                        next[slotIndex] = preferred;
                        return { ...prev, fusionDefaultModels: next, fusionSlotProjects: updatedKeys };
                    });
                }
            }
        }
    };

    const handleApplyProjectToAllSlots = async (newKeyId: string) => {
        if (!newKeyId) return;
        const allFour = [newKeyId, newKeyId, newKeyId, newKeyId];
        setFusionSlotKeys(allFour);
        setFusionSlotManual([false, false, false, false]);

        const models = await fetchModelsForKey(newKeyId);
        if (models.length > 0) {
            setConfig(prev => {
                const m1 = models[0];
                const m2 = models[Math.min(1, models.length - 1)];
                const m3 = models[Math.min(2, models.length - 1)];
                const judge = models.find((m: string) => m.includes('pro') || m.includes('plus') || m.includes('chat')) || models[0];
                return {
                    ...prev,
                    fusionDefaultModels: [m1, m2, m3],
                    fusionDefaultJudge: judge,
                    fusionSlotProjects: allFour,
                };
            });
        } else {
            setConfig(prev => ({ ...prev, fusionSlotProjects: allFour }));
        }
    };

    const handleFusionModelSelect = (slotIndex: number, modelName: string) => {
        if (slotIndex === 3) {
            setConfig(prev => ({ ...prev, fusionDefaultJudge: modelName }));
        } else {
            setConfig(prev => {
                const next = [...(prev.fusionDefaultModels || ['deepseek-chat', 'qwen/qwen3.8-27b', 'moonshotai/kimi-k3'])];
                next[slotIndex] = modelName;
                return { ...prev, fusionDefaultModels: next };
            });
        }
    };

    const toggleFusionSlotManual = (slotIndex: number) => {
        const updated = [...fusionSlotManual];
        updated[slotIndex] = !updated[slotIndex];
        setFusionSlotManual(updated);
    };

    const loadConfig = async () => {
        try {
            setLoading(true);
            const [data, projectsData, providersData] = await Promise.all([
                fetchApi('/engine/config').catch(() => null),
                fetchApi('/projects').catch(() => []),
                fetchApi('/providers').catch(() => []),
            ]);

            setProjects(projectsData || []);
            setUpstreamKeys(providersData || []);

            if (data) {
                setConfig(data);
                if (data.typesafeApiKey) setTypesafeKeyInput(data.typesafeApiKey);
                if (data.managerApiKey) setManagerKeyInput(data.managerApiKey);

                if (data.managerProjectId && !data.managerUpstreamKeyId) {
                    setSelectedSource(`project:${data.managerProjectId}`);
                    const projKeys = (providersData || []).filter((k: any) => k.project_id === data.managerProjectId);
                    setManagerKeyInput(`🔄 Rotación activa (${projKeys.length} llaves en pool)`);
                    loadModelsForProvider(`project:${data.managerProjectId}`, data.managerModel);
                } else if (data.managerUpstreamKeyId) {
                    setSelectedSource(`key:${data.managerUpstreamKeyId}`);
                    loadModelsForProvider(`key:${data.managerUpstreamKeyId}`, data.managerModel);
                } else if (data.managerProjectId) {
                    setSelectedSource(`project:${data.managerProjectId}`);
                    loadModelsForProvider(`project:${data.managerProjectId}`, data.managerModel);
                } else {
                    setSelectedSource(`manual:${data.managerProvider || 'google'}`);
                }

                if (data.fusionSlotProjects && Array.isArray(data.fusionSlotProjects)) {
                    const normalized = data.fusionSlotProjects.map((src: string) => {
                        if (!src) return '';
                        if (src.startsWith('project:') || src.startsWith('key:')) return src;
                        if ((projectsData || []).some((p: any) => p.id === src)) return `project:${src}`;
                        return `key:${src}`;
                    });
                    setFusionSlotKeys(normalized);
                    normalized.forEach((src: string) => {
                        if (src) fetchModelsForKey(src);
                    });
                }

                if (data.fusionDefaultModels || data.fusionDefaultJudge) {
                    setFusionSlotManual([true, true, true, true]);
                }
            }
        } catch (err: any) {
            console.error('Failed to load engine config:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSourceChange = (newSource: string) => {
        setSelectedSource(newSource);

        if (newSource.startsWith('project:')) {
            const projId = newSource.replace('project:', '');
            const projKeys = upstreamKeys.filter((k: any) => k.project_id === projId);
            const targetKey = projKeys[0];
            const prov = targetKey?.provider || 'google';
            const baseUrl = PROVIDER_BASE_URLS[prov] || config.managerBaseUrl || 'https://api.openai.com/v1';

            setConfig(prev => ({
                ...prev,
                managerProvider: prov,
                managerBaseUrl: baseUrl,
                managerProjectId: projId,
                managerUpstreamKeyId: '', // ROTATION: empty upstream key id triggers pool rotation
            }));
            setManagerKeyInput(`🔄 Rotación activa (${projKeys.length} llaves en pool)`);
            loadModelsForProvider(newSource);
        } else if (newSource.startsWith('key:')) {
            const keyId = newSource.replace('key:', '');
            const targetKey = upstreamKeys.find((k: any) => k.id === keyId);
            if (targetKey) {
                const prov = targetKey.provider || 'google';
                const baseUrl = PROVIDER_BASE_URLS[prov] || config.managerBaseUrl || 'https://api.openai.com/v1';
                setConfig(prev => ({
                    ...prev,
                    managerProvider: prov,
                    managerBaseUrl: baseUrl,
                    managerProjectId: targetKey.project_id,
                    managerUpstreamKeyId: targetKey.id,
                }));
                setManagerKeyInput(targetKey.key_preview || '••••••••');
                loadModelsForProvider(newSource);
            }
        } else if (newSource.startsWith('manual:')) {
            const prov = newSource.replace('manual:', '');
            setConfig(prev => ({
                ...prev,
                managerProjectId: '',
                managerUpstreamKeyId: '',
            }));
            setApiModels([]);
            handleProviderPreset(prov);
        }
    };

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSaving(true);
        setSaveSuccess('');
        setSaveError('');

        try {
            const payload: any = {
                ...config,
            };
            if (typesafeKeyInput && !typesafeKeyInput.includes('••••') && !typesafeKeyInput.includes('...')) {
                payload.typesafeApiKey = typesafeKeyInput.trim();
            }
            if (!config.managerProjectId && !config.managerUpstreamKeyId && managerKeyInput && !managerKeyInput.includes('••••') && !managerKeyInput.includes('...') && !managerKeyInput.includes('🔄')) {
                payload.managerApiKey = managerKeyInput.trim();
            } else if (config.managerUpstreamKeyId || config.managerProjectId) {
                payload.managerApiKey = '';
            }

            const res = await fetchApi('/engine/config', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (res.success) {
                if (res.config) {
                    setConfig(prev => ({ ...prev, ...res.config }));
                }
                setSaveSuccess(t('engine.saved_success') || 'Engine configurations saved successfully!');
                setTimeout(() => setSaveSuccess(''), 4000);
            }
        } catch (err: any) {
            setSaveError(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const testJevConnection = async () => {
        setTestingJev(true);
        setJevTestResult(null);

        try {
            const body: any = {
                typesafeEndpoint: config.typesafeEndpoint,
                typesafeModel: config.typesafeModel,
            };
            if (typesafeKeyInput && !typesafeKeyInput.includes('••••') && !typesafeKeyInput.includes('...')) {
                body.typesafeApiKey = typesafeKeyInput.trim();
            }

            const res = await fetchApi('/engine/test/typesafe', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            setJevTestResult(res);
        } catch (err: any) {
            setJevTestResult({ ok: false, error: err.message });
        } finally {
            setTestingJev(false);
        }
    };

    const testManagerConnection = async () => {
        setTestingManager(true);
        setManagerTestResult(null);

        try {
            const body: any = {
                prompt: 'Ping check from TierMax Management Panel',
                managerProvider: config.managerProvider,
                managerModel: config.managerModel,
                managerBaseUrl: config.managerBaseUrl,
                managerUpstreamKeyId: config.managerUpstreamKeyId,
                managerTemperature: config.managerTemperature,
            };
            if (!config.managerUpstreamKeyId && managerKeyInput && !managerKeyInput.includes('••••') && !managerKeyInput.includes('...')) {
                body.managerApiKey = managerKeyInput.trim();
            }

            const res = await fetchApi('/engine/test/manager', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            setManagerTestResult(res);
        } catch (err: any) {
            setManagerTestResult({ ok: false, error: err.message });
        } finally {
            setTestingManager(false);
        }
    };

    const runAutoCalibration = async () => {
        setCalibrating(true);
        setCalibrationResult(null);

        try {
            const res = await fetchApi('/engine/calibrate', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            setCalibrationResult(res);
        } catch (err: any) {
            setCalibrationResult({ success: false, error: err.message });
        } finally {
            setCalibrating(false);
        }
    };

    const handleProviderPreset = (provider: string) => {
        const presets: Record<string, { model: string; baseUrl: string }> = {
            google: {
                model: 'gemini-2.5-flash',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            },
            groq: {
                model: 'llama-3.3-70b-versatile',
                baseUrl: 'https://api.groq.com/openai/v1',
            },
            openai: {
                model: 'gpt-4o-mini',
                baseUrl: 'https://api.openai.com/v1',
            },
            anthropic: {
                model: 'claude-3-5-haiku-20241022',
                baseUrl: 'https://api.anthropic.com/v1',
            },
            deepseek: {
                model: 'deepseek-chat',
                baseUrl: 'https://api.deepseek.com/v1',
            },
            openrouter: {
                model: 'google/gemini-2.0-flash-exp:free',
                baseUrl: 'https://openrouter.ai/api/v1',
            },
            custom: {
                model: config.managerModel || '',
                baseUrl: config.managerBaseUrl || '',
            },
        };

        const preset = presets[provider] || presets.google;
        setConfig(prev => ({
            ...prev,
            managerProvider: provider as any,
            managerModel: preset.model,
            managerBaseUrl: preset.baseUrl,
        }));
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: '0.75rem' }}>
                <span className="spinner-ring" style={{ width: 24, height: 24, borderWidth: 3 }} />
                <span>{t('engine.loading')}</span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <DualEngineGlyph size={24} color="var(--brand-orange)" />
                        {t('engine.title')}
                    </h1>
                    <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        {t('engine.subtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="btn btn-primary"
                        style={{ padding: '0.6rem 1.4rem', fontWeight: 700, gap: '0.5rem' }}
                    >
                        {saving ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
                        <span>{t('engine.save_config')}</span>
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {saveSuccess && (
                <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Check size={16} />
                    <span>{saveSuccess}</span>
                </div>
            )}
            {saveError && (
                <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <AlertCircle size={16} />
                    <span>{saveError}</span>
                </div>
            )}

            {/* Dual Engine Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.5rem' }}>
                {/* System 1: TypeSafe AI / Jev */}
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                        <div className="flex items-center gap-2">
                            <div style={{
                                width: 32, height: 32, borderRadius: 8, background: 'rgba(56,189,248,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8'
                            }}>
                                <PromptAnchorGlyph size={18} color="#38bdf8" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t('engine.system1_title')}</h3>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('engine.system1_badge')}</span>
                            </div>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                            <input
                                type="checkbox"
                                checked={config.enableJevRouting}
                                onChange={e => setConfig({ ...config, enableJevRouting: e.target.checked })}
                            />
                            <span>{t('engine.enable_toggle')}</span>
                        </label>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {t('engine.system1_desc')}
                    </p>

                    <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.78rem' }}>{t('engine.endpoint')}</label>
                        <input
                            type="text"
                            value={config.typesafeEndpoint || ''}
                            onChange={e => setConfig({ ...config, typesafeEndpoint: e.target.value })}
                            placeholder="https://openrouter.ai/api/alpha/decisions"
                            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.78rem' }}>{t('engine.model')}</label>
                            <input
                                type="text"
                                value={config.typesafeModel || ''}
                                onChange={e => setConfig({ ...config, typesafeModel: e.target.value })}
                                placeholder="~typesafe/jev-latest"
                                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                            />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.78rem' }}>{t('engine.api_key')}</label>
                            <input
                                type="password"
                                value={typesafeKeyInput}
                                onChange={e => setTypesafeKeyInput(e.target.value)}
                                placeholder={config.typesafeApiKey ? "••••••••••••••••" : "sk-or-v1-..."}
                                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2" style={{ marginTop: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={testJevConnection}
                            disabled={testingJev}
                            className="btn btn-secondary"
                            style={{ flex: 1, justifyContent: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
                        >
                            {testingJev ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                            <span>{t('engine.test_jev')}</span>
                        </button>

                        <a
                            href="https://openrouter.ai/~typesafe/jev-latest"
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem 0.75rem', gap: '0.3rem', fontSize: '0.82rem', textDecoration: 'none' }}
                        >
                            <ExternalLink size={14} />
                            <span>Docs</span>
                        </a>
                    </div>

                    {jevTestResult && (
                        <div style={{
                            padding: '0.75rem', borderRadius: 6, fontSize: '0.78rem',
                            background: jevTestResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${jevTestResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        }}>
                            <div style={{ fontWeight: 700, color: jevTestResult.ok ? '#22c55e' : '#ef4444' }}>
                                {jevTestResult.ok ? `Connected (${jevTestResult.latencyMs}ms)` : 'Connection Error'}
                            </div>
                            <div style={{ marginTop: '0.3rem', color: 'var(--text-muted)' }}>
                                {jevTestResult.ok ? `Route: ${jevTestResult.classification?.action || 'FORWARD'} · Score: ${jevTestResult.classification?.confidence || '1.0'}` : jevTestResult.error}
                            </div>
                        </div>
                    )}
                </div>

                {/* System 2: Management LLM */}
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                        <div className="flex items-center gap-2">
                            <div style={{
                                width: 32, height: 32, borderRadius: 8, background: 'rgba(255,107,43,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-orange)'
                            }}>
                                <ProviderIcon provider={config.managerProvider} size={18} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t('engine.system2_title')}</h3>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Background Orchestration & Diagnostics</span>
                            </div>
                        </div>

                        <span className="badge badge-healthy" style={{ fontSize: '0.7rem' }}>
                            Self-Healing
                        </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {t('engine.system2_desc')} Evaluates free-tier limits, audits logs, and advises on optimal token limits.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Source / Provider Selector */}
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{t('engine.source_label')}</span>
                                {config.managerUpstreamKeyId && (
                                    <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>
                                        ✓ {t('engine.key_linked_project')}
                                    </span>
                                )}
                            </label>
                            <select
                                value={selectedSource}
                                onChange={e => handleSourceChange(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                            >
                                <optgroup label={`📂 ${t('engine.source_projects_pool') || 'Proyectos (Pool con Rotación Automática)'}`}>
                                    {projects.map((proj: any) => {
                                        const projKeys = upstreamKeys.filter((k: any) => k.project_id === proj.id);
                                        if (projKeys.length === 0) {
                                            return (
                                                <option key={`proj:${proj.id}`} value={`project:${proj.id}`}>
                                                    📂 {proj.name} (Sin canales activos)
                                                </option>
                                            );
                                        }
                                        const prov = projKeys[0]?.provider?.toUpperCase() || 'CANAL';
                                        return (
                                            <option key={`proj:${proj.id}`} value={`project:${proj.id}`}>
                                                📂 {proj.name} · {prov} ({projKeys.length} {projKeys.length === 1 ? 'llave' : 'llaves con rotación'})
                                            </option>
                                        );
                                    })}
                                </optgroup>
                                <optgroup label={`🔑 ${t('engine.source_individual_keys') || 'Llaves Individuales (Fijas sin rotación)'}`}>
                                    {projects.map((proj: any) => {
                                        const projKeys = upstreamKeys.filter((k: any) => k.project_id === proj.id);
                                        return projKeys.map((k: any, idx: number) => (
                                            <option key={`key:${k.id}`} value={`key:${k.id}`}>
                                                ↳ {proj.name} · {k.provider.toUpperCase()} #{idx + 1} ({k.key_preview || 'Llave'})
                                            </option>
                                        ));
                                    })}
                                </optgroup>
                                <optgroup label={`⚙️ ${t('engine.source_manual_optgroup')}`}>
                                    <option value="manual:google">Google Gemini Directo</option>
                                    <option value="manual:groq">Groq Directo</option>
                                    <option value="manual:openai">OpenAI Directo</option>
                                    <option value="manual:deepseek">DeepSeek Directo</option>
                                    <option value="manual:openrouter">OpenRouter Directo</option>
                                    <option value="manual:custom">Custom Provider URL</option>
                                </optgroup>
                            </select>
                        </div>

                        {/* Model Name / Dynamic API Model Selector */}
                        <div className="form-group" style={{ margin: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <label style={{ fontSize: '0.78rem', margin: 0 }}>
                                    {t('engine.manager_model')} {apiModels.length > 0 && (
                                        <span style={{ color: 'var(--brand-orange)', fontWeight: 600 }}>
                                            ({apiModels.length} {t('engine.models_available')})
                                        </span>
                                    )}
                                </label>
                                {apiModels.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setIsCustomModel(!isCustomModel)}
                                        style={{
                                            background: 'none', border: 'none', color: 'var(--brand-orange)',
                                            fontSize: '0.72rem', cursor: 'pointer', padding: 0, textDecoration: 'underline'
                                        }}
                                    >
                                        {isCustomModel ? t('engine.select_model_toggle') : t('engine.manual_model_toggle')}
                                    </button>
                                )}
                            </div>

                            {loadingModels ? (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
                                    background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                                    fontSize: '0.82rem', color: 'var(--text-muted)'
                                }}>
                                    <RefreshCw size={14} className="spin" style={{ color: 'var(--brand-orange)' }} />
                                    <span>{t('engine.loading_models')}</span>
                                </div>
                            ) : apiModels.length > 0 && !isCustomModel ? (
                                <select
                                    value={config.managerModel || ''}
                                    onChange={e => setConfig(c => ({ ...c, managerModel: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                                >
                                    {apiModels.map((m: string) => (
                                        <option key={m} value={m}>
                                            {m}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={config.managerModel || ''}
                                    onChange={e => setConfig(c => ({ ...c, managerModel: e.target.value }))}
                                    placeholder="ej. gemini-2.5-flash o llama-3.3-70b-versatile"
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{t('engine.manager_key')}</span>
                            {config.managerUpstreamKeyId && (
                                <span style={{ fontSize: '0.7rem', color: '#10b981' }}>
                                    🔒 {t('engine.key_linked_project')}
                                </span>
                            )}
                        </label>
                        <input
                            type="password"
                            value={config.managerUpstreamKeyId ? (managerKeyInput || '••••••••••••••••') : managerKeyInput}
                            onChange={e => setManagerKeyInput(e.target.value)}
                            placeholder={config.managerUpstreamKeyId ? "🔒 Llave vinculada y protegida en el servidor" : "AIzaSy•••••••• or gsk_••••••••"}
                            disabled={!!config.managerUpstreamKeyId}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.85rem',
                                opacity: config.managerUpstreamKeyId ? 0.75 : 1,
                                cursor: config.managerUpstreamKeyId ? 'not-allowed' : 'text'
                            }}
                        />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.78rem' }}>{t('engine.manager_base_url')}</label>
                        <input
                            type="text"
                            value={config.managerBaseUrl || ''}
                            onChange={e => setConfig(c => ({ ...c, managerBaseUrl: e.target.value }))}
                            placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
                            style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                        />
                    </div>

                    {/* Test & Auto-Calibrate actions */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={testManagerConnection}
                            disabled={testingManager}
                            className="btn btn-secondary"
                            style={{ justifyContent: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
                        >
                            {testingManager ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                            <span>{t('engine.test_manager')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={runAutoCalibration}
                            disabled={calibrating}
                            className="btn btn-secondary"
                            style={{
                                justifyContent: 'center', gap: '0.4rem', fontSize: '0.82rem',
                                borderColor: 'rgba(255,107,43,0.3)', color: 'var(--brand-orange)'
                            }}
                        >
                            {calibrating ? <RefreshCw size={14} className="spin" /> : <RateGuardianGlyph size={14} color="var(--brand-orange)" />}
                            <span>Auto-Calibrate Quotas</span>
                        </button>
                    </div>

                    {managerTestResult && (
                        <div style={{
                            padding: '0.75rem', borderRadius: 6, fontSize: '0.78rem',
                            background: managerTestResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${managerTestResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        }}>
                            <div style={{ fontWeight: 700, color: managerTestResult.ok ? '#22c55e' : '#ef4444' }}>
                                {managerTestResult.ok ? `Connected (${managerTestResult.latencyMs}ms)` : 'Connection Error'}
                            </div>
                            <div style={{ marginTop: '0.3rem', color: 'var(--text-muted)' }}>
                                {managerTestResult.ok ? managerTestResult.reply : managerTestResult.error}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* System 3: Virtual Consensus Fusion Configuration (3 Fixed LLMs + Judge) */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div className="flex items-center gap-2">
                        <div style={{
                            width: 32, height: 32, borderRadius: 8, background: 'rgba(192,132,252,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc'
                        }}>
                            <RouterCascadeGlyph size={18} color="#c084fc" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t('engine.fusion_title') || 'Virtual Consensus Fusion · Panel Fijo de 3 Modelos & Juez'}</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('engine.fusion_subtitle') || 'Configuración fija predeterminada para model: "fusion"'}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setConfig({
                                    ...config,
                                    fusionDefaultModels: ['deepseek-chat', 'qwen/qwen3.8-27b', 'meta/llama-3.3-70b-instruct'],
                                    fusionDefaultJudge: 'deepseek-chat'
                                });
                                setFusionSlotManual([true, true, true, true]);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                            title="Terna de alto razonamiento lógico y código"
                        >
                            🧠 Reasoning Trio
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setConfig({
                                    ...config,
                                    fusionDefaultModels: ['gemini-2.5-flash', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile'],
                                    fusionDefaultJudge: 'gemini-2.5-flash'
                                });
                                setFusionSlotManual([true, true, true, true]);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                            title="Terna de alta velocidad para capas gratuitas"
                        >
                            ⚡ Speed & Free
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setConfig({
                                    ...config,
                                    fusionDefaultModels: ['deepseek-chat', 'moonshotai/kimi-k3', 'minimaxai/minimax-m3'],
                                    fusionDefaultJudge: 'deepseek-chat'
                                });
                                setFusionSlotManual([true, true, true, true]);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                            title="Terna multi-proveedor asiático de frontera"
                        >
                            🌐 Frontier Mix
                        </button>
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 6,
                    border: '1px solid var(--border-subtle)'
                }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4, flex: 1, minWidth: 280 }}>
                        {t('engine.fusion_desc') || 'Define la terna de 3 modelos LLM que competirán en paralelo para generar borradores y el modelo árbitro (Juez) que sintetizará la respuesta definitiva.'}
                    </p>
                    <div className="flex items-center gap-2" style={{ fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            ⚡ {t('engine.fusion_apply_all') || 'Cargar proyecto en toda la terna'}:
                        </span>
                        <select
                            onChange={e => {
                                if (e.target.value) {
                                    handleApplyProjectToAllSlots(e.target.value);
                                }
                            }}
                            defaultValue=""
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', maxWidth: 260 }}
                        >
                            <option value="">-- {t('engine.source_projects_pool') || 'Seleccionar Proyecto (Pool)'} --</option>
                            {projects.map((proj: any) => {
                                const projKeys = upstreamKeys.filter((k: any) => k.project_id === proj.id);
                                if (projKeys.length === 0) return null;
                                const prov = projKeys[0]?.provider?.toUpperCase() || 'CANAL';
                                return (
                                    <option key={`apply:${proj.id}`} value={`project:${proj.id}`}>
                                        📂 {proj.name} ({prov} · {projKeys.length} {projKeys.length === 1 ? 'llave' : 'llaves'})
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                    {[
                        { label: t('engine.fusion_slot_draft_a') || 'Modelo Contendiente 1 (Draft A)', color: '#38bdf8', placeholder: 'deepseek-chat', isJudge: false, index: 0 },
                        { label: t('engine.fusion_slot_draft_b') || 'Modelo Contendiente 2 (Draft B)', color: '#ff6b2b', placeholder: 'qwen/qwen3.8-27b', isJudge: false, index: 1 },
                        { label: t('engine.fusion_slot_draft_c') || 'Modelo Contendiente 3 (Draft C)', color: '#22c55e', placeholder: 'moonshotai/kimi-k3', isJudge: false, index: 2 },
                        { label: t('engine.fusion_slot_judge') || 'Modelo Juez (Synthesizer Arbiter)', color: '#c084fc', placeholder: 'deepseek-chat', isJudge: true, index: 3 },
                    ].map((slot) => {
                        const i = slot.index;
                        const currentModel = slot.isJudge
                            ? (config.fusionDefaultJudge || '')
                            : (config.fusionDefaultModels?.[i] || '');
                        const selectedKey = fusionSlotKeys[i] || '';
                        const isManual = fusionSlotManual[i];
                        const slotModels = selectedKey ? (modelsCache[selectedKey] || []) : [];
                        const isLoadingModels = Boolean(selectedKey && loadingKeyModels[selectedKey]);

                        return (
                            <div
                                key={i}
                                style={{
                                    background: 'var(--surface-1)',
                                    border: slot.isJudge ? '1px solid rgba(192,132,252,0.35)' : '1px solid var(--border-subtle)',
                                    borderRadius: 8,
                                    padding: '0.85rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.65rem'
                                }}
                            >
                                {/* Slot Header */}
                                <div className="flex items-center justify-between">
                                    <label style={{
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        color: slot.isJudge ? '#c084fc' : undefined,
                                        margin: 0
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: slot.color }} />
                                        {slot.label}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => toggleFusionSlotManual(i)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--brand-orange)',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            padding: 0,
                                            textDecoration: 'underline'
                                        }}
                                    >
                                        {isManual ? (t('engine.select_model_toggle') || 'Seleccionar de lista') : (t('engine.manual_model_toggle') || 'Escribir manual')}
                                    </button>
                                </div>

                                {/* Project / Channel selector (shown when not in manual mode) */}
                                {!isManual && (
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                                            {t('engine.channel_label') || 'Proyecto / Canal'}:
                                        </span>
                                        <select
                                            value={selectedKey}
                                            onChange={e => handleFusionSlotKeyChange(i, e.target.value)}
                                            style={{ width: '100%', padding: '0.38rem 0.5rem', fontSize: '0.78rem' }}
                                        >
                                            <option value="">-- {t('engine.source_projects_pool') || 'Seleccionar Canal / Pool'} --</option>
                                            <optgroup label={`📂 ${t('engine.source_projects_pool') || 'Proyectos (Pool con Rotación Automática)'}`}>
                                                {projects.map((proj: any) => {
                                                    const projKeys = upstreamKeys.filter((k: any) => k.project_id === proj.id);
                                                    if (projKeys.length === 0) return null;
                                                    const prov = projKeys[0]?.provider?.toUpperCase() || 'CANAL';
                                                    return (
                                                        <option key={`fproj:${proj.id}`} value={`project:${proj.id}`}>
                                                            📂 {proj.name} · {prov} ({projKeys.length} {projKeys.length === 1 ? 'llave' : 'llaves con rotación'})
                                                        </option>
                                                    );
                                                })}
                                            </optgroup>
                                            <optgroup label={`🔑 ${t('engine.source_individual_keys') || 'Llaves Individuales (Fijas sin rotación)'}`}>
                                                {projects.map((proj: any) => {
                                                    const projKeys = upstreamKeys.filter((k: any) => k.project_id === proj.id);
                                                    return projKeys.map((k: any, idx: number) => (
                                                        <option key={`fkey:${k.id}`} value={`key:${k.id}`}>
                                                            ↳ {proj.name} · {k.provider.toUpperCase()} #{idx + 1} ({k.key_preview || 'Llave'})
                                                        </option>
                                                    ));
                                                })}
                                            </optgroup>
                                        </select>
                                    </div>
                                )}

                                {/* Model Selector or Input */}
                                <div className="form-group" style={{ margin: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                            {t('engine.manager_model') || 'Modelo'}:
                                        </span>
                                        {slotModels.length > 0 && !isManual && (
                                            <span style={{ fontSize: '0.66rem', color: 'var(--brand-orange)', fontWeight: 600 }}>
                                                ({slotModels.length} {t('engine.models_available') || 'disponibles'})
                                            </span>
                                        )}
                                    </div>

                                    {isLoadingModels ? (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.5rem',
                                            background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                                            fontSize: '0.75rem', color: 'var(--text-muted)'
                                        }}>
                                            <RefreshCw size={12} className="spin" style={{ color: 'var(--brand-orange)' }} />
                                            <span>{t('engine.loading_models') || 'Cargando modelos...'}</span>
                                        </div>
                                    ) : !isManual && slotModels.length > 0 ? (
                                        <select
                                            value={currentModel}
                                            onChange={e => handleFusionModelSelect(i, e.target.value)}
                                            style={{
                                                width: '100%', padding: '0.38rem 0.5rem', fontSize: '0.8rem',
                                                fontFamily: 'var(--font-mono)',
                                                borderColor: slot.isJudge ? 'rgba(192,132,252,0.4)' : undefined
                                            }}
                                        >
                                            {currentModel && !slotModels.includes(currentModel) && (
                                                <option value={currentModel}>{currentModel} (actual)</option>
                                            )}
                                            {slotModels.map((m: string) => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={currentModel}
                                            onChange={e => handleFusionModelSelect(i, e.target.value)}
                                            placeholder={slot.placeholder}
                                            style={{
                                                width: '100%', padding: '0.38rem 0.5rem', fontSize: '0.8rem',
                                                fontFamily: 'var(--font-mono)',
                                                borderColor: slot.isJudge ? 'rgba(192,132,252,0.4)' : undefined
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Calibration Results Panel */}
            {calibrationResult && (
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: '1rem' }}>
                            <RateGuardianGlyph size={18} color="var(--brand-orange)" />
                            <span>{t('engine.calibrated_title')}</span>
                        </div>
                        {calibrationResult.latencyMs && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Calibrated in {calibrationResult.latencyMs}ms
                            </span>
                        )}
                    </div>

                    {calibrationResult.success && Array.isArray(calibrationResult.recommendations) ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                                        <th style={{ padding: '0.6rem' }}>{t('engine.col_provider')}</th>
                                        <th style={{ padding: '0.6rem' }}>{t('engine.col_rpm')}</th>
                                        <th style={{ padding: '0.6rem' }}>{t('engine.col_tpm')}</th>
                                        <th style={{ padding: '0.6rem' }}>{t('engine.col_rpd')}</th>
                                        <th style={{ padding: '0.6rem' }}>{t('engine.col_rationale')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {calibrationResult.recommendations.map((rec: any, idx: number) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            <td style={{ padding: '0.6rem', fontWeight: 700 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                    <ProviderIcon provider={rec.provider} size={15} />
                                                    <span style={{ textTransform: 'capitalize' }}>{rec.provider}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem', fontFamily: 'var(--font-mono)', color: '#22c55e' }}>
                                                {rec.recommended_rpm} RPM
                                            </td>
                                            <td style={{ padding: '0.6rem', fontFamily: 'var(--font-mono)' }}>
                                                {rec.recommended_tpm?.toLocaleString()} TPM
                                            </td>
                                            <td style={{ padding: '0.6rem', fontFamily: 'var(--font-mono)' }}>
                                                {rec.recommended_rpd?.toLocaleString()} RPD
                                            </td>
                                            <td style={{ padding: '0.6rem', color: 'var(--text-muted)' }}>
                                                {rec.rationale}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="alert alert-error">
                            {calibrationResult.error || 'Failed to calibrate free tier limits'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
