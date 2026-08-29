import type { Advisory } from "../types";
import { llmEnabled } from "../lib/llm";

const LABEL: Record<Advisory["severity"], string> = {
  critical: "Critical",
  warning: "Warning",
  notice: "Notice",
  good: "Favourable"
};

interface Props {
  advisories: Advisory[];
  briefing: string | null;
  briefingLoading: boolean;
}

/**
 * Layer 1 output is always shown. The narrative from layer 2 sits above it
 * when configured, clearly marked as generated and clearly secondary -- the
 * findings underneath it are the actual product.
 */
export default function AdvisoryPanel({ advisories, briefing, briefingLoading }: Props) {
  if (!advisories.length) return null;

  return (
    <section className="advisory">
      <div className="sec-head">
        <h2>What this means</h2>
        <p>
          Conclusions drawn from the derived quantities, not from the raw feed. Each one shows the
          computed value it rests on.
        </p>
      </div>

      {llmEnabled() && (briefingLoading || briefing) && (
        <div className="briefing">
          <div className="briefing-tag">Generated summary</div>
          {briefingLoading && !briefing ? (
            <p className="briefing-body dim">Writing…</p>
          ) : (
            <p className="briefing-body">{briefing}</p>
          )}
          <p className="briefing-fine">
            Written by a language model from the computed metrics below. It rewrites the findings —
            it does not produce them, and every number in it was calculated by the app.
          </p>
        </div>
      )}

      <ul className="adv-list">
        {advisories.map((a) => (
          <li key={a.id} className={`adv ${a.severity}`}>
            <div className="adv-tag">{LABEL[a.severity]}</div>
            <div className="adv-body">
              <h3>{a.title}</h3>
              <p>{a.body}</p>
              <div className="adv-basis">{a.basis}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
