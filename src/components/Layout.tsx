import { Outlet, NavLink, useNavigate, Routes, Route } from "react-router-dom";
import { NavItem } from "./NavItem";
import { mvoProfiles } from "../profiles";
import { t } from "../lib/i18n";
import { useLocale } from "../hooks/useLocale";
import { Dashboard } from "../pages/Dashboard";
import { GameLibrary } from "../pages/GameLibrary";
import { GameMode } from "../pages/GameMode";
import { Optimizer } from "../pages/Optimizer";
import { Performance } from "../pages/Performance";
import { SystemBoost } from "../pages/SystemBoost";
import { AITools } from "../pages/AITools";
import { Overlay } from "../pages/Overlay";
import { Streaming } from "../pages/Streaming";
import { Files } from "../pages/Files";
import { WebHub } from "../pages/WebHub";
import { Tools } from "../pages/Tools";
import { Settings } from "../pages/Settings";
import { Scanner } from "../pages/Scanner";

export function Layout() {
  useLocale();
  const navigate = useNavigate();
  const paths = [
    { path: "/", label: t("nav.dashboard"), icon: "⌬", profile: "vortex" },
    { path: "/library", label: t("nav.library"), icon: "▣", profile: "vortex" },
    { path: "/scanner", label: t("nav.scanner") || "Scanner", icon: "⊕", profile: "vortex" },
    { path: "/game-mode", label: t("nav.gameMode"), icon: "⚡", profile: "vortex" },
    { path: "/optimizer", label: t("nav.optimizer"), icon: "◈", profile: "vortex" },
    { path: "/performance", label: t("nav.performance"), icon: "◌", profile: "nova" },
    { path: "/system-boost", label: t("nav.systemBoost"), icon: "▲", profile: "astra" },
    { path: "/ai-tools", label: t("nav.aiTools"), icon: "◇", profile: "nova" },
    { path: "/overlay", label: t("nav.overlay"), icon: "◎", profile: "nova" },
    { path: "/streaming", label: t("nav.streaming"), icon: "◧", profile: "nova" },
    { path: "/files", label: t("nav.files"), icon: "▤", profile: "astra" },
    { path: "/web", label: t("nav.web"), icon: "◬", profile: "astra" },
    { path: "/tools", label: t("nav.tools"), icon: "✦", profile: "astra" },
    { path: "/settings", label: t("nav.settings"), icon: "⚙", profile: "astra" },
  ];

  const currentProfile = mvoProfiles.vortex;

  return (
    <main className="mvo-app">
      <div className="mvo-background-grid" />
      <div className="mvo-shell">
        <aside className="mvo-sidebar">
          <section className="mvo-brand-card">
            <div className="mvo-brand-mark">MVO</div>
            <div>
              <p className="mvo-eyebrow">Project</p>
              <h1>MVO Zero</h1>
            </div>
          </section>

          <nav className="mvo-nav" aria-label="Main navigation">
            {paths.map((item) => (
              <NavItem
                key={item.path}
                path={item.path}
                label={item.label}
                icon={item.icon}
                status={item.path === "/" ? "Active" : undefined}
              />
            ))}
          </nav>

          <section className="mvo-profile-card">
            <p className="mvo-eyebrow">{t("profile.current")}</p>
            <h2>{currentProfile.name}</h2>
            <p>{currentProfile.desc}</p>
          </section>
        </aside>

        <section className="mvo-workspace">
          <header className="mvo-top-hud">
            <div>
              <p className="mvo-eyebrow">{currentProfile.name} Profile</p>
              <h2>Gaming Command Center</h2>
            </div>
            <div className="mvo-hud-pills">
              <span>DEV BUILD</span>
              <span>TAURI v2</span>
              <span>LOCAL FIRST</span>
            </div>
          </header>

          <section className="mvo-main-grid">
            <div className="mvo-center-panel">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/library" element={<GameLibrary />} />
                <Route path="/scanner" element={<Scanner />} />
                <Route path="/game-mode" element={<GameMode />} />
                <Route path="/optimizer" element={<Optimizer />} />
                <Route path="/performance" element={<Performance />} />
                <Route path="/system-boost" element={<SystemBoost />} />
                <Route path="/ai-tools" element={<AITools />} />
                <Route path="/overlay" element={<Overlay />} />
                <Route path="/streaming" element={<Streaming />} />
                <Route path="/files" element={<Files />} />
                <Route path="/web" element={<WebHub />} />
                <Route path="/tools" element={<Tools />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>

            <aside className="mvo-right-panel">
              <section className="mvo-status-card">
                <p className="mvo-eyebrow">System Status</p>
                <h3>Shell Stable</h3>
                <div className="mvo-status-line"><span />Frontend ready</div>
                <div className="mvo-status-line"><span />Rust commands pending</div>
                <div className="mvo-status-line"><span />No fake performance data</div>
              </section>

              <section className="mvo-status-card grow">
                <p className="mvo-eyebrow">Activity Feed</p>
                <div className="mvo-activity-list">
                  <div className="mvo-activity-item">MVO shell loaded</div>
                  <div className="mvo-activity-item">Vortex profile selected</div>
                  <div className="mvo-activity-item">Backend systems pending</div>
                  <div className="mvo-activity-item">Performance engine scheduled</div>
                  <div className="mvo-activity-item">Steam scan module pending</div>
                </div>
              </section>
            </aside>
          </section>

          <footer className="mvo-bottom-bar">
            <span>Project MVO Zero</span>
            <span>Profile: {currentProfile.name}</span>
            <span>Backend: Pending</span>
            <span>Step 3 / Pages</span>
          </footer>
        </section>
      </div>
    </main>
  );
}