import { isAuthed, json } from "../../lib/auth.mjs";
import { defaultPlan, loadState, tripStore } from "../../lib/plan.mjs";

export default async (req) => {
  if (!isAuthed(req)) return json({ error: "auth" }, 401);
  const store = tripStore();

  if (req.method === "GET") {
    const state = await loadState(store);
    return json({ plan: state.plan, messages: state.messages.slice(-40) });
  }

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {}
    if (body.action === "reset") {
      const state = { plan: defaultPlan(), messages: [] };
      await store.setJSON("state", state);
      return json({ plan: state.plan, messages: [] });
    }
  }

  return json({ error: "method" }, 405);
};

export const config = { path: "/api/state" };
