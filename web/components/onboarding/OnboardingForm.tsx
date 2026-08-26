"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import type {
  AgeBand,
  BattingHand,
  ExperienceLevel,
  MatchFormat,
  PlayingLevel,
  PlayingRole,
} from "@/lib/database.types";

const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: "under_13", label: "Under 13" },
  { value: "13_17", label: "13–17" },
  { value: "18_plus", label: "18+" },
];
const PLAYING_LEVELS: { value: PlayingLevel; label: string }[] = [
  { value: "junior_club", label: "Junior club" },
  { value: "senior_club", label: "Senior club" },
  { value: "school", label: "School" },
  { value: "other", label: "Other" },
];
const PLAYING_ROLES: { value: PlayingRole; label: string }[] = [
  { value: "batter", label: "Batter" },
  { value: "bowler", label: "Bowler" },
  { value: "all_rounder", label: "All-rounder" },
  { value: "wicketkeeper", label: "Wicketkeeper" },
];
const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "elite", label: "Elite" },
];
const FORMATS: { value: MatchFormat; label: string }[] = [
  { value: "test", label: "Test / longer form" },
  { value: "odi", label: "One-day" },
  { value: "t20", label: "T20" },
  { value: "other", label: "Other" },
];

function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            value === option.value
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--border-strong)] text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-white/[0.03]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function OnboardingForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [battingHand, setBattingHand] = useState<BattingHand | null>(null);
  const [playingLevel, setPlayingLevel] = useState<PlayingLevel | null>(null);
  const [playingRole, setPlayingRole] = useState<PlayingRole | null>(null);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null);
  const [formats, setFormats] = useState<MatchFormat[]>([]);
  const [trainingFrequency, setTrainingFrequency] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleFormat(format: MatchFormat) {
    setFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!playingRole) {
      setError("Please select a playing role to continue.");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      router.push("/login");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        age_band: ageBand,
        batting_hand: battingHand,
        playing_level: playingLevel,
        playing_role: playingRole,
        experience_level: experienceLevel,
        preferred_formats: formats,
        training_frequency_per_week: trainingFrequency,
      })
      .eq("id", user.id);

    if (profileError) {
      setLoading(false);
      setError(toUserMessage(profileError));
      return;
    }

    const { error: prefsError } = await supabase
      .from("player_preferences")
      .upsert({ player_id: user.id });

    setLoading(false);

    if (prefsError) {
      setError(toUserMessage(prefsError));
      return;
    }

    router.push("/home");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
          Welcome, {displayName}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          A few quick questions so your coaching feels personal from the start. Cricket AI
          currently focuses on batting technique.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">Age range</legend>
        <OptionGroup options={AGE_BANDS} value={ageBand} onChange={setAgeBand} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">
          Playing level
        </legend>
        <OptionGroup options={PLAYING_LEVELS} value={playingLevel} onChange={setPlayingLevel} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">
          Playing role
        </legend>
        <OptionGroup options={PLAYING_ROLES} value={playingRole} onChange={setPlayingRole} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">
          Batting hand
        </legend>
        <OptionGroup
          options={[
            { value: "right" as BattingHand, label: "Right-handed" },
            { value: "left" as BattingHand, label: "Left-handed" },
          ]}
          value={battingHand}
          onChange={setBattingHand}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">
          Experience level
        </legend>
        <OptionGroup
          options={EXPERIENCE_LEVELS}
          value={experienceLevel}
          onChange={setExperienceLevel}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">
          Preferred formats
        </legend>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((format) => (
            <button
              key={format.value}
              type="button"
              onClick={() => toggleFormat(format.value)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                formats.includes(format.value)
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border-strong)] text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-white/[0.03]"
              }`}
            >
              {format.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">
          Training sessions per week: {trainingFrequency}
        </legend>
        <input
          type="range"
          min={0}
          max={7}
          value={trainingFrequency}
          onChange={(e) => setTrainingFrequency(Number(e.target.value))}
          className="w-full max-w-xs"
        />
      </fieldset>

      {error ? <p className="text-sm text-[var(--critical)]">{error}</p> : null}

      <Button type="submit" disabled={loading} className="w-fit">
        {loading ? "Saving..." : "Finish setup"}
      </Button>
    </form>
  );
}
