import type { Normals } from "../types";

const f1 = (x: number) => x.toFixed(1);

/**
 * Today against the WMO standard climate normal for this calendar date.
 * The strip is a histogram of every historical daily mean in the window,
 * with today marked on it -- a z-score is easier to trust when you can see
 * the distribution it came from.
 */
export default function AnomalyPanel({ normals, loading }: { normals: Normals | null; loading: boolean }) {
  if (loading) {
    return (
      <section className="anomaly">
        <div className="sec-head">
          <h2>Against the record</h2>
          <p>Reading thirty years of reanalysis for this date…</p>
        </div>
        <div className="anom-skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (!normals) return null;

  const { values, mean, sd, todayMean, z, percentile, period, window, samples } = normals;

  const BINS = 28;
  const lo = Math.min(...values, todayMean) - 0.5;
  const hi = Math.max(...values, todayMean) + 0.5;
  const span = hi - lo || 1;
  const counts = new Array(BINS).fill(0);
  values.forEach((v) => {
    const b = Math.min(BINS - 1, Math.floor(((v - lo) / span) * BINS));
    counts[b]++;
  });
  const peak = Math.max(...counts, 1);

  const W = 640, H = 130, padX = 8, padB = 26;
  const bw = (W - padX * 2) / BINS;
  const xOf = (v: number) => padX + ((v - lo) / span) * (W - padX * 2);
  const todayX = xOf(todayMean);
  const meanX = xOf(mean);

  const verdict =
    Math.abs(z) < 0.5 ? "close to normal"
    : Math.abs(z) < 1 ? (z > 0 ? "mildly warm" : "mildly cool")
    : Math.abs(z) < 2 ? (z > 0 ? "notably warm" : "notably cool")
    : z > 0 ? "exceptionally warm" : "exceptionally cold";

  return (
    <section className="anomaly">
      <div className="sec-head">
        <h2>Against the record</h2>
        <p>
          Today compared with the {period} climate normal — the WMO standard reference period — for {window}.
          Sampling a five-day calendar window across thirty years gives {samples} observations rather than 30,
          which is the difference between a standard deviation worth quoting and one that is not.
        </p>
      </div>

      <div className="anom-figures">
        <div className="fig">
          <div className="k">Today</div>
          <div className="v">{f1(todayMean)}<small>°C</small></div>
        </div>
        <div className="fig">
          <div className="k">{period} normal</div>
          <div className="v">{f1(mean)}<small>±{f1(sd)}</small></div>
        </div>
        <div className="fig">
          <div className="k">z-score</div>
          <div className={`v ${z >= 0 ? "warm" : "cool"}`}>{z >= 0 ? "+" : ""}{z.toFixed(2)}</div>
        </div>
        <div className="fig">
          <div className="k">Percentile</div>
          <div className="v">{Math.round(percentile)}<small>th</small></div>
        </div>
      </div>

      <svg className="dist" viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Today is ${verdict}, at the ${Math.round(percentile)}th percentile of the ${period} record`}>
        {counts.map((c, i) => {
          const h = (c / peak) * (H - padB - 14);
          return (
            <rect key={i} x={padX + i * bw + 0.6} y={H - padB - h}
                  width={Math.max(1, bw - 1.2)} height={h}
                  fill="var(--ink)" opacity="0.16" />
          );
        })}
        <line x1={padX} y1={H - padB} x2={W - padX} y2={H - padB} stroke="var(--ink)" strokeWidth="1.25" />

        <line x1={meanX} y1={16} x2={meanX} y2={H - padB} stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={meanX} y={11} textAnchor="middle" className="dist-lab">NORMAL</text>

        <line x1={todayX} y1={16} x2={todayX} y2={H - padB} stroke="var(--trace)" strokeWidth="2" />
        <circle cx={todayX} cy={H - padB} r="4.5" fill="var(--trace)" />
        <text x={todayX} y={11} textAnchor="middle" className="dist-lab trace">TODAY</text>

        <text x={padX} y={H - 8} className="dist-axis">{f1(lo)}°</text>
        <text x={W - padX} y={H - 8} textAnchor="end" className="dist-axis">{f1(hi)}°</text>
      </svg>

      <p className="anom-read">
        Today is <b>{verdict}</b> for this date. It sits at the {Math.round(percentile)}th percentile of
        the {samples} observations on record, {f1(Math.abs(todayMean - mean))} °C {todayMean >= mean ? "above" : "below"} the normal.
      </p>
    </section>
  );
}
