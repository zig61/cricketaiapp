import { type InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-11 w-full rounded-lg border border-[var(--border-strong)] bg-white/[0.03] px-3.5 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-2)] focus:border-[var(--accent)] focus:bg-white/[0.05] ${className}`}
      {...props}
    />
  );
}
