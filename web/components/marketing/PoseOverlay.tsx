const JOINTS = {
  head: [176, 48],
  neck: [172, 78],
  hip: [158, 158],
  frontKnee: [200, 210],
  frontFoot: [212, 268],
  backKnee: [124, 214],
  backFoot: [96, 268],
  shoulder: [180, 92],
  elbow: [224, 108],
  hand: [252, 148],
  batTip: [292, 216],
} as const;

const BONES: [keyof typeof JOINTS, keyof typeof JOINTS][] = [
  ["head", "neck"],
  ["neck", "hip"],
  ["neck", "shoulder"],
  ["shoulder", "elbow"],
  ["elbow", "hand"],
  ["hand", "batTip"],
  ["hip", "frontKnee"],
  ["frontKnee", "frontFoot"],
  ["hip", "backKnee"],
  ["backKnee", "backFoot"],
];

export function PoseOverlay() {
  return (
    <div className="relative aspect-[4/3] w-full max-w-md">
      <svg viewBox="0 0 340 300" className="h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="jointGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-strong)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--accent-strong)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Crease line, grounding the figure in a batting context */}
        <line x1="40" y1="272" x2="320" y2="272" stroke="var(--border-strong)" strokeWidth="1" />

        {BONES.map(([a, b], i) => (
          <line
            key={i}
            x1={JOINTS[a][0]}
            y1={JOINTS[a][1]}
            x2={JOINTS[b][0]}
            y2={JOINTS[b][1]}
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.85"
          />
        ))}

        {Object.entries(JOINTS).map(([key, [x, y]]) => (
          <g key={key}>
            <circle cx={x} cy={y} r="10" fill="url(#jointGlow)" />
            <circle
              cx={x}
              cy={y}
              r="3.5"
              fill="var(--accent-strong)"
              style={{
                animation: "pulse-dot 2.4s ease-in-out infinite",
                animationDelay: `${(x + y) % 10 * 0.15}s`,
                transformOrigin: `${x}px ${y}px`,
              }}
            />
          </g>
        ))}
      </svg>

      <div className="absolute left-[4%] top-[8%] rounded-full border border-[var(--border-strong)] bg-black/60 px-3 py-1 text-xs font-medium text-[var(--accent-strong)] backdrop-blur-sm">
        Head drift 3cm
      </div>
      <div className="absolute bottom-[26%] right-[2%] rounded-full border border-[var(--border-strong)] bg-black/60 px-3 py-1 text-xs font-medium text-[var(--accent-strong)] backdrop-blur-sm">
        Front knee 142°
      </div>
      <div className="absolute bottom-[4%] left-[18%] rounded-full border border-[var(--border-strong)] bg-black/60 px-3 py-1 text-xs font-medium text-[var(--accent-strong)] backdrop-blur-sm">
        Balance 68%
      </div>
    </div>
  );
}
