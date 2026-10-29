"use client";

import type { BookSummary } from "@/lib/srs";

export function MemoryRing({ percent, size = 96, label = "記憶度" }: { percent: number; size?: number; label?: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const tone = percent >= 70 ? "#059669" : percent >= 35 ? "#2563eb" : "#d97706";
  return (
    <div className="relative flex-none" style={{ width: size, height: size }} role="img" aria-label={`${label} ${percent}%`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, percent)) / 100)}
          style={{ transition: "stroke-dashoffset .5s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black leading-none text-slate-900">{percent}<span className="text-xs">%</span></span>
        <span className="mt-0.5 text-[10px] font-bold text-slate-400">{label}</span>
      </div>
    </div>
  );
}

export function StatusBar({ summary }: { summary: BookSummary }) {
  const total = Math.max(1, summary.total);
  const parts = [
    { label: "定着", count: summary.masteredCount, color: "bg-emerald-500" },
    { label: "学習中", count: summary.learningCount, color: "bg-blue-500" },
    { label: "未学習", count: summary.newCount, color: "bg-slate-200" },
  ];
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {parts.map((part) => (
          <div key={part.label} className={part.color} style={{ width: `${(part.count / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-600">
        {parts.map((part) => (
          <span key={part.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${part.color}`} />
            {part.label} {part.count}語
          </span>
        ))}
      </div>
    </div>
  );
}

export function ForecastChart({ points }: { points: Array<{ day: number; percent: number }> }) {
  const w = 320;
  const h = 150;
  const pad = { l: 30, r: 10, t: 10, b: 24 };
  const x = (day: number) => pad.l + (day / 30) * (w - pad.l - pad.r);
  const y = (percent: number) => pad.t + (1 - percent / 100) * (h - pad.t - pad.b);
  const line = points.map((point) => `${x(point.day).toFixed(1)},${y(point.percent).toFixed(1)}`).join(" ");
  const area = `${x(0)},${y(0)} ${line} ${x(30)},${y(0)}`;
  const at = (day: number) => points.find((point) => point.day === day)?.percent ?? 0;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="今から復習しなかった場合の記憶度の予測">
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={w - pad.r} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.l - 4} y={y(tick) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{tick}%</text>
          </g>
        ))}
        <line x1={pad.l} x2={w - pad.r} y1={y(70)} y2={y(70)} stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" />
        <text x={w - pad.r} y={y(70) - 3} textAnchor="end" fontSize="9" fill="#059669">定着ライン70%</text>
        <polygon points={area} fill="#3b82f6" opacity="0.12" />
        <polyline points={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
        {[0, 7, 14, 30].map((day) => (
          <g key={day}>
            <circle cx={x(day)} cy={y(at(day))} r="3.5" fill="#2563eb" />
            <text x={x(day)} y={h - 8} textAnchor="middle" fontSize="9" fill="#64748b">{day === 0 ? "今日" : `${day}日後`}</text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-center text-xs font-bold text-slate-500">
        このまま復習しないと…今日 {at(0)}% → 7日後 {at(7)}% → 30日後 {at(30)}%
      </p>
    </div>
  );
}
