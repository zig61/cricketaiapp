import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ExitDemoButton } from "@/components/demo/ExitDemoButton";
import { isDemoMode } from "@/lib/demo";

const NAV_ITEMS = [
  { href: "/home", label: "Home" },
  { href: "/upload", label: "Analyse" },
  { href: "/progress", label: "Progress" },
  { href: "/profile", label: "Profile" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const demo = await isDemoMode();

  return (
    <div className="flex min-h-screen flex-col">
      {demo ? (
        <div className="bg-[var(--warning)] px-6 py-2 text-center text-xs font-semibold tracking-wide text-black">
          DEMO MODE — sample data, not a real account. Nothing here is saved.
        </div>
      ) : null}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link
            href="/home"
            className="font-display text-base font-semibold text-[var(--foreground)]"
          >
            Cricket AI
          </Link>
          <nav className="flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                {item.label}
              </Link>
            ))}
            {demo ? <ExitDemoButton /> : <SignOutButton />}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
