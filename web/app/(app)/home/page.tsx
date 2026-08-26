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
        <h1 className="text-2xl font-semibold text-black dark:text-white">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Record your shot, get a diagnosis, get a drill.
        </p>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-black dark:text-white">Recent videos</h2>
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
                  className="flex items-center justify-between rounded-lg border border-black/5 px-4 py-3 transition-colors hover:bg-black/[.02] dark:border-white/5 dark:hover:bg-white/[.04]"
                >
                  <span className="text-sm text-black dark:text-white">
                    {video.kind === "followup" ? "Follow-up video" : "Video"} —{" "}
                    {new Date(video.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {statusLabel(video.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No videos yet — upload your first shot to get started.
          </p>
        )}
      </div>
    </div>
  );
}
