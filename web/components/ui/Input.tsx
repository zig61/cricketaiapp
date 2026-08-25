import { type InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-11 w-full rounded-lg border border-black/10 bg-white px-3.5 text-sm text-black outline-none transition-colors placeholder:text-zinc-400 focus:border-black/30 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-white/30 ${className}`}
      {...props}
    />
  );
}
