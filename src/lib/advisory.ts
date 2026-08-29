/**
 * Advisory engine -- layer 1.
 *
 * Rules over the *derived* quantities, not the raw feed. That distinction is
 * the whole design: "it is 34 degrees" is a reading, whereas "the dew point
 * is 23 degrees and the wind is under 8 km/h, so sweat will not evaporate
 * and heat will accumulate faster than you can shed it" is a conclusion, and
 * only the second one is useful.
 *
 * This layer is deterministic. It runs offline, costs nothing, cannot
 * hallucinate, and always produces the same output for the same input --
 * which is exactly what you want carrying any advice with a safety component.
 * The optional language layer in llm.ts rewrites these findings in prose; it
 * never generates them, and it is never the only thing standing between the
 * user and a heat warning.
 */
import type { Advisory, DerivedMetrics, Normals, Station } from "../types";
import { apparentTemperature, comfortScore, dewPoint, humidityFeel, pressureTendency, tendencyLabel, vapourPressure } from "./physics";
import { describeCode, isThunder } from "./wmo";

const f1 = (x: number) => x.toFixed(1);

export function derive(station: Station): DerivedMetrics {
  const { temp, humidity, windKmh } = station;
  const apparent = apparentTemperature(temp, humidity, windKmh);
  const td = dewPoint(temp, humidity);
  const pressures = station.hourly.slice(0, station.nowIndex + 1).map((h) => h.pressure);
  return {
    dewPoint: td,
    spread: temp - td,
    vapourPressure: vapourPressure(temp, humidity),
    apparent,
    comfort: comfortScore(apparent.value, humidity, windKmh),
    pressureTendency: pressureTendency(pressures)
  };
}

/** Best comfort window in the next 24 hours, if one is meaningfully better than now. */
export function bestWindow(station: Station): { start: string; end: string; score: number } | null {
  const ahead = station.hourly.slice(station.nowIndex, station.nowIndex + 25);
  if (ahead.length < 4) return null;

  const scored = ahead.map((h) => {
    const at = apparentTemperature(h.temp, h.humidity, h.windKmh);
    return { time: h.time, score: comfortScore(at.value, h.humidity, h.windKmh).score };
  });

  let best = { i: 0, avg: -1 };
  for (let i = 0; i + 2 < scored.length; i++) {
    const avg = (scored[i].score + scored[i + 1].score + scored[i + 2].score) / 3;
    if (avg > best.avg) best = { i, avg };
  }
  if (best.avg - scored[0].score < 8) return null;
  return { start: scored[best.i].time, end: scored[best.i + 2].time, score: Math.round(best.avg) };
}

const hhmm = (iso: string) => iso.slice(11, 16);

export function buildAdvisories(
  station: Station,
  d: DerivedMetrics,
  normals: Normals | null
): Advisory[] {
  const out: Advisory[] = [];
  const { temp, humidity, windKmh, uvIndexMax, weatherCode } = station;
  const AT = d.apparent.value;

  /* --- heat --- */
  if (AT >= 41) {
    out.push({
      id: "heat-critical",
      severity: "critical",
      title: "Dangerous heat load",
      body: "Sustained outdoor exertion is unsafe. Stay in shade or cooled air, drink before you feel thirsty, and treat cramps, nausea or a headache as a signal to stop immediately.",
      basis: `Apparent temperature ${f1(AT)} degC by ${d.apparent.method}`
    });
  } else if (AT >= 32) {
    out.push({
      id: "heat-warning",
      severity: "warning",
      title: "Heat strain likely with exertion",
      body: "Move hard physical activity to early morning or after sunset. Roughly 500 ml of water per hour of activity, and shade breaks every half hour.",
      basis: `Apparent temperature ${f1(AT)} degC, ${f1(AT - temp)} degC above the air temperature`
    });
  }

  if (d.dewPoint >= 21 && windKmh < 10 && temp >= 26) {
    out.push({
      id: "evaporative-failure",
      severity: "warning",
      title: "Sweat will not evaporate efficiently",
      body: "Humid, still air blocks your main cooling route, so heat accumulates even at a moderate air temperature. A fan or any moving air helps disproportionately here.",
      basis: `Dew point ${f1(d.dewPoint)} degC (${humidityFeel(d.dewPoint)}), wind only ${f1(windKmh)} km/h`
    });
  }

  if (temp >= 28 && humidity < 25) {
    out.push({
      id: "dry-heat",
      severity: "notice",
      title: "Dehydration risk is hidden in dry heat",
      body: "Sweat evaporates before you notice it, so thirst lags well behind actual fluid loss. Drink on a schedule rather than on demand.",
      basis: `${f1(temp)} degC at ${Math.round(humidity)}% relative humidity`
    });
  }

  /* --- cold --- */
  if (AT <= -10) {
    out.push({
      id: "cold-critical",
      severity: "critical",
      title: "Frostbite risk on exposed skin",
      body: "Cover every exposed surface, particularly ears, nose and fingertips. Limit continuous time outdoors and watch for numbness, which arrives before visible damage.",
      basis: `Wind chill ${f1(AT)} degC against an air temperature of ${f1(temp)} degC`
    });
  } else if (AT <= 2 && d.apparent.branch === "cold") {
    out.push({
      id: "cold-warning",
      severity: "warning",
      title: "Wind is doing most of the cooling",
      body: "A windproof outer layer will help more than a thicker one, because the wind is stripping the insulating air off your skin faster than the cold itself is a problem.",
      basis: `Wind chill ${f1(AT)} degC, ${f1(temp - AT)} degC below the air temperature`
    });
  }

  /* --- wind --- */
  if (windKmh >= 50) {
    out.push({
      id: "wind-high",
      severity: "warning",
      title: "Wind strong enough to affect footing and driving",
      body: "Expect difficulty with high-sided vehicles and cycling. Secure loose objects outdoors and stay clear of large trees.",
      basis: `Sustained wind ${f1(windKmh)} km/h`
    });
  }

  /* --- pressure --- */
  if (d.pressureTendency !== null && d.pressureTendency <= -3) {
    out.push({
      id: "pressure-falling",
      severity: "notice",
      title: "Conditions deteriorating",
      body: "A pressure fall this steep normally means a weather system is arriving within hours. Worth bringing outdoor plans forward.",
      basis: `Surface pressure ${tendencyLabel(d.pressureTendency)}: ${f1(d.pressureTendency)} hPa over 3 hours`
    });
  } else if (d.pressureTendency !== null && d.pressureTendency >= 3) {
    out.push({
      id: "pressure-rising",
      severity: "good",
      title: "Conditions improving",
      body: "Rising pressure usually brings clearing skies and lighter wind over the next several hours.",
      basis: `Surface pressure ${tendencyLabel(d.pressureTendency)}: +${f1(d.pressureTendency)} hPa over 3 hours`
    });
  }

  /* --- fog --- */
  if (d.spread <= 2.5 && windKmh < 12) {
    out.push({
      id: "fog-risk",
      severity: "notice",
      title: "Fog or low cloud likely",
      body: "Air temperature is close to its dew point in light wind, so visibility can drop quickly. Allow extra time if you are driving.",
      basis: `Dew point spread only ${f1(d.spread)} degC`
    });
  }

  /* --- UV --- */
  if (uvIndexMax >= 8 && station.isDay) {
    out.push({
      id: "uv-high",
      severity: uvIndexMax >= 11 ? "warning" : "notice",
      title: uvIndexMax >= 11 ? "Extreme UV today" : "High UV today",
      body: "Unprotected skin burns in well under half an hour around solar noon. Sunscreen, a hat and shade between 10:00 and 15:00.",
      basis: `Peak UV index ${f1(uvIndexMax)} today`
    });
  }

  /* --- storms --- */
  if (isThunder(weatherCode)) {
    out.push({
      id: "thunder",
      severity: "warning",
      title: "Thunderstorm reported at the station",
      body: "Get indoors or into a hard-topped vehicle. Open ground, water and isolated trees are the places to avoid.",
      basis: `Station reports: ${describeCode(weatherCode)}`
    });
  }

  /* --- climate anomaly --- */
  if (normals && Math.abs(normals.z) >= 2) {
    const warmer = normals.z > 0;
    out.push({
      id: "anomaly",
      severity: "notice",
      title: warmer ? "Unusually warm for this date" : "Unusually cold for this date",
      body: `Today sits ${f1(Math.abs(normals.z))} standard deviations ${warmer ? "above" : "below"} the ${normals.period} normal for this calendar window. Fewer than 5% of days on record were this far out.`,
      basis: `${f1(normals.todayMean)} degC against a normal of ${f1(normals.mean)} +/- ${f1(normals.sd)} degC, n = ${normals.samples}`
    });
  }

  /* --- the good case --- */
  if (!out.some((a) => a.severity === "critical" || a.severity === "warning") && d.comfort.score >= 75) {
    out.push({
      id: "favourable",
      severity: "good",
      title: "Good conditions for being outside",
      body: "Nothing in the current readings suggests you need to plan around the weather.",
      basis: `Comfort index ${d.comfort.score}/100 (${d.comfort.band})`
    });
  }

  const win = bestWindow(station);
  if (win) {
    out.push({
      id: "best-window",
      severity: "good",
      title: `Better window later: ${hhmm(win.start)} to ${hhmm(win.end)}`,
      body: "Comfort improves meaningfully in this period compared with now, based on the forecast temperature, humidity and wind.",
      basis: `Projected comfort index ${win.score}/100 over that window`
    });
  }

  const rank: Record<Advisory["severity"], number> = { critical: 0, warning: 1, notice: 2, good: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
