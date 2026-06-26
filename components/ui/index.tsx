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
    const base = "inline-flex items-center justify-center rounded-[6px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5e6ad2] disabled:pointer-events-none disabled:opacity-50 cursor-pointer";
    const variants = {
      default: "bg-[#e4f222] text-[#030404] hover:bg-[#d4e220] shadow-[0px_5px_2px_0px_rgba(0,0,0,0.01),0px_3px_2px_0px_rgba(0,0,0,0.04),0px_1px_1px_0px_rgba(0,0,0,0.07),0px_0px_1px_0px_rgba(0,0,0,0.08)]",
      outline: "border border-[#23252a] bg-transparent hover:bg-[#161718] text-[#d0d6e0]",
      secondary: "bg-[#161718] text-[#d0d6e0] hover:bg-[#23252a] border border-[#23252a]",
      ghost: "hover:bg-[#161718] text-[#8a8f98] hover:text-[#f7f8f8]",
      destructive: "bg-[#eb5757] text-white hover:bg-[#d44040] shadow-sm"
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
          "flex h-10 w-full rounded-[6px] bg-[#383b3f] px-3 py-2 text-sm text-[#f7f8f8] placeholder:text-[#62666d] focus:outline-none focus:ring-2 focus:ring-[#5e6ad2] disabled:cursor-not-allowed disabled:opacity-50 shadow-[0px_0px_0px_1px_rgba(0,0,0,0.2)] border-none",
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
          "flex min-h-[80px] w-full rounded-[6px] bg-[#383b3f] px-3 py-2 text-sm text-[#f7f8f8] placeholder:text-[#62666d] focus:outline-none focus:ring-2 focus:ring-[#5e6ad2] disabled:cursor-not-allowed disabled:opacity-50 shadow-[0px_0px_0px_1px_rgba(0,0,0,0.2)] border-none font-mono",
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
export const Badge = ({ children, variant = 'default', className }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'outline'; className?: string }) => {
  const variants = {
    default: "bg-[#161718] text-[#d0d6e0] border-[#23252a]",
    success: "bg-[#161718] text-[#27a644] border-[#23252a]",
    warning: "bg-[#161718] text-[#eb5757] border-[#23252a]",
    outline: "border border-[#23252a] text-[#8a8f98] bg-transparent"
  };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-[2px] text-xs font-medium border", variants[variant], className)}>
      {children}
    </span>
  );
};

/* ── Card ── */
export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-[12px] border border-[#23252a] bg-[#161718] p-6 shadow-[inset_0px_0px_0px_1px_rgb(35,37,42),0px_2px_4px_0px_rgba(0,0,0,0.4)]", className)}>{children}</div>
);
