import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between border-b border-black/5 py-3 last:border-0 dark:border-white/5">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-black dark:text-white">{value || "Not set"}</span>
    </div>
  );
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.claims.sub)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black dark:text-white">Your profile</h1>
        <Link href="/onboarding">
          <Button variant="secondary" className="h-9 px-4 text-xs">
            Edit
          </Button>
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white px-6 dark:border-white/10 dark:bg-zinc-950">
        <Row label="Name" value={profile.display_name} />
        <Row label="Age range" value={profile.age_band?.replace(/_/g, " ")} />
        <Row label="Playing level" value={profile.playing_level?.replace(/_/g, " ")} />
        <Row label="Playing role" value={profile.playing_role?.replace(/_/g, " ")} />
        <Row label="Batting hand" value={profile.batting_hand} />
        <Row label="Experience" value={profile.experience_level} />
        <Row
          label="Training frequency"
          value={
            profile.training_frequency_per_week != null
              ? `${profile.training_frequency_per_week}x / week`
              : null
          }
        />
        <Row
          label="Preferred formats"
          value={profile.preferred_formats.length > 0 ? profile.preferred_formats.join(", ") : null}
        />
      </div>
    </div>
  );
}
