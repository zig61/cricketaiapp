"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { DEMO_VIDEO_ID } from "@/lib/demo-constants";
import { CameraCalibration } from "./CameraCalibration";

type Step = "idle" | "requesting" | "uploading" | "confirming" | "done";
type Mode = "choose" | "camera";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getVideoDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("Couldn't read video metadata."));
    video.src = URL.createObjectURL(file);
  });
}

export function UploadForm({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("choose");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  async function uploadVideoFile(file: File | Blob, extension: string) {
    setError(null);
    try {
      setStep("requesting");
      const createRes = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "initial", linkedIssueId: null, fileExtension: extension }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createBody?.error?.message ?? "Couldn't start the upload.");
      }

      setStep("uploading");
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("player-videos")
        .uploadToSignedUrl(createBody.storagePath, createBody.uploadToken, file);
      if (uploadError) throw uploadError;

      setStep("confirming");
      const duration = await getVideoDuration(file).catch(() => 0);
      const confirmRes = await fetch(`/api/videos/${createBody.videoId}/confirm-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSeconds: duration || 1 }),
      });
      const confirmBody = await confirmRes.json();
      if (!confirmRes.ok) {
        throw new Error(confirmBody?.error?.message ?? "Couldn't confirm the upload.");
      }

      setStep("done");
      router.push(`/videos/${createBody.videoId}`);
      router.refresh();
    } catch (err) {
      setStep("idle");
      setError(toUserMessage(err));
    }
  }

  async function handleFileSelected(file: File) {
    setError(null);

    if (!/\.(mp4|mov|m4v)$/i.test(file.name)) {
      setError("Please choose an MP4 or MOV video file.");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError("That video is larger than the 500MB limit.");
      return;
    }

    if (demo) {
      // No real backend in demo mode — simulate the same step sequence so
      // the flow looks and feels real, then land on the fixed demo result.
      setStep("requesting");
      await sleep(500);
      setStep("uploading");
      await sleep(900);
      setStep("confirming");
      await sleep(500);
      setStep("done");
      router.push(`/videos/${DEMO_VIDEO_ID}`);
      return;
    }

    const extension = file.name.split(".").pop() ?? "mp4";
    await uploadVideoFile(file, extension);
  }

  async function handleRecorded(blob: Blob) {
    setMode("choose");
    if (demo) {
      setStep("requesting");
      await sleep(500);
      setStep("uploading");
      await sleep(900);
      setStep("confirming");
      await sleep(500);
      setStep("done");
      router.push(`/videos/${DEMO_VIDEO_ID}`);
      return;
    }
    await uploadVideoFile(blob, "webm");
  }

  function handleCameraUnavailable(reason: string) {
    setMode("choose");
    setError(`${reason} You can still choose a video file instead.`);
  }

  const stepLabel: Record<Step, string | null> = {
    idle: null,
    requesting: "Preparing upload...",
    uploading: "Uploading video...",
    confirming: "Confirming...",
    done: "Done — redirecting...",
  };

  if (mode === "camera" && step === "idle") {
    return (
      <div>
        <CameraCalibration onRecorded={handleRecorded} onUnavailable={handleCameraUnavailable} />
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="mt-3 text-sm text-[var(--muted)] underline"
        >
          Cancel and choose a file instead
        </button>
      </div>
    );
  }

  return (
    <div className="surface-card glow-accent rounded-2xl p-8 text-center">
      <h2 className="font-display text-lg font-semibold text-[var(--foreground)]">
        Upload a side-on video
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
        Record your batting from side-on, MP4 or MOV, up to 500MB.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-m4v"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileSelected(file);
        }}
      />

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button type="button" disabled={step !== "idle"} onClick={() => fileInputRef.current?.click()}>
          {stepLabel[step] ?? "Choose video"}
        </Button>
        {step === "idle" ? (
          <Button type="button" variant="secondary" onClick={() => setMode("camera")}>
            Record in-app
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-[var(--critical)]">{error}</p> : null}
    </div>
  );
}
