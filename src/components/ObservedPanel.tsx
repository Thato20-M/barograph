import type { DerivedMetrics, Station } from "../types";
import { describeCode } from "../lib/wmo";
import SolarArc from "./SolarArc";

const f1 = (x: number) => x.toFixed(1);

export default function ObservedPanel({ station, metrics }: { station: Station; metrics: DerivedMetrics }) {
  return (
    <div className="grid">
      <section className="cell">
        <div className="eyebrow">Observed</div>
        <div className="reading">
          <span className="val">{Math.round(station.temp)}</span>
          <span className="unit">°C</span>
        </div>
        <div className="sky">{describeCode(station.weatherCode)}</div>
        <div className="feels">
          Feels like <b>{f1(metrics.apparent.value)} °C</b> — {metrics.apparent.method}
        </div>
        <div className="pairs">
          <div className="pair"><div className="k">Humidity</div><div className="v">{Math.round(station.humidity)}%</div></div>
          <div className="pair"><div className="k">Wind</div><div className="v">{f1(station.windKmh)}<small> km/h</small></div></div>
          <div className="pair"><div className="k">Pressure</div><div className="v">{Math.round(station.pressure)}<small> hPa</small></div></div>
          <div className="pair"><div className="k">Cloud</div><div className="v">{Math.round(station.cloudCover)}%</div></div>
        </div>
      </section>

      <section className="cell">
        <div className="eyebrow">Solar arc</div>
        <SolarArc station={station} />
      </section>
    </div>
  );
}
