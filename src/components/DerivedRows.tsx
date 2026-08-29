import { useState } from "react";
import type { DerivedMetrics, Station } from "../types";
import { MAGNUS_B, MAGNUS_C, heatIndex, humidityFeel, magnusGamma } from "../lib/physics";

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

interface Row {
  name: string;
  value: string;
  unit: string;
  source: string;
  working: string;
  note: string;
  meter?: number;
}

function buildRows(s: Station, d: DerivedMetrics): Row[] {
  const T = s.temp, RH = s.humidity, V = s.windKmh, vMs = V / 3.6;
  const g = magnusGamma(T, RH);
  const rows: Row[] = [];

  rows.push({
    name: "Dew point",
    value: f1(d.dewPoint),
    unit: "°C",
    source: "Magnus-Tetens · Alduchov & Eskridge (1996)",
    working: `γ  = ln(RH/100) + (b·T)/(c + T)        b = ${MAGNUS_B},  c = ${MAGNUS_C}
   = ln(${f2(RH / 100)}) + (${MAGNUS_B} × ${f1(T)}) / (${MAGNUS_C} + ${f1(T)})
   = ${f2(Math.log(Math.max(RH, 0.1) / 100))} + ${f2((MAGNUS_B * T) / (MAGNUS_C + T))}
   = ${f2(g)}

Td = (c·γ)/(b − γ)
   = (${MAGNUS_C} × ${f2(g)}) / (${MAGNUS_B} − ${f2(g)})
   = ${f1(d.dewPoint)} °C`,
    note: `The temperature air must cool to before it saturates. The spread from air temperature is ${f1(d.spread)} °C — a small spread means fog or dew is close. At ${f1(d.dewPoint)} °C this reads as ${humidityFeel(d.dewPoint)}. Dew point tracks how air actually feels far better than relative humidity, which is why forecasters use it.`
  });

  let working: string, note: string;
  if (d.apparent.branch === "cold") {
    const p = Math.pow(V, 0.16);
    working = `Branch: T ≤ 10 °C and v > 4.8 km/h  →  wind chill

v^0.16 = ${f1(V)}^0.16 = ${f2(p)}

Twc = 13.12 + 0.6215·T − 11.37·v^0.16 + 0.3965·T·v^0.16
    = 13.12 + ${f2(0.6215 * T)} − ${f2(11.37 * p)} + ${f2(0.3965 * T * p)}
    = ${f1(d.apparent.value)} °C`;
    note = "Wind strips the insulating boundary layer off exposed skin, so heat leaves faster than the air temperature alone suggests. The formula is undefined in still air, which is why the branch requires wind above 4.8 km/h.";
  } else if (d.apparent.branch === "hot") {
    const F = (T * 9) / 5 + 32;
    const hiF = (heatIndex(T, RH) * 9) / 5 + 32;
    working = `Branch: T ≥ 27 °C and RH ≥ 40%  →  heat index

Rothfusz regression is defined in Fahrenheit:
T_F = ${f1(T)} × 9/5 + 32 = ${f1(F)} °F

HI = −42.379 + 2.04901523·T + 10.14333127·R
     − 0.22475541·T·R − 0.00683783·T² − 0.05481717·R²
     + 0.00122874·T²·R + 0.00085282·T·R² − 0.00000199·T²·R²

with T = ${f1(F)} °F, R = ${Math.round(RH)}%
HI = ${f1(hiF)} °F = (${f1(hiF)} − 32) × 5/9
   = ${f1(d.apparent.value)} °C`;
    note = "Above body temperature the only cooling route left is evaporation, and humid air blocks it. The regression is a fit to Steadman's 1979 model rather than a derivation from first principles — it holds well inside its validity band and drifts outside it.";
  } else {
    working = `Branch: 10 °C < T < 27 °C  →  Steadman apparent temperature

e = (RH/100) × 6.105 × exp(17.27·T / (237.7 + T))
  = ${f2(RH / 100)} × 6.105 × exp(${f2((17.27 * T) / (237.7 + T))})
  = ${f2(d.vapourPressure)} hPa        (water vapour pressure)

AT = T + 0.33·e − 0.70·v − 4.00          v in m/s
   = ${f1(T)} + ${f2(0.33 * d.vapourPressure)} − ${f2(0.7 * vMs)} − 4.00
   = ${f1(d.apparent.value)} °C`;
    note = "The moderate band is where neither wind chill nor heat index is valid. Steadman's form adds a vapour-pressure term and subtracts a wind term, so humid still air reads warmer than the thermometer and a dry breeze reads cooler.";
  }

  rows.push({
    name: "Apparent temperature",
    value: f1(d.apparent.value),
    unit: "°C",
    source: d.apparent.method,
    working,
    note
  });

  const c = d.comfort;
  rows.push({
    name: "Comfort index",
    value: String(c.score),
    unit: "/100",
    source: "Composite — defined in this project, not a published standard",
    meter: c.score,
    working: `Score = 100 − P_temp − P_humidity − P_wind

P_temp     = min(50, |AT − 21|^1.35 × 1.6)
           = min(50, |${f1(d.apparent.value)} − 21|^1.35 × 1.6)   = ${f1(c.pT)}

P_humidity = min(30, |RH − 45| × 0.45)
           = min(30, |${Math.round(RH)} − 45| × 0.45)    = ${f1(c.pH)}

P_wind     = min(20, max(0, v − 18) × 0.8)
           = min(20, max(0, ${f1(V)} − 18) × 0.8)    = ${f1(c.pW)}

Score = 100 − ${f1(c.pT)} − ${f1(c.pH)} − ${f1(c.pW)} = ${c.score}   (${c.band})`,
    note: "Three penalties against a perfect score, anchored at 21 °C and 45% RH, each capped so no single term dominates. The 1.35 exponent makes large temperature departures hurt disproportionately, which matches how discomfort scales. This one is my own construction — the weights are a judgement call, not a published result, and I would want to calibrate them against survey data before claiming otherwise."
  });

  return rows;
}

export default function DerivedRows({ station, metrics }: { station: Station; metrics: DerivedMetrics }) {
  const [open, setOpen] = useState<number | null>(null);
  const rows = buildRows(station, metrics);

  return (
    <section className="derived">
      <div className="sec-head">
        <h2>Derived quantities</h2>
        <p>The station reports three numbers. Everything below is computed from them — open a row for the equation with the values substituted in.</p>
      </div>
      {rows.map((r, i) => (
        <div className={`row${open === i ? " open" : ""}`} key={r.name}>
          <button className="row-btn" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span className="caret" aria-hidden="true">▶</span>
            <span className="row-name">{r.name}</span>
            <span className="row-val">{r.value}</span>
            <span className="row-unit">{r.unit}</span>
          </button>
          {open === i && (
            <div className="work">
              <div className="src">{r.source}</div>
              <pre>{r.working}</pre>
              {r.meter !== undefined && (
                <div className="meter">
                  <div className="meter-fill" style={{ width: `${r.meter}%` }} />
                  <div className="meter-ticks">
                    {Array.from({ length: 10 }, (_, k) => <i key={k} />)}
                  </div>
                </div>
              )}
              <p className="note">{r.note}</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
