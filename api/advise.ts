/**
 * Serverless proxy for the optional language layer.
 *
 * Deploy on Vercel (this file works as-is) or adapt for Cloudflare Workers.
 * The API key is read from the environment at request time and never reaches
 * the client bundle -- which is the entire reason this function exists rather
 * than the browser calling the model directly.
 *
 * Set ANTHROPIC_API_KEY in the deployment's environment settings, then point
 * the frontend at this route with VITE_ADVISORY_ENDPOINT=/api/advise.
 */

interface BriefingRequest {
  place: string;
  localTime: string;
  conditions: string;
  metrics: Record<string, string>;
  findings: Array<{ severity: string; title: string; basis: string }>;
}

const SYSTEM = `You write short weather briefings for a meteorological readout app.

You are given quantities that have ALREADY been computed by the application from
station data using published formulas (Magnus-Tetens, Rothfusz, JAG/TI, Steadman),
along with findings produced by a deterministic rules engine.

Rules:
- Never invent, alter or re-derive a number. Use only the values supplied.
- Never contradict a finding. You are rewriting them as prose, not reviewing them.
- Two short paragraphs, at most 90 words total. No headings, no bullet points.
- Lead with whatever most affects what the reader should actually do today.
- Plain language. No filler openers, no "stay safe out there", no emoji.
- If a critical or warning finding is present, it goes in the first sentence.`;

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Not an error condition: the app is designed to run without this layer.
    return json({ error: "Language layer not configured." }, 503);
  }

  let body: BriefingRequest;
  try {
    body = (await request.json()) as BriefingRequest;
  } catch {
    return json({ error: "Malformed request body." }, 400);
  }

  if (!body?.place || !body?.metrics) {
    return json({ error: "Missing place or metrics." }, 400);
  }

  const prompt = [
    `Location: ${body.place}`,
    `Local time: ${body.localTime}`,
    `Reported conditions: ${body.conditions}`,
    "",
    "Computed metrics:",
    ...Object.entries(body.metrics).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "Rules-engine findings:",
    ...(body.findings.length
      ? body.findings.map((f) => `  [${f.severity}] ${f.title} -- ${f.basis}`)
      : ["  none"])
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      return json({ error: `Upstream returned ${res.status}.` }, 502);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const briefing = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();

    if (!briefing) return json({ error: "Empty response." }, 502);
    return json({ briefing }, 200);
  } catch {
    return json({ error: "Could not reach the language model." }, 502);
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
