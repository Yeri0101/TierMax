import React, { useState, useEffect } from "react";
import { 
    Settings, 
    X, 
    Globe, 
    Sun, 
    Moon, 
    KeyRound, 
    LogOut, 
    Server, 
    ChevronDown, 
    Database, 
    User,
    Check,
    Sliders,
    Layers
} from "lucide-react";
import { useLanguage } from "../i18n";
import { TenantSwitcher } from "./aaa/TenantSwitcher";

interface NavbarSettingsMenuProps {
    dbMode: { is_local: boolean; db_type: string } | null;
    onOpenWelcomeModal: () => void;
    onOpenPasswordModal: () => void;
    onLogout: () => void;
    theme: "dark" | "light";
    toggleTheme: () => void;
    language: "en" | "es";
    toggleLanguage: () => void;
    username: string;
}

export const NavbarSettingsMenu: React.FC<NavbarSettingsMenuProps> = ({
    dbMode,
    onOpenWelcomeModal,
    onOpenPasswordModal,
    onLogout,
    theme,
    toggleTheme,
    language,
    toggleLanguage,
    username,
}) => {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    // Close on ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    // Prevent body scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    return (
        <>
            {/* Trigger Button in Navbar */}
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={`btn btn-secondary ${isOpen ? "active" : ""}`}
                title={t("nav.settings") || "Ajustes"}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.4rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "var(--radius-pill)",
                    background: isOpen ? "var(--surface-hover)" : "var(--surface-card)",
                    border: `1px solid ${isOpen ? "var(--border-default)" : "var(--border-subtle)"}`,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                }}
            >
                <Settings 
                    size={14} 
                    style={{ 
                        color: "var(--text-secondary)", 
                        transform: isOpen ? "rotate(45deg)" : "none", 
                        transition: "transform 0.25s ease, color 0.2s" 
                    }} 
                />
                <span>{t("nav.settings") || "Ajustes"}</span>
                <ChevronDown 
                    size={11} 
                    style={{ 
                        opacity: 0.7, 
                        transform: isOpen ? "rotate(180deg)" : "none", 
                        transition: "transform 0.2s" 
                    }} 
                />
            </button>

            {/* Centered Modal Overlay (Occupies ~50% of screen, well centered and lower) */}
            {isOpen && (
                <div
                    className="settings-modal-backdrop"
                    onClick={() => setIsOpen(false)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.72)",
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2500,
                        padding: "3.5rem 1.25rem 2rem 1.25rem",
                        overflowY: "auto",
                        animation: "fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                >
                    <div
                        className="settings-modal-dialog"
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: "680px",
                            margin: "auto",
                            marginTop: "1.25rem",
                            background: "var(--surface-card)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "16px",
                            boxShadow: "var(--shadow-lg), 0 25px 60px -12px rgba(0, 0, 0, 0.65)",
                            padding: "1.25rem 1.5rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.9rem",
                            animation: "fadeInScale 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                            maxHeight: "calc(100vh - 5.5rem)",
                            overflowY: "auto",
                        }}
                    >
                        {/* Header: Title, Subtitle, Close */}
                        <div style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            paddingBottom: "0.75rem",
                            borderBottom: "1px solid var(--border-subtle)",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: "10px",
                                    background: "var(--surface-2)",
                                    border: "1px solid var(--border-default)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "var(--text-primary)",
                                    flexShrink: 0
                                }}>
                                    <Sliders size={18} />
                                </div>
                                <div>
                                    <h2 style={{ 
                                        fontSize: "1.12rem", 
                                        fontWeight: 800, 
                                        color: "var(--text-primary)", 
                                        margin: 0,
                                        letterSpacing: "-0.01em"
                                    }}>
                                        {t("nav.settings_menu") || "Sistema y Preferencias"}
                                    </h2>
                                    <p style={{ 
                                        fontSize: "0.78rem", 
                                        color: "var(--text-secondary)", 
                                        margin: "0.15rem 0 0 0" 
                                    }}>
                                        TierMax SOAT Gateway • Panel de Control & Preferencias
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                style={{
                                    background: "var(--surface-2)",
                                    border: "1px solid var(--border-subtle)",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    padding: "0.45rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.15s ease",
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.color = "var(--text-primary)";
                                    e.currentTarget.style.borderColor = "var(--border-default)";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.color = "var(--text-secondary)";
                                    e.currentTarget.style.borderColor = "var(--border-subtle)";
                                }}
                                title="Cerrar (Esc)"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* User Identity & System State Bar */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.55rem 0.85rem",
                            background: "var(--surface-2)",
                            borderRadius: "10px",
                            border: "1px solid var(--border-subtle)",
                            flexWrap: "wrap",
                            gap: "0.6rem"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                                <div style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: "50%",
                                    background: "var(--surface-card)",
                                    border: "1px solid var(--border-default)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "var(--text-primary)"
                                }}>
                                    <User size={15} />
                                </div>
                                <div>
                                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                        {username || "Admin"}
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                                        Administrador del Sistema
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                {dbMode && (
                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.4rem",
                                        padding: "0.3rem 0.75rem",
                                        borderRadius: "var(--radius-pill)",
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                        background: "var(--surface-card)",
                                        border: "1px solid var(--border-default)",
                                        color: "var(--text-primary)",
                                    }}>
                                        <Database size={13} style={{ color: "#22c55e" }} />
                                        <span>{dbMode.is_local ? "SQLite Local" : "Supabase Cloud"}</span>
                                    </div>
                                )}
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    padding: "0.3rem 0.65rem",
                                    borderRadius: "var(--radius-pill)",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    background: "rgba(34, 197, 94, 0.12)",
                                    border: "1px solid rgba(34, 197, 94, 0.3)",
                                    color: "#22c55e",
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                                    ONLINE
                                </div>
                            </div>
                        </div>

                        {/* Spacious Two-Column Grid for Options */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
                            gap: "0.85rem",
                        }}>
                            {/* Column 1: Workspace & Server */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                {/* Organization / Tenant */}
                                <div style={{
                                    background: "var(--surface-card)",
                                    border: "1px solid var(--border-default)",
                                    borderRadius: "12px",
                                    padding: "0.85rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                        <Layers size={14} style={{ color: "var(--text-secondary)" }} />
                                        <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                                            {t("nav.org_env") || "Organización & Entorno"}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: 0 }}>
                                        Selecciona el espacio de trabajo o inquilino multi-tenant actual.
                                    </p>
                                    <div style={{ marginTop: "0.15rem" }}>
                                        <TenantSwitcher />
                                    </div>
                                </div>

                                {/* Server Startup Guide */}
                                <div style={{
                                    background: "var(--surface-card)",
                                    border: "1px solid var(--border-default)",
                                    borderRadius: "12px",
                                    padding: "0.85rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                        <Server size={14} style={{ color: "var(--text-secondary)" }} />
                                        <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                                            {t("nav.server_guide") || "Servidor & Guía"}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: 0 }}>
                                        Consulta comandos de inicio de backend, frontend, puertos de escucha y scripts de soporte.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsOpen(false);
                                            onOpenWelcomeModal();
                                        }}
                                        className="btn btn-secondary"
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            width: "100%",
                                            padding: "0.5rem 0.8rem",
                                            fontSize: "0.8rem",
                                            fontWeight: 600,
                                            marginTop: "0.15rem"
                                        }}
                                    >
                                        <span style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                            <Server size={14} />
                                            {t("nav.how_to_start") || "¿Cómo iniciar servidor?"}
                                        </span>
                                        <span style={{
                                            fontSize: "0.68rem",
                                            padding: "0.15rem 0.45rem",
                                            borderRadius: "4px",
                                            background: "var(--surface-2)",
                                            border: "1px solid var(--border-subtle)",
                                            color: "var(--text-secondary)",
                                            fontWeight: 700
                                        }}>
                                            Guía
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Column 2: System Preferences (Language & Theme) */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                {/* Language */}
                                <div style={{
                                    background: "var(--surface-card)",
                                    border: "1px solid var(--border-default)",
                                    borderRadius: "12px",
                                    padding: "0.85rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                        <Globe size={14} style={{ color: "var(--text-secondary)" }} />
                                        <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                                            {t("nav.language") || "Idioma del Sistema"}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: 0 }}>
                                        Idioma de la interfaz de usuario y mensajes del sistema.
                                    </p>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.2rem" }}>
                                        <button
                                            type="button"
                                            onClick={() => { if (language !== "en") toggleLanguage(); }}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "0.45rem",
                                                padding: "0.55rem",
                                                borderRadius: "8px",
                                                border: `1px solid ${language === "en" ? "var(--text-primary)" : "var(--border-subtle)"}`,
                                                background: language === "en" ? "var(--surface-2)" : "var(--surface-card)",
                                                color: "var(--text-primary)",
                                                fontSize: "0.8rem",
                                                fontWeight: language === "en" ? 700 : 500,
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            <span>English (US)</span>
                                            {language === "en" && <Check size={13} style={{ color: "#22c55e" }} />}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => { if (language !== "es") toggleLanguage(); }}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "0.45rem",
                                                padding: "0.55rem",
                                                borderRadius: "8px",
                                                border: `1px solid ${language === "es" ? "var(--text-primary)" : "var(--border-subtle)"}`,
                                                background: language === "es" ? "var(--surface-2)" : "var(--surface-card)",
                                                color: "var(--text-primary)",
                                                fontSize: "0.8rem",
                                                fontWeight: language === "es" ? 700 : 500,
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            <span>Español (ES)</span>
                                            {language === "es" && <Check size={13} style={{ color: "#22c55e" }} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Theme Mode */}
                                <div style={{
                                    background: "var(--surface-card)",
                                    border: "1px solid var(--border-default)",
                                    borderRadius: "12px",
                                    padding: "0.85rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                        {theme === "dark" ? <Moon size={14} style={{ color: "var(--text-secondary)" }} /> : <Sun size={14} style={{ color: "var(--brand-amber)" }} />}
                                        <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                                            {t("nav.theme") || "Tema de Interfaz"}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: 0 }}>
                                        Alterna entre el modo oscuro de alto contraste y el modo claro.
                                    </p>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.15rem" }}>
                                        <button
                                            type="button"
                                            onClick={() => { if (theme !== "dark") toggleTheme(); }}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "0.45rem",
                                                padding: "0.55rem",
                                                borderRadius: "8px",
                                                border: `1px solid ${theme === "dark" ? "var(--text-primary)" : "var(--border-subtle)"}`,
                                                background: theme === "dark" ? "var(--surface-2)" : "var(--surface-card)",
                                                color: "var(--text-primary)",
                                                fontSize: "0.8rem",
                                                fontWeight: theme === "dark" ? 700 : 500,
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            <Moon size={14} style={{ color: "var(--text-secondary)" }} />
                                            <span>{t("nav.theme_dark") || "Oscuro"}</span>
                                            {theme === "dark" && <Check size={13} style={{ color: "#22c55e" }} />}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => { if (theme !== "light") toggleTheme(); }}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "0.45rem",
                                                padding: "0.55rem",
                                                borderRadius: "8px",
                                                border: `1px solid ${theme === "light" ? "var(--text-primary)" : "var(--border-subtle)"}`,
                                                background: theme === "light" ? "var(--surface-2)" : "var(--surface-card)",
                                                color: "var(--text-primary)",
                                                fontSize: "0.8rem",
                                                fontWeight: theme === "light" ? 700 : 500,
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            <Sun size={14} style={{ color: "var(--brand-amber)" }} />
                                            <span>{t("nav.theme_light") || "Claro"}</span>
                                            {theme === "light" && <Check size={13} style={{ color: "#22c55e" }} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Security and Logout Footer */}
                        <div style={{
                            paddingTop: "0.75rem",
                            borderTop: "1px solid var(--border-subtle)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "0.75rem"
                        }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsOpen(false);
                                    onOpenPasswordModal();
                                }}
                                className="btn btn-secondary"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.5rem 0.9rem",
                                    fontSize: "0.8rem",
                                    fontWeight: 600,
                                    borderRadius: "8px",
                                }}
                            >
                                <KeyRound size={14} style={{ color: "var(--text-secondary)" }} />
                                <span>{t("nav.change_password") || "Cambiar Contraseña"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsOpen(false);
                                    onLogout();
                                }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.5rem 0.9rem",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(239, 68, 68, 0.25)",
                                    background: "rgba(239, 68, 68, 0.08)",
                                    color: "var(--status-error)",
                                    fontSize: "0.8rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.16)";
                                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.4)";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
                                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.25)";
                                }}
                            >
                                <LogOut size={14} />
                                <span>{t("nav.logout") || "Cerrar Sesión"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
