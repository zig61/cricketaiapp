import { cookies } from "next/headers";
import type { Profile, ProgressComparison, Video } from "@/lib/database.types";
import { DEMO_COOKIE, DEMO_VIDEO_ID, DEMO_FOLLOWUP_VIDEO_ID } from "@/lib/demo-constants";

export { DEMO_COOKIE, DEMO_VIDEO_ID, DEMO_FOLLOWUP_VIDEO_ID } from "@/lib/demo-constants";

export async function isDemoMode(): Promise<boolean> {
  const store = await cookies();
  return store.get(DEMO_COOKIE)?.value === "1";
}

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

export const demoProfile: Profile = {
  id: "demo-user",
  display_name: "Alex Rowe",
  date_of_birth: null,
  age_band: "13_17",
  batting_hand: "right",
  playing_level: "senior_club",
  is_minor: true,
  playing_role: "batter",
  preferred_formats: ["t20", "odi"],
  training_frequency_per_week: 3,
  experience_level: "intermediate",
  current_focus_sub_skill_id: "demo-sub-skill",
  created_at: daysAgo(21),
  updated_at: daysAgo(1),
};

export const demoVideos: Video[] = [
  {
    id: DEMO_VIDEO_ID,
    player_id: "demo-user",
    storage_path: "demo-user/demo-video-1/original.mp4",
    kind: "initial",
    linked_issue_id: null,
    status: "complete",
    rejection_reason: null,
    duration_seconds: 8.4,
    created_at: daysAgo(14),
  },
  {
    id: DEMO_FOLLOWUP_VIDEO_ID,
    player_id: "demo-user",
    storage_path: "demo-user/demo-video-2/original.mp4",
    kind: "followup",
    linked_issue_id: "demo-issue-1",
    status: "complete",
    rejection_reason: null,
    duration_seconds: 7.9,
    created_at: daysAgo(2),
  },
];

export const demoPrimaryIssue = {
  id: "demo-issue-1",
  is_primary: true,
  explanation_text:
    "Your head is drifting away from the ball just before contact, which is throwing off your balance through the shot. In the video, your head moves about 12cm toward off-stump between backlift and impact — ideally it stays stacked over your front knee. This is the single biggest thing holding back your timing right now. The good news: this is a footwork and setup habit, not a talent issue, and it responds quickly to focused drilling.",
};

export const demoMeasurements = [
  { markerKey: "Head stability", value: "12cm drift", confidence: 0.87 },
  { markerKey: "Balance / weight transfer", value: "68% front foot", confidence: 0.81 },
  { markerKey: "Backlift alignment", value: "Within range", confidence: 0.92 },
];

export const demoDrill = {
  title: "Wall Drill: Head Over the Ball",
  difficulty: "beginner" as const,
  steps: [
    "Stand side-on, about 30cm from a wall, in your batting stance.",
    "Shadow your backlift and downswing slowly, keeping your head still.",
    "If your head touches the wall, you're drifting — reset and go again.",
    "10 slow reps, then 10 at normal bat speed, 3 sets.",
  ],
};

export const demoProgress: ProgressComparison = {
  id: "demo-comparison-1",
  original_issue_id: "demo-issue-1",
  followup_video_id: DEMO_FOLLOWUP_VIDEO_ID,
  followup_measurement_id: "demo-measurement-2",
  verdict: "improved",
  delta_value: -7.5,
  confidence: 0.83,
  formula_version_mismatch: false,
  created_at: daysAgo(2),
};
