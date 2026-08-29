import { describe, it, expect } from "vitest";
import {
  dewPoint,
  vapourPressure,
  windChill,
  heatIndex,
  apparentTemperature,
  comfortScore,
  pressureTendency,
  mean,
  stdDev,
  percentileOf
} from "../physics";

describe("dew point (Magnus-Tetens)", () => {
  it("equals air temperature at saturation", () => {
    expect(dewPoint(20, 100)).toBeCloseTo(20, 1);
    expect(dewPoint(-5, 100)).toBeCloseTo(-5, 1);
  });

  it("is always at or below air temperature", () => {
    for (let t = -20; t <= 45; t += 5) {
      for (let rh = 5; rh <= 100; rh += 5) {
        expect(dewPoint(t, rh)).toBeLessThanOrEqual(t + 1e-6);
      }
    }
  });

  it("matches a published reference value", () => {
    // 25 degC at 60% RH -> ~16.7 degC
    expect(dewPoint(25, 60)).toBeCloseTo(16.7, 1);
  });

  it("rises monotonically with humidity", () => {
    const a = dewPoint(20, 30);
    const b = dewPoint(20, 60);
    const c = dewPoint(20, 90);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe("vapour pressure", () => {
  it("is zero in perfectly dry air", () => {
    expect(vapourPressure(20, 0)).toBe(0);
  });
  it("increases with temperature at fixed humidity", () => {
    expect(vapourPressure(30, 50)).toBeGreaterThan(vapourPressure(10, 50));
  });
});

describe("wind chill (JAG/TI)", () => {
  it("is colder than the air temperature in wind", () => {
    expect(windChill(0, 30)).toBeLessThan(0);
  });
  it("gets colder as wind increases", () => {
    expect(windChill(-5, 40)).toBeLessThan(windChill(-5, 10));
  });
});

describe("heat index (Rothfusz)", () => {
  it("exceeds air temperature in hot humid air", () => {
    expect(heatIndex(32, 70)).toBeGreaterThan(32);
  });
  it("rises with humidity at fixed temperature", () => {
    expect(heatIndex(32, 80)).toBeGreaterThan(heatIndex(32, 45));
  });
});

describe("apparent temperature branch selection", () => {
  it("uses wind chill when cold and windy", () => {
    expect(apparentTemperature(2, 60, 25).branch).toBe("cold");
  });
  it("uses heat index when hot and humid", () => {
    expect(apparentTemperature(33, 65, 8).branch).toBe("hot");
  });
  it("uses Steadman in the moderate band", () => {
    expect(apparentTemperature(18, 55, 10).branch).toBe("mid");
  });
  it("does not use wind chill in still cold air, where the formula is undefined", () => {
    expect(apparentTemperature(4, 60, 2).branch).toBe("mid");
  });
  it("names the method it used", () => {
    expect(apparentTemperature(33, 65, 8).method).toMatch(/heat index/i);
  });
});

describe("comfort score", () => {
  it("is near perfect at the anchor conditions", () => {
    expect(comfortScore(21, 45, 5).score).toBeGreaterThanOrEqual(99);
  });
  it("stays within 0..100 across the full domain", () => {
    for (let t = -40; t <= 55; t += 5) {
      for (let rh = 0; rh <= 100; rh += 10) {
        const s = comfortScore(t, rh, 50).score;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });
  it("caps each penalty term", () => {
    const c = comfortScore(70, 100, 200);
    expect(c.pT).toBeLessThanOrEqual(50);
    expect(c.pH).toBeLessThanOrEqual(30);
    expect(c.pW).toBeLessThanOrEqual(20);
  });
});

describe("pressure tendency", () => {
  it("returns null when the series is too short", () => {
    expect(pressureTendency([1010, 1011])).toBeNull();
  });
  it("reports a fall as negative", () => {
    expect(pressureTendency([1015, 1014, 1013, 1010])).toBeCloseTo(-5, 5);
  });
});

describe("statistics", () => {
  it("computes the mean", () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
  it("uses the n-1 denominator", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
  it("returns 0 sd for a single sample", () => {
    expect(stdDev([5])).toBe(0);
  });
  it("computes percentile rank", () => {
    expect(percentileOf([1, 2, 3, 4], 2)).toBe(50);
    expect(percentileOf([1, 2, 3, 4], 4)).toBe(100);
  });
});
