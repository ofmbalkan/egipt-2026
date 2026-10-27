import { getStore } from "@netlify/blobs";

export const DATES = ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"];
export const KINDS = ["sight", "museum", "food", "shopping", "activity", "transport", "hotel", "flight"];

export function defaultPlan() {
  return {
    days: [
      {
        date: "2026-11-29",
        title: "Prihod v Egipt",
        base: "Giza",
        stops: [
          {
            time: "19:45",
            title: "Pristanek na letališču Sphinx (SPX)",
            kind: "flight",
            note: "Odhod iz Budimpešte ob 15:20. V Egiptu je ura 1 uro naprej kot doma.",
            wiki: "",
            maps: "Sphinx International Airport",
            fixed: true,
          },
          {
            time: "21:00",
            title: "Prihod v hotel v Gizi",
            kind: "hotel",
            note: "Prijava, večerja in počitek. Do Gize je približno 45 minut vožnje.",
            wiki: "",
            maps: "",
            fixed: true,
          },
        ],
      },
      {
        date: "2026-11-30",
        title: "Piramide in Giza",
        base: "Giza",
        stops: [
          {
            time: "08:00",
            title: "Piramide v Gizi",
            kind: "sight",
            note: "Pridite zgodaj, ko je še hladneje in je manj ljudi.",
            wiki: "Giza pyramid complex",
            maps: "Giza Pyramids",
          },
          {
            time: "10:30",
            title: "Velika sfinga",
            kind: "sight",
            note: "Najlepše fotografije so s ploščadi pred sfingo.",
            wiki: "Great Sphinx of Giza",
            maps: "Great Sphinx of Giza",
          },
        ],
      },
      {
        date: "2026-12-01",
        title: "Selitev v Kairo",
        base: "Kairo",
        stops: [
          {
            time: "11:00",
            title: "Odjava iz hotela v Gizi in vožnja v Kairo",
            kind: "transport",
            note: "Vožnja traja 45–90 minut, odvisno od prometa. Uro odjave preverite v hotelu.",
            wiki: "",
            maps: "",
            fixed: true,
          },
        ],
      },
      {
        date: "2026-12-02",
        title: "Kairo ali izlet v Aleksandrijo",
        base: "Kairo",
        stops: [],
      },
      {
        date: "2026-12-03",
        title: "Zadnji dan in odhod domov",
        base: "Kairo",
        stops: [
          {
            time: "12:00",
            title: "Odjava iz hotela v Kairu",
            kind: "hotel",
            note: "Prtljago lahko pustite v hotelu do odhoda na letališče.",
            wiki: "",
            maps: "",
            fixed: true,
          },
          {
            time: "19:00",
            title: "Vožnja na letališče Sphinx (SPX)",
            kind: "transport",
            note: "Iz centra Kaira traja 1–1,5 ure, v prometni konici lahko več.",
            wiki: "",
            maps: "Sphinx International Airport",
            fixed: true,
          },
          {
            time: "22:20",
            title: "Let Sphinx → Budimpešta",
            kind: "flight",
            note: "Pristanek v Budimpešti ob 01:05 po domačem času.",
            wiki: "",
            maps: "Sphinx International Airport",
            fixed: true,
          },
        ],
      },
    ],
  };
}

function cleanStop(s) {
  const time = /^\d{1,2}:\d{2}$/.test(String(s.time || "").trim()) ? String(s.time).trim().padStart(5, "0") : "";
  return {
    time,
    title: String(s.title || "").slice(0, 120),
    kind: KINDS.includes(s.kind) ? s.kind : "sight",
    note: String(s.note || "").slice(0, 300),
    wiki: String(s.wiki || "").slice(0, 120),
    maps: String(s.maps || "").slice(0, 160),
    ...(s.fixed ? { fixed: true } : {}),
  };
}

// Replaces whole days the AI rewrote. Returns the dates that changed.
export function applyDays(plan, days) {
  const changed = [];
  for (const d of days || []) {
    const target = plan.days.find((x) => x.date === d.date);
    if (!target || !Array.isArray(d.stops)) continue;
    if (d.title) target.title = String(d.title).slice(0, 80);
    if (d.base) target.base = String(d.base).slice(0, 40);
    target.stops = d.stops
      .filter((s) => s && s.title)
      .map(cleanStop)
      .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    changed.push(d.date);
  }
  return changed;
}

export function tripStore() {
  return getStore({ name: "egipt-trip", consistency: "strong" });
}

export async function loadState(store) {
  const state = await store.get("state", { type: "json" });
  if (state && state.plan && Array.isArray(state.messages)) return state;
  return { plan: defaultPlan(), messages: [] };
}
