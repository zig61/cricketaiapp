/**
 * Hand-written to match supabase/migrations/*.sql. Regenerate for real once a
 * live project exists: `supabase gen types typescript --linked > lib/database.types.ts`.
 */

export type AgeBand = "under_13" | "13_17" | "18_plus";
export type BattingHand = "left" | "right";
export type PlayingLevel = "junior_club" | "senior_club" | "school" | "other";
export type PlayingRole = "batter" | "bowler" | "all_rounder" | "wicketkeeper";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "elite";
export type MatchFormat = "test" | "odi" | "t20" | "other";

export type VideoKind = "initial" | "followup";
export type VideoStatus =
  | "uploaded"
  | "validating"
  | "rejected"
  | "analysing"
  | "complete"
  | "failed";

export type ProcessingStage =
  | "validate"
  | "extract_frames"
  | "pose_estimate"
  | "measure"
  | "diagnose"
  | "explain"
  | "match_drill"
  | "persist";
export type ProcessingStatus = "pending" | "running" | "succeeded" | "failed";

export type MarkerKey =
  | "head_stability"
  | "balance_weight_transfer"
  | "backlift_alignment"
  | "front_elbow_height"
  | "base_width"
  | "follow_through_shape";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";
export type ComparisonVerdict =
  | "improved"
  | "no_material_change"
  | "regressed"
  | "inconclusive_low_confidence";

export type GoalStatus = "active" | "completed" | "abandoned";
export type NotificationType = "analysis_ready" | "drill_reminder" | "system";
export type MessageRole = "user" | "assistant" | "system";
export type Units = "metric" | "imperial";

export interface Profile {
  id: string;
  display_name: string;
  date_of_birth: string | null;
  age_band: AgeBand | null;
  batting_hand: BattingHand | null;
  playing_level: PlayingLevel | null;
  is_minor: boolean;
  playing_role: PlayingRole | null;
  preferred_formats: MatchFormat[];
  training_frequency_per_week: number | null;
  experience_level: ExperienceLevel | null;
  current_focus_sub_skill_id: string | null;
  created_at: string;
  updated_at: string;
}
export type ProfileInsert = Pick<Profile, "id" | "display_name"> &
  Partial<Omit<Profile, "id" | "display_name" | "is_minor" | "created_at" | "updated_at">>;
export type ProfileUpdate = Partial<Omit<Profile, "id" | "is_minor" | "created_at" | "updated_at">>;

export interface Video {
  id: string;
  player_id: string;
  storage_path: string | null;
  kind: VideoKind;
  linked_issue_id: string | null;
  status: VideoStatus;
  rejection_reason: string | null;
  duration_seconds: number | null;
  created_at: string;
}
export type VideoInsert = Pick<Video, "player_id" | "kind"> &
  Partial<Pick<Video, "linked_issue_id" | "storage_path" | "duration_seconds" | "status">>;

export interface ProcessingJob {
  id: string;
  video_id: string;
  stage: ProcessingStage;
  status: ProcessingStatus;
  error: string | null;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface Analysis {
  id: string;
  video_id: string;
  landmarks_storage_path: string | null;
  measurement_formula_version: string;
  created_at: string;
}

export interface Measurement {
  id: string;
  analysis_id: string;
  marker_key: MarkerKey;
  value: number;
  unit: string;
  confidence: number;
  created_at: string;
}

export interface Issue {
  id: string;
  analysis_id: string;
  measurement_id: string;
  root_cause_id: string;
  severity: number;
  confidence: number;
  is_primary: boolean;
  explanation_text: string | null;
  created_at: string;
}

export interface Drill {
  id: string;
  title: string;
  steps: unknown;
  equipment: string | null;
  difficulty_level: DifficultyLevel;
  media_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrillPrescription {
  id: string;
  issue_id: string;
  drill_id: string;
  prescribed_at: string;
}

export interface DrillCompletion {
  id: string;
  prescription_id: string;
  completed_at: string;
}
export type DrillCompletionInsert = Pick<DrillCompletion, "prescription_id">;

export interface ProgressComparison {
  id: string;
  original_issue_id: string;
  followup_video_id: string;
  followup_measurement_id: string;
  verdict: ComparisonVerdict;
  delta_value: number | null;
  confidence: number;
  formula_version_mismatch: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  player_id: string;
  status: string;
  plan: string;
  created_at: string;
}

export interface Skill {
  id: string;
  key: string;
  name: string;
}

export interface SubSkill {
  id: string;
  skill_id: string;
  key: string;
  name: string;
}

export interface RootCause {
  id: string;
  sub_skill_id: string;
  key: string;
  name: string;
  description: string;
}

export interface PlayerGoal {
  id: string;
  player_id: string;
  sub_skill_id: string | null;
  description: string;
  target_date: string | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}
export type PlayerGoalInsert = Pick<PlayerGoal, "player_id" | "description"> &
  Partial<Pick<PlayerGoal, "sub_skill_id" | "target_date" | "status">>;

export interface PlayerPreferences {
  player_id: string;
  preferred_training_days: string[];
  reminder_time: string | null;
  created_at: string;
  updated_at: string;
}
export type PlayerPreferencesInsert = Pick<PlayerPreferences, "player_id"> &
  Partial<Pick<PlayerPreferences, "preferred_training_days" | "reminder_time">>;

export interface UserSettings {
  player_id: string;
  units: Units;
  notifications_enabled: boolean;
  marketing_opt_in: boolean;
  created_at: string;
  updated_at: string;
}
export type UserSettingsInsert = Pick<UserSettings, "player_id"> &
  Partial<Pick<UserSettings, "units" | "notifications_enabled" | "marketing_opt_in">>;

export interface Notification {
  id: string;
  player_id: string;
  type: NotificationType;
  title: string;
  body: string;
  related_video_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AiCoachConversation {
  id: string;
  player_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiCoachMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

// Supabase's generic client resolves table types via a deep conditional-type
// chain that, empirically, only resolves correctly against object types it
// can re-derive structurally — a bare reference to a named interface/type
// alias resolves to `never` throughout that chain, while the identical shape
// wrapped in Pick<T, keyof T> resolves correctly. Verified directly against
// the installed @supabase/postgrest-js version; this wrapper is the fix.
type Solidify<T> = [T] extends [never] ? never : Pick<T, keyof T>;

type Tbl<Row, Insert = never, Update = never> = {
  Row: Solidify<Row>;
  Insert: Solidify<Insert>;
  Update: Solidify<Update>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Tbl<Profile, ProfileInsert, ProfileUpdate>;
      videos: Tbl<Video, VideoInsert, Partial<VideoInsert>>;
      processing_jobs: Tbl<ProcessingJob, { video_id: string; stage: ProcessingStage }>;
      analyses: Tbl<Analysis>;
      measurements: Tbl<Measurement>;
      issues: Tbl<Issue>;
      drills: Tbl<Drill>;
      drill_prescriptions: Tbl<DrillPrescription>;
      drill_completions: Tbl<DrillCompletion, DrillCompletionInsert>;
      progress_comparisons: Tbl<ProgressComparison>;
      subscriptions: Tbl<Subscription>;
      skills: Tbl<Skill>;
      sub_skills: Tbl<SubSkill>;
      root_causes: Tbl<RootCause>;
      player_goals: Tbl<PlayerGoal, PlayerGoalInsert, Partial<PlayerGoalInsert>>;
      player_preferences: Tbl<
        PlayerPreferences,
        PlayerPreferencesInsert,
        Partial<PlayerPreferencesInsert>
      >;
      user_settings: Tbl<UserSettings, UserSettingsInsert, Partial<UserSettingsInsert>>;
      notifications: Tbl<Notification, never, Pick<Notification, "read_at">>;
      ai_coach_conversations: Tbl<AiCoachConversation>;
      ai_coach_messages: Tbl<AiCoachMessage>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
