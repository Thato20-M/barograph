import type { Station } from "../types";

const mins = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const hhmm = (iso: string) => iso.slice(11, 16);

export default function SolarArc({ station }: { station: Station }) {
  const rise = mins(station.sunrise);
  const set = mins(station.sunset);
  const now = mins(station.observedAt);
  const day = Math.max(1, set - rise);
  const frac = Math.min(1, Math.max(0, (now - rise) / day));
  const isDay = now >= rise && now <= set;

  const W = 320, H = 132, pad = 26, base = H - 30;
  const x0 = pad, x1 = W - pad, r = (x1 - x0) / 2, cx = (x0 + x1) / 2;
  const ang = Math.PI * (1 - frac);
  const sx = cx + r * Math.cos(ang);
  const sy = base - r * Math.sin(ang) * 0.7;

  const remain = isDay ? set - now : 0;
  const ticks = [1, 2, 3, 4, 5].map((i) => {
    const a = Math.PI * (1 - i / 6);
    return { x: cx + r * Math.cos(a), y: base - r * Math.sin(a) * 0.7 };
  });

  return (
    <div>
      <svg className="dial" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sun position: ${isDay ? "day" : "night"}`}>
        <line x1={x0 - 8} y1={base} x2={x1 + 8} y2={base} stroke="var(--ink)" strokeWidth="1.5" />
        <path
          d={`M ${x0} ${base} A ${r} ${r * 0.7} 0 0 1 ${x1} ${base}`}
          fill="none"
          stroke="var(--graticule)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        {ticks.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={1.6} fill="var(--graticule)" />
        ))}
        {isDay ? (
          <>
            <line x1={sx} y1={sy} x2={sx} y2={base} stroke="var(--trace)" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
            <circle cx={sx} cy={sy} r={9} fill="var(--trace)" />
            <circle cx={sx} cy={sy} r={15} fill="none" stroke="var(--trace)" strokeWidth="1" opacity="0.35" />
          </>
        ) : (
          <circle cx={cx} cy={base - 6} r={8} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" />
        )}
      </svg>
      <div className="daylight">
        <span>Rise <b>{hhmm(station.sunrise)}</b></span>
        <span>{isDay ? <b>{Math.floor(remain / 60)}h {remain % 60}m left</b> : <b>Night</b>}</span>
        <span>Set <b>{hhmm(station.sunset)}</b></span>
      </div>
    </div>
  );
}
