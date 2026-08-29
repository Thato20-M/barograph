import type { Station } from "../types";
import { dewPoint, tendencyLabel } from "../lib/physics";

const hhmm = (iso: string) => iso.slice(11, 16);

/**
 * The instrument this app is named after: a continuous pressure trace, with
 * temperature and dew point on the same time axis. Pressure is the one
 * variable that tells you where the weather is going rather than where it is.
 */
export default function BarographChart({ station, tendency }: { station: Station; tendency: number | null }) {
  const from = Math.max(0, station.nowIndex - 12);
  const pts = station.hourly.slice(from, from + 37);
  if (pts.length < 6) return null;

  const nowAt = station.nowIndex - from;
  const W = 900, H = 340, L = 52, R = 52, TP = 20, B = 34;
  const X = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);

  const temps = pts.map((p) => p.temp);
  const dews = pts.map((p) => dewPoint(p.temp, p.humidity));
  const press = pts.map((p) => p.pressure);

  const tLo = Math.floor(Math.min(...temps, ...dews) - 2);
  const tHi = Math.ceil(Math.max(...temps, ...dews) + 2);
  const pLo = Math.floor(Math.min(...press) - 1);
  const pHi = Math.ceil(Math.max(...press) + 1);

  const YT = (v: number) => TP + (1 - (v - tLo) / (tHi - tLo)) * (H - TP - B);
  const YP = (v: number) => TP + (1 - (v - pLo) / (pHi - pLo)) * (H - TP - B);

  const line = (vals: number[], y: (v: number) => number) =>
    vals.map((v, i) => `${i ? "L" : "M"} ${X(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const tStep = Math.max(1, Math.round((tHi - tLo) / 5));
  const tTicks: number[] = [];
  for (let v = tLo; v <= tHi; v += tStep) tTicks.push(v);
  const pStep = Math.max(1, Math.round((pHi - pLo) / 4));
  const pTicks: number[] = [];
  for (let v = pLo; v <= pHi; v += pStep) pTicks.push(v);

  return (
    <section className="trace-sec">
      <div className="sec-head row-head">
        <h2>Barograph</h2>
        <div className="legend">
          <span><i className="t" />Temperature</span>
          <span><i className="d" />Dew point</span>
          <span><i className="p" />Pressure</span>
        </div>
      </div>

      {tendency !== null && (
        <p className="tendency">
          Surface pressure <b>{tendencyLabel(tendency)}</b> — {tendency >= 0 ? "+" : ""}{tendency.toFixed(1)} hPa over the last 3 hours.
          {tendency <= -3 && " A fall this steep usually means a system arriving within hours."}
        </p>
      )}

      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label="Temperature, dew point and surface pressure over 36 hours">
        {tTicks.map((v) => (
          <g key={`t${v}`}>
            <line x1={L} y1={YT(v)} x2={W - R} y2={YT(v)} stroke="var(--graticule)" strokeWidth="1" />
            <text x={L - 8} y={YT(v) + 3.5} textAnchor="end" className="ax">{v}°</text>
          </g>
        ))}
        {pTicks.map((v) => (
          <text key={`p${v}`} x={W - R + 8} y={YP(v) + 3.5} className="ax p">{v}</text>
        ))}
        {pts.map((p, i) =>
          i % 6 === 0 ? (
            <g key={`x${i}`}>
              <line x1={X(i)} y1={TP} x2={X(i)} y2={H - B} stroke="var(--graticule)" strokeWidth="1" opacity="0.5" />
              <text x={X(i)} y={H - B + 17} textAnchor="middle" className="ax">{hhmm(p.time)}</text>
            </g>
          ) : null
        )}

        <path d={line(press, YP)} className="press-line" />
        <path d={line(dews, YT)} className="dew-line" />
        <path d={line(temps, YT)} className="temp-line" />

        {nowAt >= 0 && nowAt < pts.length && (
          <>
            <line x1={X(nowAt)} y1={TP} x2={X(nowAt)} y2={H - B} stroke="var(--ink)" strokeWidth="1.25" strokeDasharray="3 3" />
            <circle cx={X(nowAt)} cy={YT(temps[nowAt])} r="4" fill="var(--trace)" />
            <text x={X(nowAt)} y={TP - 6} textAnchor="middle" className="ax now">NOW</text>
          </>
        )}

        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
    </section>
  );
}
