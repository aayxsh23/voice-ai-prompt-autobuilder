import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Button ── */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-[4px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ff6c02] disabled:pointer-events-none disabled:opacity-50 cursor-pointer tracking-tight";
    const variants = {
      default: "bg-[#ff6c02] text-[#f3f3f3] hover:bg-[#ff8025]",
      outline: "border border-[#303030] bg-transparent hover:bg-[#121212] text-[#909090] hover:text-[#f3f3f3]",
      secondary: "bg-[#1b1b1b] text-[#f3f3f3] hover:bg-[#252525] border border-[#252525]",
      ghost: "hover:bg-[#121212] text-[#909090] hover:text-[#f3f3f3]",
      destructive: "bg-[#eb5757] text-white hover:bg-[#d44040]"
    };
    const sizes = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10"
    };
    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
    );
  }
);
Button.displayName = 'Button';

/* ── Input ── */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[8px] bg-[#1b1b1b] px-3 py-2 text-sm text-[#f3f3f3] placeholder:text-[#646464] border border-[#252525] focus:outline-none focus:border-[#ff6c02] disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

/* ── Textarea ── */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-[8px] bg-[#1b1b1b] px-3 py-2 text-sm text-[#f3f3f3] placeholder:text-[#646464] border border-[#252525] focus:outline-none focus:border-[#ff6c02] disabled:cursor-not-allowed disabled:opacity-50 font-mono transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

/* ── Badge ── */
export const Badge = ({ children, variant = 'default', className }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'info' | 'outline'; className?: string }) => {
  const variants = {
    default: "bg-[#1b1b1b] text-[#dedede] border border-[#252525]",
    success: "bg-[#0c0c0c] text-[#27a644] border border-[#252525]",
    warning: "bg-[#0c0c0c] text-[#ff6c02] border border-[#ff6c02]/40",
    info: "bg-transparent text-[#55c2ff] border border-[#55c2ff]/40",
    outline: "border border-[#303030] text-[#909090] bg-transparent"
  };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
};

/* ── Card ── */
export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-[12px] border border-[#252525] bg-[#121212] p-6", className)}>{children}</div>
);
