import { ReactNode } from "react";

interface PageTemplateProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  heroOrb?: ReactNode;
  heroContent?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PageTemplate({
  title,
  eyebrow,
  subtitle,
  heroOrb,
  heroContent,
  children,
  className = "",
}: PageTemplateProps) {
  return (
    <section className={`mvo-page ${className}`}>
      {(eyebrow || title || heroOrb || heroContent) && (
        <div className="mvo-page-header">
          <div className="mvo-page-header-content">
            {eyebrow && <p className="mvo-eyebrow">{eyebrow}</p>}
            {title && <h1>{title}</h1>}
            {subtitle && <p className="mvo-subtitle">{subtitle}</p>}
            {heroContent}
          </div>
          {heroOrb && <div className="mvo-hero-orb-wrapper">{heroOrb}</div>}
        </div>
      )}
      <div className="mvo-page-content">{children}</div>
    </section>
  );
}

export function MetricCard({ label, value, note, unit }: { label: string; value: string; note: string; unit?: string }) {
  return (
    <article className="mvo-metric-card">
      <p>{label}</p>
      <strong>{value}{unit ? ` ${unit}` : ""}</strong>
      <span>{note}</span>
    </article>
  );
}

export function WideCard({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="mvo-wide-card">
      <div className="mvo-section-header">
        <div>
          {eyebrow && <p className="mvo-eyebrow">{eyebrow}</p>}
          <h3>{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatusCard({
  eyebrow,
  title,
  children,
  grow = false,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  grow?: boolean;
}) {
  return (
    <section className={`mvo-status-card ${grow ? "grow" : ""}`}>
      <p className="mvo-eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function HeroCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mvo-wide-card">
      <div className="mvo-section-header">
        <div>
          {eyebrow && <p className="mvo-eyebrow">{eyebrow}</p>}
          <h3>{title}</h3>
          {subtitle && <p className="mvo-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}