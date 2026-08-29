import { useCallback, useEffect, useRef, useState } from "react";
import type { Advisory, DerivedMetrics, Normals, Place, Station } from "../types";
import { ApiError, fetchNormals, fetchStation } from "../lib/openMeteo";
import { buildAdvisories, derive } from "../lib/advisory";
import { buildRequest, fetchBriefing, llmEnabled } from "../lib/llm";

interface State {
  station: Station | null;
  metrics: DerivedMetrics | null;
  advisories: Advisory[];
  normals: Normals | null;
  normalsLoading: boolean;
  briefing: string | null;
  briefingLoading: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY: State = {
  station: null,
  metrics: null,
  advisories: [],
  normals: null,
  normalsLoading: false,
  briefing: null,
  briefingLoading: false,
  loading: false,
  error: null
};

/** Mean of the last 24 hourly temperatures -- comparable to a daily mean. */
function dailyMean(station: Station): number {
  const from = Math.max(0, station.nowIndex - 23);
  const slice = station.hourly.slice(from, station.nowIndex + 1);
  return slice.reduce((a, h) => a + h.temp, 0) / slice.length;
}

export function useStation() {
  const [state, setState] = useState<State>(EMPTY);
  const runId = useRef(0);

  const load = useCallback(async (place: Place) => {
    const id = ++runId.current;
    setState({ ...EMPTY, loading: true });

    let station: Station;
    try {
      station = await fetchStation(place);
    } catch (e) {
      if (id !== runId.current) return;
      const msg =
        e instanceof ApiError
          ? e.message
          : "Something went wrong reading this station.";
      setState({ ...EMPTY, error: msg });
      return;
    }
    if (id !== runId.current) return;

    const metrics = derive(station);
    const advisories = buildAdvisories(station, metrics, null);

    setState({
      ...EMPTY,
      station,
      metrics,
      advisories,
      loading: false,
      normalsLoading: true,
      briefingLoading: llmEnabled()
    });

    // Normals are a 30-year archive request. Load them after first paint so
    // the readout is on screen immediately, then fold them back in.
    let normals: Normals | null = null;
    try {
      normals = await fetchNormals(place, dailyMean(station));
    } catch {
      normals = null;
    }
    if (id !== runId.current) return;

    const withNormals = buildAdvisories(station, metrics, normals);
    setState((s) => ({ ...s, normals, normalsLoading: false, advisories: withNormals }));

    if (!llmEnabled()) return;
    const briefing = await fetchBriefing(buildRequest(station, metrics, withNormals, normals));
    if (id !== runId.current) return;
    setState((s) => ({ ...s, briefing, briefingLoading: false }));
  }, []);

  return { ...state, load };
}

/** Best-effort geolocation, used only when the user asks for it. */
export function useGeolocation() {
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "geolocation" in navigator);
  }, []);

  const locate = useCallback((): Promise<{ lat: number; lon: number } | null> => {
    if (!supported) return Promise.resolve(null);
    setBusy(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBusy(false);
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          setBusy(false);
          resolve(null);
        },
        { timeout: 8000, maximumAge: 300_000 }
      );
    });
  }, [supported]);

  return { locate, busy, supported };
}
