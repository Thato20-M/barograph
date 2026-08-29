# Barograph

[![CI](https://github.com/Thato20-M/barograph/actions/workflows/ci.yml/badge.svg)](https://github.com/Thato20-M/barograph/actions/workflows/ci.yml)
[![Deploy](https://github.com/Thato20-M/barograph/actions/workflows/deploy.yml/badge.svg)](https://github.com/Thato20-M/barograph/actions/workflows/deploy.yml)

A weather app that computes rather than reports.

A station gives you three numbers: temperature, relative humidity, wind speed. Most weather apps
display them. This one treats them as inputs — it derives dew point, apparent temperature and a
comfort composite from published meteorological formulas, compares the day against thirty years of
reanalysis, and turns the result into advice. Every derived figure can be expanded to show the
equation with the values substituted in.

**Live demo:** _add your GitHub Pages URL here_

---

## Why this exists

The tutorial weather app fetches a JSON blob and prints it. That demonstrates `fetch`. It doesn't
demonstrate anything else.

The interesting problem is the gap between a reading and a conclusion. "It is 34 °C" is a reading.
"The dew point is 23 °C and the wind is under 8 km/h, so sweat will not evaporate and heat will
accumulate faster than you can shed it" is a conclusion, and only the second one changes what
somebody does. Getting from the first to the second is arithmetic with validity bands, and that is
what this project is about.

---

## What it does

**Derived quantities, with the working shown**

| Quantity | Method | Validity |
|---|---|---|
| Dew point | Magnus-Tetens, Alduchov & Eskridge (1996) coefficients | −45 to 60 °C |
| Apparent temperature | JAG/TI wind chill | T ≤ 10 °C, v > 4.8 km/h |
| | Rothfusz heat index | T ≥ 27 °C, RH ≥ 40% |
| | Steadman apparent temperature | the moderate band between them |
| Comfort index | composite defined in this project | 0–100, not a published standard |
| Pressure tendency | 3-hour change in surface pressure | classic barometric signal |

Three different models are in play across the temperature range, so the app names which branch it
used rather than presenting an unqualified "feels like" figure. Expanding a row shows the equation
with your station's numbers in it.

**Climate anomaly**

Today against the WMO standard climate normal (1991–2020) for this calendar date, drawn from ERA5
reanalysis. The app samples a five-day calendar window across thirty years, giving roughly 150
observations rather than 30 — the difference between a standard deviation worth quoting and one that
is not. Output is a z-score, a percentile rank, and a histogram of the reference distribution with
today marked on it.

**Advisory engine**

Rules over the derived quantities, producing conclusions that each cite the computed value they rest
on. Covers heat strain, evaporative failure, dehydration in dry heat, wind chill exposure, fog risk
from a narrow dew-point spread, deteriorating pressure, UV, thunderstorms, and statistical anomaly.
It also scans the next 24 hours and flags a better window if one exists.

**Barograph**

Temperature, dew point and surface pressure on a shared time axis over 36 hours, drawn on a printed
graticule. Pressure is the one variable that says where the weather is going rather than where it
is.

---

## The advisory is built in two layers

This is the design decision I would most want to talk about.

**Layer 1 — deterministic rules engine.** `src/lib/advisory.ts`. Pure functions over the derived
metrics. Runs offline, costs nothing, produces identical output for identical input, and cannot
hallucinate. This layer is always on.

**Layer 2 — language model narrative.** `src/lib/llm.ts` plus `api/advise.ts`. Optional. The model
receives *computed metrics and finished findings*, never raw API JSON, and is instructed to rewrite
them as prose without inventing or altering a number. It is never load-bearing: if the endpoint is
absent, unconfigured, slow or failing, layer 1 stands alone and the user loses a paragraph, nothing
more.

The reason for the split is that advice with a safety component should not depend on a
non-deterministic system. A heat warning has to fire the same way every time. Using a language model
for language, and arithmetic for arithmetic, keeps each part doing what it is actually reliable at.

The API key lives in the serverless function, read from the environment at request time. It never
enters the client bundle, because anything shipped to a browser is public.

---

## Stack

- **React 18 + TypeScript 5** — strict mode, `noUnusedLocals`, `noUnusedParameters`
- **Vite 8** — build and dev server
- **vite-plugin-pwa 1.x** — installable, offline-capable, with a cache strategy per data type
- **Capacitor 8** — wraps the same build as a native Android package
- **Vitest 4** — 24 unit tests over the physics module
- **Open-Meteo** — forecast, geocoding and ERA5 archive. No API key required.

`npm audit` reports three moderate advisories, all reaching a transitive `uuid` through `xcode`
inside the Capacitor CLI. That is iOS project tooling, it is a devDependency, and nothing from it
enters `dist/` — the production tree is React and its dependencies, six packages in total. Fixing it
means waiting for Capacitor to update its own dependency rather than forcing a downgrade here.

### Why Open-Meteo

No key, no signup, CORS enabled, and free for non-commercial use up to 10,000 calls a day. That
matters beyond convenience: the deployed demo works for anybody who opens it, there is no secret to
leak, and no scraper can lift a key out of the bundle. It also exposes hourly surface pressure and
ERA5 reanalysis back to 1940, which is what makes the barograph and the anomaly comparison possible
at all.

Data licensed CC BY 4.0, attributed in the app footer.

### Caching strategy

The service worker treats the two data sources differently, because they have different lifetimes:

- Live readings — `NetworkFirst` with a 6-second timeout, falling back to the last good response, so
  the app still shows something meaningful offline.
- Climate normals — `CacheFirst` for 90 days. The 1991–2020 record does not change.

---

## Project layout

```
src/
├── lib/
│   ├── physics.ts        pure formulas + statistics — fully unit-tested
│   ├── advisory.ts       layer 1: deterministic rules engine
│   ├── llm.ts            layer 2: optional narrative adapter
│   ├── openMeteo.ts      typed API client, forecast + geocoding + archive
│   └── wmo.ts            WMO 4677 weather code table
├── components/           presentational, one concern each
├── hooks/useStation.ts   orchestration and load sequencing
└── types.ts              shared interfaces
api/advise.ts             serverless proxy — holds the key server-side
```

`physics.ts` has no imports and no side effects, which is why it is the only file with tests: it is
where the actual claims live, and everything else is presentation.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 24 tests
npm run build      # type check, then production build to dist/
```

`package-lock.json` is committed, so CI installs with `npm ci` and builds against exactly the tree
that was tested locally.

### Android build

```bash
npm run build
npx cap add android
npm run android:sync
npm run android:open     # opens Android Studio
```

`capacitor.config.ts` points at `dist/`. The Vite base defaults to relative, which is what Capacitor
needs — it loads from the filesystem, where an absolute path resolves to nothing.

### Deploying

Two workflows in `.github/workflows/`:

- **`ci.yml`** — runs on every push and pull request against `main`. Type check, tests and build,
  across Node 22 and 24, so a runtime upgrade cannot break things quietly. This is the workflow the
  badge tracks.
- **`deploy.yml`** — builds and publishes to GitHub Pages on pushes to `main`, and can be triggered
  manually from the Actions tab.

To enable Pages: **Settings → Pages → Source → GitHub Actions**. No branch to pick and no `gh-pages`
branch to maintain; the workflow uploads the artifact directly.

The deploy job sets `VITE_BASE` from `actions/configure-pages`, which resolves to `/<repo-name>/`.
This matters more than it looks: a project site is served from a subpath, and the service worker
takes its scope from the base. Left relative, the worker registers at the wrong scope and the PWA
silently fails to install. The same repo therefore produces two different builds — subpath for Pages,
relative for Capacitor — from one config.

`dependabot.yml` opens grouped dependency PRs monthly rather than one per package.

### Enabling the optional narrative layer

Deploy `api/advise.ts` (works as-is on Vercel), set `ANTHROPIC_API_KEY` in the deployment
environment, then point the frontend at it:

```bash
VITE_ADVISORY_ENDPOINT=/api/advise
```

Without this, everything else works exactly as before.

---

## Known limits

- The comfort index is my own construction. The anchors (21 °C, 45% RH) and the 1.35 exponent are a
  judgement call chosen to match how discomfort scales in practice, not a published result. I would
  want to calibrate the weights against survey data before claiming more.
- ERA5 is optimised for long-term consistency rather than day-to-day accuracy, which is correct for
  a climate normal but means the archive is not a substitute for observations.
- The daily mean used in the anomaly comparison is the mean of the last 24 hourly values, which
  approximates but does not exactly reproduce the archive's own daily aggregation.
- The Rothfusz regression drifts outside its validity band; the branch selector keeps it inside, but
  the boundary is a step rather than a smooth blend.

---

## Attribution

Weather data by [Open-Meteo](https://open-meteo.com/), CC BY 4.0.

Formulas: Alduchov & Eskridge (1996); Rothfusz (1990); Osczevski & Bluestein, JAG/TI (2005);
Steadman (1984).
