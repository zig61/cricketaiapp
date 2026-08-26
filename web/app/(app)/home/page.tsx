import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import type { Video } from "@/lib/database.types";
import { isDemoMode, demoProfile, demoVideos } from "@/lib/demo";

function statusLabel(status: Video["status"]): string {
  switch (status) {
    case "uploaded":
      return "Uploaded — waiting to be validated";
    case "validating":
      return "Validating";
    case "rejected":
      return "Rejected";
    case "analysing":
      return "Analysing";
    case "complete":
      return "Analysis complete";
    case "failed":
      return "Failed";
  }
}

export default async function HomePage() {
  if (await isDemoMode()) {
    return <HomeView profile={demoProfile} videos={demoVideos} />;
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/login");

  const [{ data: profile }, { data: videos }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", claims.claims.sub).maybeSingle(),
    supabase
      .from("videos")
      .select("*")
      .eq("player_id", claims.claims.sub)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (profile && !profile.playing_role) {
    redirect("/onboarding");
  }

  return <HomeView profile={profile} videos={videos} />;
}

function HomeView({
  profile,
  videos,
}: {
  profile: { display_name: string } | null;
  videos: Video[] | null;
}) {

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Record your shot, get a diagnosis, get a drill.
        </p>
      </div>

      <div className="surface-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[var(--foreground)]">
            Recent videos
          </h2>
          <Link href="/upload">
            <Button className="h-9 px-4 text-xs">Upload video</Button>
          </Link>
        </div>

        {videos && videos.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {videos.map((video) => (
              <li key={video.id}>
                <Link
                  href={`/videos/${video.id}`}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3 transition-colors hover:border-[var(--accent)] hover:bg-white/[0.03]"
                >
                  <span className="text-sm text-[var(--foreground)]">
                    {video.kind === "followup" ? "Follow-up video" : "Video"} —{" "}
                    {new Date(video.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {statusLabel(video.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">
            No videos yet — upload your first shot to get started.
          </p>
        )}
      </div>
    </div>
  );
}
