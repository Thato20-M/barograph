/** Shapes returned by Open-Meteo, narrowed to what this app uses. */

export interface Place {
  id: number;
  name: string;
  country: string;
  countryCode: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
}

export interface HourlyPoint {
  /** Local ISO timestamp as returned by the API, e.g. "2026-08-28T14:00". */
  time: string;
  temp: number;
  humidity: number;
  pressure: number;
  windKmh: number;
}

export interface Station {
  place: Place;
  observedAt: string;
  temp: number;
  humidity: number;
  windKmh: number;
  pressure: number;
  cloudCover: number;
  weatherCode: number;
  isDay: boolean;
  sunrise: string;
  sunset: string;
  uvIndexMax: number;
  hourly: HourlyPoint[];
  /** Index into `hourly` of the point nearest to now. */
  nowIndex: number;
}

/** Result of the 1991-2020 climate-normal comparison. */
export interface Normals {
  /** WMO standard reference period. */
  period: string;
  /** Calendar window sampled, e.g. "26 Aug - 30 Aug". */
  window: string;
  samples: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  /** Every historical daily mean in the window, for the distribution strip. */
  values: number[];
  todayMean: number;
  z: number;
  percentile: number;
}

export type Severity = "critical" | "warning" | "notice" | "good";

export interface Advisory {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  /** The computed quantity this conclusion rests on. Shown to the user. */
  basis: string;
}

export interface DerivedMetrics {
  dewPoint: number;
  spread: number;
  vapourPressure: number;
  apparent: { value: number; method: string; branch: "cold" | "hot" | "mid" };
  comfort: { score: number; pT: number; pH: number; pW: number; band: string };
  pressureTendency: number | null;
}
