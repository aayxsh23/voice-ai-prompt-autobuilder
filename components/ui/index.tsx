import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Button ──────────────────────────────────────────────────────────────
   One button. `primary` is near-black (the only high-emphasis action on a
   screen), `secondary` is a bordered white default, `ghost` is for icon and
   toolbar actions, `danger` reveals red on hover only.
   Callers should not pass colour classes — if a new emphasis is needed it
   belongs here as a variant. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'default' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', type = 'button', ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none';
    const variants = {
      primary: 'bg-ink text-white hover:bg-black',
      secondary: 'bg-surface border-line text-ink hover:bg-subtle hover:border-line-strong',
      ghost: 'bg-transparent text-graphite hover:bg-subtle hover:text-ink',
      danger: 'bg-transparent text-graphite hover:bg-danger-soft hover:text-danger',
    };
    const sizes = {
      sm: 'h-7 px-2.5 text-[13px]',
      default: 'h-8 px-3 text-[13px]',
      icon: 'h-8 w-8 p-0',
    };
    return <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
  },
);
Button.displayName = 'Button';

/* ── Input ── */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn('input-field', className)} {...props} />
  ),
);
Input.displayName = 'Input';

/* ── Textarea ── */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn('input-field resize-y', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

/* ── Badge ──────────────────────────────────────────────────────────────
   Status only. `neutral` is the default; colour is reserved for states that
   genuinely mean something. */
export const Badge = ({
  children,
  variant = 'neutral',
  className,
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger';
  className?: string;
}) => {
  const variants = {
    neutral: 'bg-subtle text-graphite border-line',
    success: 'bg-surface text-success border-success/30',
    warning: 'bg-warning-soft text-warning border-warning/30',
    danger: 'bg-danger-soft text-danger border-danger/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
};

/* ── Card ── */
export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('card', className)}>{children}</div>
);
