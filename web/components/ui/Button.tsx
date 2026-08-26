import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40";
  const variants: Record<Variant, string> = {
    primary:
      "bg-[var(--accent)] text-white shadow-[0_0_0_1px_var(--border-strong),0_8px_24px_-8px_rgba(57,135,229,0.55)] hover:bg-[var(--accent-strong)] hover:shadow-[0_0_0_1px_var(--accent-strong),0_10px_28px_-6px_rgba(57,135,229,0.65)]",
    secondary:
      "border border-[var(--border-strong)] text-[var(--foreground)] bg-white/[0.02] hover:bg-white/[0.06] hover:border-[var(--accent)]",
    ghost: "text-[var(--muted)] hover:text-[var(--foreground)]",
  };

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
