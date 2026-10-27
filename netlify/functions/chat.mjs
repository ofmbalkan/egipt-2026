import { isAuthed, json } from "../../lib/auth.mjs";
import { applyDays, loadState, tripStore } from "../../lib/plan.mjs";
import { SYSTEM, TOOL } from "../../lib/prompt.mjs";

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const API = () => (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function historyFor(messages) {
  // Last turns as plain text; must start with a user turn and alternate.
  const out = [];
  for (const m of messages.slice(-16)) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const text = String(m.text || "").trim() || (role === "user" ? "(slika)" : "V redu.");
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + text;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!isAuthed(req)) return json({ error: "auth" }, 401);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "nokey" }, 500);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad" }, 400);
  }
  const text = String(body.text || "").slice(0, 2000).trim();
  const image =
    body.image && IMAGE_TYPES.includes(body.image.type) && typeof body.image.data === "string"
      ? body.image
      : null;
  if (!text && !image) return json({ error: "empty" }, 400);

  const store = tripStore();
  const state = await loadState(store);

  const content = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.type, data: image.data } });
  content.push({ type: "text", text: text || "Poslala sem to sliko. Kaj je to? Ali lahko to obiščemo?" });

  const messages = historyFor(state.messages);
  if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
  messages.push({ role: "user", content });

  const upstream = await fetch(API(), {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 4000,
      system: `${SYSTEM}\n\nCURRENT PLAN:\n${JSON.stringify(state.plan)}`,
      messages,
      tools: [TOOL],
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    console.error("anthropic error", upstream.status, await upstream.text().catch(() => ""));
    return json({ error: "ai" }, 502);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let reply = "";
      let toolJson = "";
      try {
        const reader = upstream.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            let ev;
            try {
              ev = JSON.parse(line.slice(5));
            } catch {
              continue;
            }
            if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
              send({ t: "working" });
            } else if (ev.type === "content_block_delta") {
              if (ev.delta?.type === "text_delta") {
                reply += ev.delta.text;
                send({ t: "text", v: ev.delta.text });
              } else if (ev.delta?.type === "input_json_delta") {
                toolJson += ev.delta.partial_json;
              }
            } else if (ev.type === "error") {
              throw new Error(JSON.stringify(ev.error));
            }
          }
        }

        let changed = [];
        if (toolJson) {
          try {
            changed = applyDays(state.plan, JSON.parse(toolJson).days);
          } catch (e) {
            console.error("bad tool json", e);
          }
        }

        reply = reply.trim() || (changed.length ? "Načrt sem posodobila. 🙂" : "V redu.");
        const now = Date.now();
        state.messages.push(
          { role: "user", text: (image ? "📷 " : "") + text, image: !!image, ts: now },
          { role: "assistant", text: reply, changed, ts: now }
        );
        state.messages = state.messages.slice(-80);
        await store.setJSON("state", state);

        send({ t: "done", text: reply, changed, plan: changed.length ? state.plan : undefined });
      } catch (e) {
        console.error("stream failed", e);
        send({ t: "error" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/chat" };
