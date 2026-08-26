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
      className="text-sm text-zinc-500 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"
    >
      Exit demo
    </button>
  );
}
