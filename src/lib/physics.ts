/**
 * Meteorological formulas.
 *
 * Every function here is pure and unit-tested. The station reports three
 * numbers -- temperature, relative humidity, wind speed -- and everything
 * else the app displays is derived from them here.
 *
 * Each formula has a validity band. Where a band matters, the caller is
 * told which branch was taken rather than being handed a number with no
 * provenance.
 */

/** Magnus-Tetens coefficients, Alduchov & Eskridge (1996). Valid -45..60 degC. */
export const MAGNUS_B = 17.625;
export const MAGNUS_C = 243.04;

/** Intermediate gamma term of the Magnus-Tetens dew-point relation. */
export function magnusGamma(tempC: number, humidityPct: number): number {
  const rh = Math.max(humidityPct, 0.1) / 100;
  return Math.log(rh) + (MAGNUS_B * tempC) / (MAGNUS_C + tempC);
}

/** Dew point in degC: the temperature air must cool to before it saturates. */
export function dewPoint(tempC: number, humidityPct: number): number {
  const g = magnusGamma(tempC, humidityPct);
  return (MAGNUS_C * g) / (MAGNUS_B - g);
}

/** Actual water-vapour pressure in hPa (Magnus form). */
export function vapourPressure(tempC: number, humidityPct: number): number {
  return (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
}

/** JAG/TI wind chill. Valid for T <= 10 degC and v > 4.8 km/h. */
export function windChill(tempC: number, windKmh: number): number {
  const p = Math.pow(windKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * p + 0.3965 * tempC * p;
}

/** Rothfusz heat index. Regression is defined in Fahrenheit; returns degC. */
export function heatIndex(tempC: number, humidityPct: number): number {
  const F = (tempC * 9) / 5 + 32;
  const R = humidityPct;
  const hi =
    -42.379 +
    2.04901523 * F +
    10.14333127 * R -
    0.22475541 * F * R -
    0.00683783 * F * F -
    0.05481717 * R * R +
    0.00122874 * F * F * R +
    0.00085282 * F * R * R -
    0.00000199 * F * F * R * R;
  return ((hi - 32) * 5) / 9;
}

/** Steadman apparent temperature for the moderate band. Wind in m/s. */
export function steadman(tempC: number, humidityPct: number, windMs: number): number {
  return tempC + 0.33 * vapourPressure(tempC, humidityPct) - 0.7 * windMs - 4.0;
}

export interface ApparentResult {
  value: number;
  method: string;
  branch: "cold" | "hot" | "mid";
}

/**
 * Selects the formula the conditions actually fall into, and names it.
 * Reporting an unqualified "feels like" number hides the fact that three
 * different models are in play across the temperature range.
 */
export function apparentTemperature(
  tempC: number,
  humidityPct: number,
  windKmh: number
): ApparentResult {
  if (tempC <= 10 && windKmh > 4.8) {
    return { value: windChill(tempC, windKmh), method: "JAG/TI wind chill", branch: "cold" };
  }
  if (tempC >= 27 && humidityPct >= 40) {
    return { value: heatIndex(tempC, humidityPct), method: "Rothfusz heat index", branch: "hot" };
  }
  return {
    value: steadman(tempC, humidityPct, windKmh / 3.6),
    method: "Steadman apparent temperature",
    branch: "mid"
  };
}

/* ---- comfort composite ---------------------------------------------- */

export const COMFORT_IDEAL_T = 21;
export const COMFORT_IDEAL_RH = 45;

export interface ComfortResult {
  score: number;
  pT: number;
  pH: number;
  pW: number;
  band: string;
}

/**
 * Composite comfort score, 0-100.
 *
 * This one is my own construction, not a published index. Three penalties
 * are subtracted from a perfect score, each capped so no single term can
 * dominate. The 1.35 exponent on the temperature term makes large
 * departures hurt disproportionately, which matches how discomfort scales
 * in practice -- but the weights are a judgement call and would need
 * calibrating against survey data before I would claim more than that.
 */
export function comfortScore(
  apparentC: number,
  humidityPct: number,
  windKmh: number
): ComfortResult {
  const pT = Math.min(50, Math.pow(Math.abs(apparentC - COMFORT_IDEAL_T), 1.35) * 1.6);
  const pH = Math.min(30, Math.abs(humidityPct - COMFORT_IDEAL_RH) * 0.45);
  const pW = Math.min(20, Math.max(0, windKmh - 18) * 0.8);
  const score = Math.max(0, Math.round(100 - pT - pH - pW));
  return { score, pT, pH, pW, band: comfortBand(score) };
}

export function comfortBand(score: number): string {
  if (score >= 80) return "Comfortable";
  if (score >= 60) return "Acceptable";
  if (score >= 40) return "Noticeable strain";
  if (score >= 20) return "Uncomfortable";
  return "Hazardous";
}

/**
 * How dew point actually reads to a person. Dew point tracks perceived
 * mugginess far better than relative humidity, which is why forecasters use it.
 */
export function humidityFeel(dewPointC: number): string {
  if (dewPointC >= 24) return "oppressive";
  if (dewPointC >= 21) return "very humid";
  if (dewPointC >= 18) return "muggy";
  if (dewPointC >= 13) return "comfortable";
  if (dewPointC >= 5) return "dry";
  return "very dry";
}

/**
 * Three-hour pressure tendency in hPa -- the classic barometric forecasting
 * signal. A fall steeper than 3 hPa/3h indicates a system moving in.
 */
export function pressureTendency(series: number[], hoursBack = 3): number | null {
  if (series.length <= hoursBack) return null;
  const now = series[series.length - 1];
  const then = series[series.length - 1 - hoursBack];
  if (now === undefined || then === undefined) return null;
  return now - then;
}

export function tendencyLabel(delta: number): string {
  if (delta <= -3) return "falling rapidly";
  if (delta <= -1) return "falling";
  if (delta < 1) return "steady";
  if (delta < 3) return "rising";
  return "rising rapidly";
}

/* ---- statistics for the climate-normal comparison -------------------- */

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1 denominator). */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Fraction of the reference distribution at or below `value`, as a percentage. */
export function percentileOf(xs: number[], value: number): number {
  if (!xs.length) return NaN;
  const below = xs.filter((x) => x <= value).length;
  return (below / xs.length) * 100;
}
