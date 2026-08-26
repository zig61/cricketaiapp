"use client";

import { useRouter } from "next/navigation";
import { DEMO_COOKIE } from "@/lib/demo-constants";

export function ExitDemoButton() {
  const router = useRouter();

  function handleClick() {
    document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0`;
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
    >
      Exit demo
    </button>
  );
}
