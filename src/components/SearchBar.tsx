import { useEffect, useRef, useState } from "react";
import type { Place } from "../types";
import { searchPlaces } from "../lib/openMeteo";

interface Props {
  onPick: (place: Place) => void;
  onLocate: () => void;
  locating: boolean;
  geoSupported: boolean;
}

export default function SearchBar({ onPick, onLocate, locating, geoSupported }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchPlaces(query);
        setResults(found);
        setOpen(found.length > 0);
        setCursor(-1);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function choose(p: Place) {
    setQuery(p.name);
    setOpen(false);
    onPick(p);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[cursor >= 0 ? cursor : 0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const label = (p: Place) => [p.admin1, p.country].filter(Boolean).join(", ");

  return (
    <div className="search" ref={boxRef}>
      <div className="search-row">
        <div className="field">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Search any station"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search for a place"
            aria-expanded={open}
            role="combobox"
            aria-controls="place-list"
          />
          {searching ? <span className="spinner" aria-hidden="true" /> : <span className="kbd">/</span>}
        </div>
        {geoSupported && (
          <button className="icon-btn" onClick={onLocate} disabled={locating} aria-label="Use my location">
            {locating ? (
              <span className="spinner dark" aria-hidden="true" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            )}
          </button>
        )}
      </div>

      {open && (
        <ul className="results" id="place-list" role="listbox">
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === cursor}>
              <button className={i === cursor ? "on" : ""} onClick={() => choose(p)} onMouseEnter={() => setCursor(i)}>
                <span className="r-name">{p.name}</span>
                <span className="r-meta">{label(p)}</span>
                <span className="r-coord">
                  {p.latitude.toFixed(2)}, {p.longitude.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
