import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { fetchApi } from '../../api';

export interface Tenant {
    id: string;
    name: string;
    slug: string;
    tier: string;
    status: string;
}

export const TenantSwitcher: React.FC = () => {
    const { t } = useLanguage();
    const [tenants, setTenants] = useState<Tenant[]>([
        { id: '00000000-0000-0000-0000-000000000001', name: 'Default Organization', slug: 'default-org', tier: 'enterprise', status: 'active' }
    ]);
    const [activeTenant, setActiveTenant] = useState<Tenant>(() => {
        const saved = localStorage.getItem('activeTenant');
        if (saved) {
            try { return JSON.parse(saved); } catch (_) {}
        }
        return { id: '00000000-0000-0000-0000-000000000001', name: 'Default Organization', slug: 'default-org', tier: 'enterprise', status: 'active' };
    });
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let mounted = true;
        fetchApi('/aaa/tenants')
            .then(data => {
                if (mounted && data?.data && Array.isArray(data.data) && data.data.length > 0) {
                    setTenants(data.data);
                }
            })
            .catch(() => {});
        return () => { mounted = false; };
    }, []);

    const handleSelect = (tenant: Tenant) => {
        setActiveTenant(tenant);
        localStorage.setItem('activeTenant', JSON.stringify(tenant));
        setIsOpen(false);
    };

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.3rem 0.65rem',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                    background: 'var(--surface-card, rgba(15,23,42,0.6))',
                    color: 'var(--text-primary, #f8fafc)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
                title={t('aaa.tenant_select') || 'Select Organization'}
            >
                <Building2 size={13} style={{ color: '#38bdf8' }} />
                <span>{activeTenant.name}</span>
                <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '0.1rem 0.35rem',
                    borderRadius: '4px',
                    background: activeTenant.tier === 'enterprise' ? 'rgba(168,85,247,0.15)' : 'rgba(56,189,248,0.15)',
                    color: activeTenant.tier === 'enterprise' ? '#c084fc' : '#38bdf8',
                    border: `1px solid ${activeTenant.tier === 'enterprise' ? 'rgba(168,85,247,0.3)' : 'rgba(56,189,248,0.3)'}`
                }}>
                    {activeTenant.tier}
                </span>
                <ChevronDown size={11} style={{ opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {isOpen && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                        onClick={() => setIsOpen(false)}
                    />
                    <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        minWidth: '220px',
                        background: 'var(--card-bg, #0f172a)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '10px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5), 0 0 15px rgba(56,189,248,0.1)',
                        zIndex: 999,
                        padding: '0.4rem',
                        backdropFilter: 'blur(12px)',
                    }}>
                        <div style={{
                            padding: '0.35rem 0.5rem',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            color: 'var(--text-muted, #94a3b8)',
                            textTransform: 'uppercase',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                        }}>
                            <ShieldCheck size={11} /> {t('aaa.organizations') || 'Organizations'}
                        </div>
                        {tenants.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => handleSelect(t)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.45rem 0.6rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: t.id === activeTenant.id ? 'rgba(56,189,248,0.1)' : 'transparent',
                                    color: t.id === activeTenant.id ? '#38bdf8' : 'var(--text-primary, #f8fafc)',
                                    fontSize: '0.78rem',
                                    fontWeight: t.id === activeTenant.id ? 700 : 500,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.15s'
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Building2 size={13} style={{ opacity: 0.8 }} />
                                    {t.name}
                                </span>
                                {t.id === activeTenant.id && <Check size={13} style={{ color: '#38bdf8' }} />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
