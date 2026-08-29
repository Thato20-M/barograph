/**
 * Advisory engine -- layer 2 (optional).
 *
 * Turns the findings from layer 1 into a short piece of prose. Two rules
 * govern this layer:
 *
 *   1. The model receives *computed metrics*, never raw API JSON. It is
 *      interpreting arithmetic that already happened, not doing the
 *      arithmetic itself.
 *   2. It is never load-bearing. If the endpoint is absent, unconfigured or
 *      slow, the rules engine output stands on its own and the user loses
 *      nothing but a paragraph.
 *
 * The key lives in the serverless function (see api/advise.ts), never in this
 * bundle. Anything shipped to the browser is public.
 */
import type { Advisory, DerivedMetrics, Normals, Station } from "../types";
import { describeCode } from "./wmo";

const ENDPOINT = import.meta.env.VITE_ADVISORY_ENDPOINT ?? "";

export function llmEnabled(): boolean {
  return ENDPOINT.length > 0;
}

export interface BriefingRequest {
  place: string;
  localTime: string;
  conditions: string;
  metrics: Record<string, string>;
  findings: Array<{ severity: string; title: string; basis: string }>;
}

export function buildRequest(
  station: Station,
  d: DerivedMetrics,
  advisories: Advisory[],
  normals: Normals | null
): BriefingRequest {
  const metrics: Record<string, string> = {
    air_temperature_c: station.temp.toFixed(1),
    apparent_temperature_c: `${d.apparent.value.toFixed(1)} (via ${d.apparent.method})`,
    dew_point_c: d.dewPoint.toFixed(1),
    dew_point_spread_c: d.spread.toFixed(1),
    relative_humidity_pct: String(Math.round(station.humidity)),
    wind_kmh: station.windKmh.toFixed(1),
    surface_pressure_hpa: station.pressure.toFixed(1),
    comfort_index: `${d.comfort.score}/100 (${d.comfort.band})`,
    uv_index_max: station.uvIndexMax.toFixed(1)
  };
  if (d.pressureTendency !== null) {
    metrics.pressure_change_3h_hpa = d.pressureTendency.toFixed(1);
  }
  if (normals) {
    metrics.anomaly_vs_1991_2020 = `${normals.z >= 0 ? "+" : ""}${normals.z.toFixed(2)} sd (normal ${normals.mean.toFixed(1)} degC)`;
  }

  return {
    place: `${station.place.name}, ${station.place.country}`,
    localTime: station.observedAt,
    conditions: describeCode(station.weatherCode),
    metrics,
    findings: advisories.map((a) => ({ severity: a.severity, title: a.title, basis: a.basis }))
  };
}

/**
 * Returns narrative prose, or null on any failure. Callers treat null as
 * "no narrative available" and show the rules-engine output alone.
 */
export async function fetchBriefing(req: BriefingRequest, signal?: AbortSignal): Promise<string | null> {
  if (!llmEnabled()) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { briefing?: string };
    return data.briefing?.trim() || null;
  } catch {
    return null;
  }
}
