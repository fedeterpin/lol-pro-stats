"use client";

import { useI18n } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/messages";

// The legacy-score split. It lives in a client component because the segment
// labels also feed `title` attributes, which can't take a <T> element.
const PARTS: { key: string; label: MsgKey; color: string }[] = [
  { key: "titles", label: "player.breakdown.titles", color: "var(--gold)" },
  { key: "stage", label: "player.breakdown.stage", color: "var(--teal)" },
  { key: "longevity", label: "player.breakdown.longevity", color: "#6f86b8" },
  {
    key: "performance",
    label: "player.breakdown.performance",
    color: "#b6784a",
  },
];

export default function ScoreBreakdown({
  breakdown,
}: {
  breakdown: Record<string, number>;
}) {
  const { t } = useI18n();
  const total = PARTS.reduce((s, p) => s + (breakdown[p.key] || 0), 0) || 1;

  return (
    <div className="score-break">
      <div className="score-bar">
        {PARTS.map((p) => {
          const v = breakdown[p.key] || 0;
          if (v <= 0) return null;
          return (
            <span
              key={p.key}
              style={{ width: `${(v / total) * 100}%`, background: p.color }}
              title={`${t(p.label)}: ${v}`}
            />
          );
        })}
      </div>
      <div className="score-legend">
        {PARTS.map((p) => (
          <span key={p.key}>
            <i style={{ background: p.color }} />
            {t(p.label)} <b>{breakdown[p.key] || 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
