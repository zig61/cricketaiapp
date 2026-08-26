import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DemoLoginButton } from "@/components/demo/DemoLoginButton";
import { PoseOverlay } from "@/components/marketing/PoseOverlay";

const STEPS = [
  {
    n: "01",
    title: "Record",
    body: "Film your batting side-on. That's the only setup Cricket AI needs.",
  },
  {
    n: "02",
    title: "AI diagnoses",
    body: "Pose tracking measures your technique and finds the one thing holding you back.",
  },
  {
    n: "03",
    title: "Train & retest",
    body: "Get a targeted drill, train on it, then re-upload to see the measured change.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-16 sm:py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-8">
          <div className="flex flex-col items-start gap-6">
            <span className="rounded-full border border-[var(--border-strong)] bg-white/[0.03] px-3 py-1 text-xs font-medium tracking-wide text-[var(--accent-strong)]">
              AI BATTING COACH
            </span>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--foreground)] sm:text-6xl">
              Cricket AI
            </h1>
            <p className="max-w-md text-lg leading-8 text-[var(--muted)]">
              Record your shot. Get a diagnosis. Get one drill that actually
              moves the needle — then watch your technique change, measured.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Button>Get started</Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary">Log in</Button>
              </Link>
            </div>
            <div className="w-full max-w-[260px]">
              <DemoLoginButton />
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="surface-card glow-accent rounded-2xl p-6">
              <PoseOverlay />
            </div>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 gap-4 sm:mt-32 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="surface-card rounded-2xl p-6">
              <span className="font-display text-sm font-semibold text-[var(--accent-strong)]">
                {step.n}
              </span>
              <h2 className="font-display mt-3 text-lg font-semibold text-[var(--foreground)]">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 text-center text-sm text-[var(--muted-2)]">
          Currently focused on batting technique. The app is in active development.
        </p>
      </main>
    </div>
  );
}
