import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<Variant, string> = {
    primary:
      "bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200",
    secondary:
      "border border-black/10 text-black hover:bg-black/[.04] dark:border-white/15 dark:text-white dark:hover:bg-white/[.06]",
  };

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
