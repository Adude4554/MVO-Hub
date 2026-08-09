import React from 'react';
import { useState } from 'react';
import { forwardRef } from 'react';
import { LucideIcon, LucideProps } from 'lucide-react';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'border' | 'glow';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, variant = 'default', padding = 'md', hover = false, className = '', style, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.7), rgba(10, 15, 26, 0.85))',
      border: '1px solid rgba(30, 42, 74, 0.4)',
      borderRadius: '20px',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      default: {
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 8px 32px rgba(0, 0, 0, 0.3)',
      },
      elevated: {
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 80px rgba(0, 212, 255, 0.05)',
        borderColor: 'rgba(0, 212, 255, 0.15)',
      },
      border: {
        borderColor: 'rgba(0, 212, 255, 0.3)',
        boxShadow: 'inset 0 1px 0 rgba(0, 212, 255, 0.05), 0 0 40px rgba(0, 212, 255, 0.08)',
      },
      glow: {
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 60px rgba(0, 212, 255, 0.15), 0 20px 60px rgba(0, 0, 0, 0.4)',
        borderColor: 'rgba(0, 212, 255, 0.4)',
      },
    };

    const paddingStyles: Record<string, React.CSSProperties> = {
      none: { padding: 0 },
      sm: { padding: '1rem' },
      md: { padding: '1.5rem' },
      lg: { padding: '2rem' },
      xl: { padding: '2.5rem' },
    };

    const hoverStyles = hover ? {
      transform: 'translateY(-4px)',
      borderColor: 'rgba(0, 212, 255, 0.4)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 80px rgba(0, 212, 255, 0.15)',
    } : {};

    return (
      <div
        ref={ref}
        className={className}
        style={{
          ...baseStyles,
          ...variantStyles[variant],
          ...paddingStyles[padding],
          ...hoverStyles,
          ...style,
        }}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-transparent to-purple-400/5 pointer-events-none" />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

export interface PanelFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const PanelFrame = forwardRef<HTMLDivElement, PanelFrameProps>(
  ({ title, subtitle, icon, actions, children, className = '', style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-2xl ${className}`}
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%)',
          border: '1px solid rgba(30, 42, 74, 0.5)',
          borderRadius: '24px',
          backdropFilter: 'blur(20px)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 20px 50px rgba(0, 0, 0, 0.25)',
          ...style,
        }}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/3 via-transparent to-purple-400/3 pointer-events-none" />
        
        {(title || icon) && (
          <div className="relative z-10 flex items-center justify-between p-6 pb-4 border-b border-mvo-border/30">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="p-2 rounded-xl bg-cyan-400/10 border border-cyan-400/20 text-cyan-400">
                  {icon}
                </div>
              )}
              <div>
                {title && (
                  <h2 className="font-display text-xl font-bold text-mvo-text tracking-tight">{title}</h2>
                )}
                {subtitle && (
                  <p className="text-xs text-mvo-textMuted uppercase tracking-wider mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
        
        <div className="relative z-10">{children}</div>
        
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent pointer-events-none" />
      </div>
    );
  }
);

PanelFrame.displayName = 'PanelFrame';

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
  color?: 'cyan' | 'purple' | 'green' | 'amber' | 'pink';
  className?: string;
  progress?: number;
  subtitle?: string;
}

export function MetricCard({ label, value, unit, trend, trendValue, icon, color = 'cyan', className = '', progress, subtitle }: MetricCardProps) {
  const colorMap = {
    cyan: { bg: 'bg-cyan-400/10', border: 'border-cyan-400/20', text: 'text-cyan-400', glow: 'bg-cyan-400' },
    purple: { bg: 'bg-purple-400/10', border: 'border-purple-400/20', text: 'text-purple-400', glow: 'bg-purple-400' },
    green: { bg: 'bg-green-400/10', border: 'border-green-400/20', text: 'text-green-400', glow: 'bg-green-400' },
    amber: { bg: 'bg-amber-400/10', border: 'border-amber-400/20', text: 'text-amber-400', glow: 'bg-amber-400' },
    pink: { bg: 'bg-pink-400/10', border: 'border-pink-400/20', text: 'text-pink-400', glow: 'bg-pink-400' },
  };
  
  const c = colorMap[color];

  return (
    <div className={`relative group stat-card ${className}`} style={{ borderColor: 'rgba(30, 42, 74, 0.4)' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-cyan-400/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl" />
      
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${c.bg} ${c.border} border`}>
            {icon || (
              <div className={`w-5 h-5 ${c.glow}`} style={{ mask: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22%3E%3Cpath d=%22M18 20V10%22/%3E%3Cpath d=%22M12 20V4%22/%3E%3Cpath d=%22M6 20v-6%22/%3E%3C/svg%3E")', WebkitMask: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22%3E%3Cpath d=%22M18 20V10%22/%3E%3Cpath d=%22M12 20V4%22/%3E%3Cpath d=%22M6 20v-6%22/%3E%3C/svg%3E")' }} />
            )}
          </div>
          <div>
            <p className="text-xs text-mvo-textMuted uppercase tracking-wider font-medium">{label}</p>
            {trend && trendValue && (
              <p className={`text-xs font-semibold mt-0.5 flex items-center gap-1 ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-mvo-textMuted'}`}>
                {trend === 'up' && '▲'} {trend === 'down' && '▼'} {trendValue}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="metric-value text-3xl font-bold leading-none">{value}</span>
            {unit && <span className="text-mvo-textDim text-sm font-medium mb-1 block">{unit}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, leftIcon, rightIcon, fullWidth, disabled, className = '', children, style, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      fontWeight: 600,
      borderRadius: '9999px',
      border: '1px solid transparent',
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
      width: fullWidth ? '100%' : 'auto',
      opacity: disabled || loading ? 0.5 : 1,
      transform: disabled || loading ? 'none' : undefined,
    };

    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: { padding: '0.5rem 1rem', fontSize: '0.8rem' },
      md: { padding: '0.75rem 1.25rem', fontSize: '0.875rem' },
      lg: { padding: '1rem 1.75rem', fontSize: '0.95rem' },
      xl: { padding: '1.25rem 2.5rem', fontSize: '1.05rem' },
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      primary: {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.1))',
        borderColor: 'rgba(0, 212, 255, 0.4)',
        color: '#eefcff',
        boxShadow: '0 0 30px rgba(0, 212, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      secondary: {
        background: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'rgba(30, 42, 74, 0.5)',
        color: '#e8edf5',
      },
      ghost: {
        background: 'transparent',
        borderColor: 'transparent',
        color: '#8b9bb8',
      },
      danger: {
        background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.2), rgba(255, 51, 102, 0.1))',
        borderColor: 'rgba(255, 51, 102, 0.4)',
        color: '#ffeef2',
        boxShadow: '0 0 30px rgba(255, 51, 102, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      outline: {
        background: 'transparent',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        color: '#00d4ff',
      },
    };

    const hoverStyles: Record<string, React.CSSProperties> = {
      primary: {
        transform: 'translateY(-2px)',
        boxShadow: '0 0 40px rgba(0, 212, 255, 0.2), 0 8px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(0, 212, 255, 0.6)',
      },
      secondary: {
        background: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(30, 42, 74, 0.8)',
      },
      ghost: {
        background: 'rgba(255, 255, 255, 0.05)',
        color: '#e8edf5',
      },
      danger: {
        transform: 'translateY(-2px)',
        boxShadow: '0 0 40px rgba(255, 51, 102, 0.2), 0 8px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 51, 102, 0.6)',
      },
      outline: {
        background: 'rgba(0, 212, 255, 0.1)',
        borderColor: 'rgba(0, 212, 255, 0.5)',
      },
    };

    return (
      <button
        ref={ref}
        className={`group ${className}`}
        style={{
          ...baseStyles,
          ...sizeStyles[size],
          ...variantStyles[variant],
          ...style,
        }}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        )}
        {!loading && leftIcon && <span>{leftIcon}</span>}
        <span>{children}</span>
        {!loading && rightIcon && <span>{rightIcon}</span>}
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 pointer-events-none" />
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className={className} style={{ width: '100%' }}>
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-mvo-textMuted uppercase tracking-wider mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-mvo-textMuted pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`input-field ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} ${error ? 'border-red-400/50 focus:border-red-400/50' : ''}`}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-mvo-textMuted pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className={className} style={{ width: '100%' }}>
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-mvo-textMuted uppercase tracking-wider mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`input-field appearance-none pr-10 ${error ? 'border-red-400/50 focus:border-red-400/50' : ''}`}
            aria-invalid={error ? 'true' : 'false'}
            {...props}
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-mvo-textMuted pointer-events-none">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export interface ToggleProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export function Toggle({ label, description, className = '', id, ...props }: ToggleProps) {
  const toggleId = id || label.toLowerCase().replace(/\s+/g, '-');
  
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${className}`}>
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          id={toggleId}
          className="sr-only peer"
          {...props}
        />
        <div className="w-11 h-6 bg-mvo-border/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-400/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400 peer-checked:border-cyan-400" />
      </div>
      <div>
        <p className="font-medium text-sm text-mvo-text">{label}</p>
        {description && <p className="text-xs text-mvo-textDim mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'cyan' | 'purple';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({ variant = 'default', size = 'md', dot = false, className = '', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-mvo-panelHover/50 border-mvo-border/30 text-mvo-textDim',
    success: 'bg-green-400/10 border-green-400/30 text-green-400',
    warning: 'bg-amber-400/10 border-amber-400/30 text-amber-400',
    danger: 'bg-red-400/10 border-red-400/30 text-red-400',
    info: 'bg-blue-400/10 border-blue-400/30 text-blue-400',
    cyan: 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400',
    purple: 'bg-purple-400/10 border-purple-400/30 text-purple-400',
  };
  
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </span>
  );
}