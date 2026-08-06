import { PageTemplate, WideCard, MetricCard } from "./PageTemplate";

export function Web() {
  const tabs = [
    { label: "Guides", url: "https://steamcommunity.com/app/1172470/guides/" },
    { label: "Wiki", url: "https://wiki.projectmvo.io/" },
    { label: "Reddit", url: "https://reddit.com/r/ProjectMVO" },
    { label: "Discord", url: "https://discord.gg/projectmvo" },
    { label: "GitHub", url: "https://github.com/project-mvo" },
    { label: "Patch Notes", url: "https://projectmvo.io/changelog" },
  ];

  return (
    <PageTemplate
      title="Web"
      eyebrow="Overlay"
      subtitle="In-game browser tabs, URL shortcuts, and web overlays"
      heroContent={<p>Chromium-based in-game browser via CEF. Pinned tabs, URL shortcuts, transparent overlay mode. Keyboard/mouse passthrough.</p>}
    >
      <WideCard eyebrow="Game Links" title="Official Resources">
        <div className="mvo-link-grid">
          {tabs.map((t, i) => (
            <a key={i} href={t.url} target="_blank" rel="noopener noreferrer" className="mvo-ext-link">
              <span>{t.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          ))}
        </div>
      </WideCard>

      <WideCard eyebrow="Overlay Browser" title="In-Game Web View">
        <div className="mvo-browser-preview">
          <div className="mvo-browser-bar">
            <div className="mvo-browser-tabs">
              <span className="active">Discord</span>
              <span>Twitch</span>
              <span>+</span>
            </div>
            <input className="mvo-url-input" type="text" placeholder="https://..." defaultValue="https://wiki.projectmvo.io/" />
          </div>
          <div className="mvo-browser-content">
            <p className="mvo-muted">CEF-based overlay — renders in-game via DirectX hook</p>
            <p className="mvo-muted">Transparent mode: Ctrl+Shift+B to toggle</p>
          </div>
        </div>
      </WideCard>

      <WideCard eyebrow="Per-Game Links" title="Custom URL Management">
        <p>Add game-specific URLs that auto-show when that game is selected in the Library.</p>
        <div className="mvo-custom-links">
          <div className="mvo-custom-link"><input placeholder="Label (e.g. 'Build Calculator')" /><input placeholder="URL" /><button className="mvo-action-btn secondary">Save</button></div>
          <div className="mvo-custom-link"><input placeholder="Label" /><input placeholder="URL" /><button className="mvo-action-btn secondary">Save</button></div>
        </div>
        <button className="mvo-action-btn secondary">+ Add Custom Link</button>
      </WideCard>
    </PageTemplate>
  );
}