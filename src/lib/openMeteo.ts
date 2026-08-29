/**
 * Open-Meteo client.
 *
 * No API key: the forecast, geocoding and archive endpoints are open for
 * non-commercial use under CC BY 4.0. That matters here beyond convenience --
 * it means the deployed demo works for anyone who opens it, with no secret
 * to leak and no key for a scraper to find in the bundle.
 */
import type { Place, Station, HourlyPoint, Normals } from "../types";
import { mean, stdDev, percentileOf } from "./physics";

const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

/** WMO standard climate normal period. */
export const NORMAL_START = 1991;
export const NORMAL_END = 2020;
/** Half-width in days of the calendar window sampled around today's date. */
export const WINDOW_DAYS = 2;

export class ApiError extends Error {
  constructor(message: string, readonly kind: "notfound" | "network" | "server") {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError("Could not reach Open-Meteo. Check your connection.", "network");
  }
  if (!res.ok) {
    throw new ApiError(`Open-Meteo returned ${res.status}.`, "server");
  }
  return (await res.json()) as T;
}

interface GeocodeResponse {
  results?: Array<{
    id: number;
    name: string;
    country: string;
    country_code: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    elevation: number;
    timezone: string;
  }>;
}

export async function searchPlaces(query: string, count = 6): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${GEOCODE}?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`;
  const data = await getJson<GeocodeResponse>(url);
  return (data.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    countryCode: r.country_code,
    admin1: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
    elevation: r.elevation,
    timezone: r.timezone
  }));
}

interface ForecastResponse {
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    surface_pressure: number;
    wind_speed_10m: number;
    weather_code: number;
    cloud_cover: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    surface_pressure: number[];
    wind_speed_10m: number[];
  };
  daily: { sunrise: string[]; sunset: string[]; uv_index_max: number[] };
}

export async function fetchStation(place: Place): Promise<Station> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,weather_code,cloud_cover,is_day",
    hourly: "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m",
    daily: "sunrise,sunset,uv_index_max",
    timezone: place.timezone || "auto",
    past_days: "1",
    forecast_days: "2",
    wind_speed_unit: "kmh"
  });

  const d = await getJson<ForecastResponse>(`${FORECAST}?${params}`);

  const hourly: HourlyPoint[] = d.hourly.time.map((t, i) => ({
    time: t,
    temp: d.hourly.temperature_2m[i],
    humidity: d.hourly.relative_humidity_2m[i],
    pressure: d.hourly.surface_pressure[i],
    windKmh: d.hourly.wind_speed_10m[i]
  }));

  // The API returns local wall-clock strings; match on the hour Open-Meteo
  // reports as "current" rather than on the browser's own clock.
  const currentHour = d.current.time.slice(0, 13);
  let nowIndex = hourly.findIndex((h) => h.time.slice(0, 13) === currentHour);
  if (nowIndex < 0) nowIndex = Math.min(24, hourly.length - 1);

  return {
    place,
    observedAt: d.current.time,
    temp: d.current.temperature_2m,
    humidity: d.current.relative_humidity_2m,
    windKmh: d.current.wind_speed_10m,
    pressure: d.current.surface_pressure,
    cloudCover: d.current.cloud_cover,
    weatherCode: d.current.weather_code,
    isDay: d.current.is_day === 1,
    sunrise: d.daily.sunrise[1] ?? d.daily.sunrise[0],
    sunset: d.daily.sunset[1] ?? d.daily.sunset[0],
    uvIndexMax: d.daily.uv_index_max[1] ?? d.daily.uv_index_max[0] ?? 0,
    hourly,
    nowIndex
  };
}

interface ArchiveResponse {
  daily: { time: string[]; temperature_2m_mean: (number | null)[] };
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Compares today against the 1991-2020 climate normal for this calendar date.
 *
 * One archive request returns thirty years of daily means; the calendar
 * window is filtered client-side. Sampling +/- WINDOW_DAYS around the date
 * gives ~150 observations instead of 30, which is the difference between a
 * standard deviation you can quote and one you cannot.
 */
export async function fetchNormals(place: Place, todayMean: number): Promise<Normals> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    start_date: `${NORMAL_START}-01-01`,
    end_date: `${NORMAL_END}-12-31`,
    daily: "temperature_2m_mean",
    timezone: place.timezone || "auto"
  });

  const d = await getJson<ArchiveResponse>(`${ARCHIVE}?${params}`);

  const now = new Date();
  const target = new Date(Date.UTC(2001, now.getMonth(), now.getDate()));
  const keep = new Set<string>();
  for (let off = -WINDOW_DAYS; off <= WINDOW_DAYS; off++) {
    const dd = new Date(target.getTime() + off * 86_400_000);
    keep.add(`${pad(dd.getUTCMonth() + 1)}-${pad(dd.getUTCDate())}`);
  }

  const values: number[] = [];
  d.daily.time.forEach((t, i) => {
    const v = d.daily.temperature_2m_mean[i];
    if (v !== null && v !== undefined && keep.has(t.slice(5))) values.push(v);
  });

  if (values.length < 10) {
    throw new ApiError("Not enough archive data at this location.", "server");
  }

  const m = mean(values);
  const sd = stdDev(values);
  const lo = new Date(target.getTime() - WINDOW_DAYS * 86_400_000);
  const hi = new Date(target.getTime() + WINDOW_DAYS * 86_400_000);

  return {
    period: `${NORMAL_START}-${NORMAL_END}`,
    window: `${lo.getUTCDate()} ${MONTHS[lo.getUTCMonth()]} - ${hi.getUTCDate()} ${MONTHS[hi.getUTCMonth()]}`,
    samples: values.length,
    mean: m,
    sd,
    min: Math.min(...values),
    max: Math.max(...values),
    values,
    todayMean,
    z: sd > 0 ? (todayMean - m) / sd : 0,
    percentile: percentileOf(values, todayMean)
  };
}
