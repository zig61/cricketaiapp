"use client";

import { useEffect, useRef, useState } from "react";
import { assessCalibrationFrame, type CalibrationResult } from "@/lib/calibration";

// Pinned to the exact installed npm package version, not "@latest" — the
// JS API and the WASM binary it loads at runtime need to match, and
// floating the CDN URL to @latest risks a version mismatch the npm
// install pin doesn't protect against.
const TASKS_VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const DETECTION_INTERVAL_MS = 175;
const HOLD_DURATION_MS = 2000;

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

const ZONE_COLOR: Record<CalibrationResult["zone"], string> = {
  red: "var(--critical)",
  yellow: "#eab308",
  green: "var(--good)",
};

type Status = "loading" | "ready" | "recording" | "unavailable";

interface CameraCalibrationProps {
  onRecorded: (blob: Blob, mimeType: string) => void;
  onUnavailable: (reason: string) => void;
}

/**
 * Live side-on camera-angle check, shown before recording. Runs pose
 * detection entirely client-side (MediaPipe's browser/WASM build) against
 * the live camera preview — never uploads anything during calibration,
 * only once the player actually records. See lib/calibration.ts for the
 * geometry this is built on and its unvalidated-thresholds caveat.
 *
 * Any failure here (camera permission denied, no camera, MediaPipe failing
 * to load) calls onUnavailable so the parent can fall back to the existing
 * file-upload path — this feature is additive, never a hard requirement.
 */
export function CameraCalibration({ onRecorded, onUnavailable }: CameraCalibrationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landmarkerRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef(0);
  const greenSinceRef = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [canRecord, setCanRecord] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        if (!cancelled) onUnavailable("Camera access wasn't available.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      try {
        const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
        const filesetResolver = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_URL);
        const landmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setStatus("ready");
        rafRef.current = requestAnimationFrame(detectLoop);
      } catch {
        if (!cancelled) onUnavailable("The live camera guide couldn't load.");
      }
    }

    function detectLoop(now: number) {
      rafRef.current = requestAnimationFrame(detectLoop);
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;
      if (now - lastDetectAtRef.current < DETECTION_INTERVAL_MS) return;
      lastDetectAtRef.current = now;

      const result = landmarker.detectForVideo(video, now);
      const world = result?.worldLandmarks?.[0];
      if (!world) {
        setCalibration(null);
        greenSinceRef.current = null;
        setHoldProgress(0);
        return;
      }

      const assessment = assessCalibrationFrame({
        leftShoulder: { x: world[LEFT_SHOULDER].x, visibility: world[LEFT_SHOULDER].visibility ?? 0 },
        rightShoulder: { x: world[RIGHT_SHOULDER].x, visibility: world[RIGHT_SHOULDER].visibility ?? 0 },
        leftAnkle: { x: world[LEFT_ANKLE].x, visibility: world[LEFT_ANKLE].visibility ?? 0 },
        rightAnkle: { x: world[RIGHT_ANKLE].x, visibility: world[RIGHT_ANKLE].visibility ?? 0 },
      });
      setCalibration(assessment);

      if (assessment.zone === "green") {
        if (greenSinceRef.current === null) greenSinceRef.current = now;
        const heldFor = now - greenSinceRef.current;
        setHoldProgress(Math.min(1, heldFor / HOLD_DURATION_MS));
        if (heldFor >= HOLD_DURATION_MS) setCanRecord(true);
      } else {
        greenSinceRef.current = null;
        setHoldProgress(0);
        setCanRecord(false);
      }
    }

    void setup();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = ["video/webm;codecs=vp9", "video/webm"].find((t) =>
      typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported(t) : false,
    );
    if (!mimeType) {
      onUnavailable("Recording isn't supported in this browser.");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onRecorded(blob, mimeType);
    };
    recorder.start();
    recorderRef.current = recorder;
    setStatus("recording");
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  const zoneColor = calibration ? ZONE_COLOR[calibration.zone] : "var(--muted)";

  return (
    <div className="surface-card rounded-2xl p-4">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} muted playsInline className="w-full" />
      </div>

      {status === "loading" ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Starting camera…</p>
      ) : null}

      {status === "ready" ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full transition-all"
              style={{ width: `${calibration?.percent ?? 0}%`, backgroundColor: zoneColor }}
            />
          </div>
          <p className="mt-2 text-sm" style={{ color: zoneColor }}>
            {calibration?.message ?? "Step into frame, side-on to the camera."}
          </p>
          {holdProgress > 0 && holdProgress < 1 ? (
            <p className="mt-1 text-xs text-[var(--muted-2)]">Hold it… {Math.round(holdProgress * 100)}%</p>
          ) : null}
          <button
            type="button"
            disabled={!canRecord}
            onClick={startRecording}
            className="mt-4 w-full rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {canRecord ? "Record" : "Get a good side-on angle first"}
          </button>
        </div>
      ) : null}

      {status === "recording" ? (
        <button
          type="button"
          onClick={stopRecording}
          className="mt-4 w-full rounded-full bg-[var(--critical)] px-4 py-2 text-sm font-medium text-white"
        >
          Stop recording
        </button>
      ) : null}
    </div>
  );
}
