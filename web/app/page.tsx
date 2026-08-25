import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Cricket AI
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          AI-powered batting technique coaching. Record your shot, get a
          diagnosis, get a drill.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Link href="/signup">
            <Button>Get started</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Log in</Button>
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
          The app is in development — this site will grow alongside it.
        </p>
      </main>
    </div>
  );
}
