"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DemoLoginButton } from "@/components/demo/DemoLoginButton";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (signInError) {
      setError(toUserMessage(signInError));
      return;
    }

    router.push(searchParams.get("next") || "/home");
    router.refresh();
  }

  return (
    <div className="surface-card w-full max-w-sm rounded-2xl p-8">
      <h1 className="font-display mb-1 text-2xl font-semibold text-[var(--foreground)]">
        Welcome back
      </h1>
      <p className="mb-8 text-sm text-[var(--muted)]">Log in to continue your coaching.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-[var(--foreground)]">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-[var(--foreground)]">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-[var(--critical)]">{error}</p> : null}

        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs text-[var(--muted-2)]">or</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <DemoLoginButton />

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        New to Cricket AI?{" "}
        <Link href="/signup" className="font-medium text-[var(--accent-strong)] hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
