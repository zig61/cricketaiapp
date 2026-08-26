"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SignupForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(toUserMessage(signUpError));
      return;
    }

    if (data.session) {
      // Email confirmation is off for this project — already logged in.
      router.push("/onboarding");
      router.refresh();
      return;
    }

    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <div className="surface-card w-full max-w-sm rounded-2xl p-8 text-center">
        <h1 className="font-display mb-2 text-2xl font-semibold text-[var(--foreground)]">
          Check your email
        </h1>
        <p className="text-sm text-[var(--muted)]">
          We sent a confirmation link to{" "}
          <span className="font-medium text-[var(--foreground)]">{email}</span>. Click it to
          finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card w-full max-w-sm rounded-2xl p-8">
      <h1 className="font-display mb-1 text-2xl font-semibold text-[var(--foreground)]">
        Create your account
      </h1>
      <p className="mb-8 text-sm text-[var(--muted)]">
        Start your coaching journey with Cricket AI.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className="text-sm font-medium text-[var(--foreground)]">
            Name
          </label>
          <Input
            id="displayName"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

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
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-[var(--critical)]">{error}</p> : null}

        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--accent-strong)] hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
