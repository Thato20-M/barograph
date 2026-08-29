import { useEffect, useState } from "react";
import type { Place } from "./types";
import { searchPlaces } from "./lib/openMeteo";
import { useGeolocation, useStation } from "./hooks/useStation";
import SearchBar from "./components/SearchBar";
import ObservedPanel from "./components/ObservedPanel";
import DerivedRows from "./components/DerivedRows";
import AnomalyPanel from "./components/AnomalyPanel";
import BarographChart from "./components/BarographChart";
import AdvisoryPanel from "./components/AdvisoryPanel";

const DEFAULT_QUERY = "Polokwane";

export default function App() {
  const s = useStation();
  const geo = useGeolocation();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const found = await searchPlaces(DEFAULT_QUERY, 1);
        if (found[0]) await s.load(found[0]);
      } finally {
        setBooting(false);
      }
    })();
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function locate() {
    const pos = await geo.locate();
    if (!pos) return;
    const place: Place = {
      id: -1,
      name: "Current location",
      country: "",
      countryCode: "",
      latitude: pos.lat,
      longitude: pos.lon,
      elevation: 0,
      timezone: "auto"
    };
    await s.load(place);
  }

  const st = s.station;

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <div className="wordmark">Baro<span>graph</span></div>
          <div className="tagline">Derived atmospheric readout</div>
        </div>
      </header>

      <SearchBar onPick={s.load} onLocate={locate} locating={geo.busy} geoSupported={geo.supported} />

      {s.error && (
        <div className="notice">
          {s.error} Try a different spelling, or pick a suggestion from the list.
        </div>
      )}

      {(s.loading || booting) && !st && (
        <div className="booting">
          <span className="spinner dark" aria-hidden="true" />
          <span>Reading station…</span>
        </div>
      )}

      {st && s.metrics && (
        <main>
          <div className="station-head">
            <div className="place">
              {st.place.name}
              {st.place.country && <span className="cc">, {st.place.countryCode}</span>}
            </div>
            <div className="stamp">
              {st.observedAt.slice(11, 16)} local · {st.place.latitude.toFixed(2)}, {st.place.longitude.toFixed(2)}
              {st.place.elevation ? ` · ${Math.round(st.place.elevation)} m` : ""}
            </div>
          </div>

          <ObservedPanel station={st} metrics={s.metrics} />

          <AdvisoryPanel
            advisories={s.advisories}
            briefing={s.briefing}
            briefingLoading={s.briefingLoading}
          />

          <AnomalyPanel normals={s.normals} loading={s.normalsLoading} />

          <DerivedRows station={st} metrics={s.metrics} />

          <BarographChart station={st} tendency={s.metrics.pressureTendency} />
        </main>
      )}

      <footer>
        <span>
          Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>, CC BY 4.0
        </span>
        <span>Magnus-Tetens · Rothfusz · JAG/TI · Steadman</span>
      </footer>
    </div>
  );
}
