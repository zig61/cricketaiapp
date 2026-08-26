"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DEMO_COOKIE } from "@/lib/demo-constants";

export function DemoLoginButton() {
  const router = useRouter();

  function handleClick() {
    document.cookie = `${DEMO_COOKIE}=1; path=/; max-age=86400; samesite=lax`;
    router.push("/home");
    router.refresh();
  }

  return (
    <Button type="button" variant="secondary" onClick={handleClick} className="w-full">
      View demo — no account needed
    </Button>
  );
}
