/**
 * The primitive set.
 *
 * Deliberately small and local rather than a shadcn CLI install: the portal needs eight
 * components, and vendoring forty files to use eight is how a design system becomes unmaintained.
 * Every one of these is theme-agnostic — colour comes from the CSS variables in globals.css, so
 * nothing here carries a `dark:` variant.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90 border-transparent',
  secondary: 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:opacity-80',
  ghost: 'bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
  destructive:
    'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90 border-transparent',
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border',
        'px-4 py-2 text-sm font-medium transition-opacity',
        'disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border bg-[hsl(var(--card))] p-5 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Field ────────────────────────────────────────────────────────────────────

export interface FieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  htmlFor?: string | undefined;
  children: ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-[hsl(var(--destructive))]">*</span> : null}
      </label>
      {children}
      {/* The error replaces the hint rather than stacking below it — two lines of competing
          guidance under one input reads as noise. */}
      {error ? (
        <p role="alert" className="text-xs text-[hsl(var(--destructive))]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'focus-ring w-full rounded-[var(--radius)] border bg-[hsl(var(--background))]',
        'px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  );
}

// ── OptionCard ───────────────────────────────────────────────────────────────

export interface OptionCardProps {
  title: string;
  /**
   * `| undefined` is explicit throughout this file because the project runs with
   * `exactOptionalPropertyTypes`. These props are genuinely absent-or-a-value, and widening the
   * type here is far cleaner than conditional spreads at every call site.
   */
  description?: string | undefined;
  selected: boolean;
  disabled?: boolean | undefined;
  /** Why this option cannot be chosen. Shown in place of the description. */
  disabledReason?: string | undefined;
  badge?: string | undefined;
  onSelect: () => void;
}

/**
 * A selectable option.
 *
 * Unavailable options stay visible with the reason attached rather than disappearing. A user who
 * cannot find tRPC needs to be told it requires Node, not left wondering whether the portal
 * supports it at all — that is the whole point of the compatibility matrix being explicit.
 */
export function OptionCard({
  title,
  description,
  selected,
  disabled,
  disabledReason,
  badge,
  onSelect,
}: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      title={disabled ? disabledReason : undefined}
      className={cn(
        'focus-ring w-full rounded-[var(--radius)] border p-4 text-left transition-colors',
        selected
          ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/5 ring-1 ring-[hsl(var(--accent))]'
          : 'hover:bg-[hsl(var(--muted))]',
        disabled && 'cursor-not-allowed opacity-55 hover:bg-transparent',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {badge ? (
          <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {badge}
          </span>
        ) : null}
      </div>
      {disabled && disabledReason ? (
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{disabledReason}</p>
      ) : description ? (
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
      ) : null}
    </button>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────

export interface ToggleProps {
  label: string;
  description?: string | undefined;
  checked: boolean;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  onChange: (next: boolean) => void;
}

export function Toggle({
  label,
  description,
  checked,
  disabled,
  disabledReason,
  onChange,
}: ToggleProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border p-3',
        disabled && 'cursor-not-allowed opacity-55',
      )}
    >
      <input
        type="checkbox"
        className="focus-ring mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {disabled && disabledReason ? (
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">
            {disabledReason}
          </span>
        ) : description ? (
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  success: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]',
  danger: 'bg-[hsl(var(--destructive))]/15 text-[hsl(var(--destructive))]',
  accent: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Banner({ tone = 'accent', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border px-4 py-3 text-sm',
        tone === 'danger' && 'border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10',
        tone === 'warning' && 'border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10',
        tone === 'accent' && 'border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/10',
        tone === 'neutral' && 'bg-[hsl(var(--muted))]',
      )}
    >
      {children}
    </div>
  );
}
