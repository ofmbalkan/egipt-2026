(() => {
  const $ = (id) => document.getElementById(id);
  const state = { plan: null, messages: [], image: null, busy: false };

  const DAY_NAMES = ["nedelja", "ponedeljek", "torek", "sreda", "četrtek", "petek", "sobota"];
  const MONTHS = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];
  const ICONS = { sight: "🏛️", museum: "🏺", food: "🍽️", shopping: "🛍️", activity: "⛵", transport: "🚐", hotel: "🏨", flight: "✈️" };
  const CHIPS = [
    "Rada bi jahala kamelo pri piramidah 🐪",
    "Bazar Khan el-Khalili 🛍️",
    "Vožnja z jadrnico po Nilu ⛵",
    "Kaj videti v Aleksandriji? 🌊",
    "Muzej s Tutankamonom 🏺",
  ];
  const WELCOME =
    "Živjo! Jaz sem Amira 🌸\n\nNapiši mi, kaj bi rada videla ali počela v Egiptu, pa ti to dodam v načrt. " +
    "Lahko mi pošlješ tudi sliko z interneta 📷 ali pa samo govoriš 🎤.\n\nМожно писать и по-русски 🙂";

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  function dayLabel(iso) {
    const d = new Date(iso + "T12:00:00");
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
  }
  function show(id) {
    ["login", "app"].forEach((s) => ($(s).hidden = s !== id));
    $("loading").hidden = true;
  }

  // ---------- auth ----------
  async function boot() {
    try {
      const r = await fetch("/api/login", { cache: "no-store" });
      const { authed } = await r.json();
      if (authed) return startApp();
    } catch {}
    show("login");
    setTimeout(() => $("pw").focus(), 50);
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginErr").hidden = true;
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Trenutek …";
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: $("pw").value }),
      });
      if (r.ok) return startApp();
      $("loginErr").hidden = false;
    } catch {
      $("loginErr").hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Vstopi";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await fetch("/api/login", { method: "DELETE" }).catch(() => {});
    location.reload();
  });

  async function startApp() {
    show("app");
    await loadState();
    renderMessages();
    renderPlan();
  }

  async function loadState() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (r.status === 401) return show("login");
      const data = await r.json();
      state.plan = data.plan;
      state.messages = data.messages || [];
    } catch {}
  }

  // ---------- tabs ----------
  function setView(v) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    $("chatView").hidden = v !== "chat";
    $("composer").hidden = v !== "chat";
    $("planView").hidden = v !== "plan";
    if (v === "plan") {
      $("planDot").hidden = true;
      if (!state.busy) loadState().then(renderPlan); // pick up changes made by family members
    } else {
      scrollChat();
    }
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setView(t.dataset.view)));

  // ---------- chat ----------
  function scrollChat() {
    requestAnimationFrame(() => { $("chatView").scrollTop = $("chatView").scrollHeight; });
  }

  function bubble(m) {
    const el = document.createElement("div");
    el.className = "msg " + (m.role === "assistant" ? "bot" : "me");
    if (m.role === "assistant") el.innerHTML = `<div class="who">Amira</div>`;
    if (m.imageUrl) el.innerHTML += `<img class="sent" src="${m.imageUrl}" alt="">`;
    const txt = document.createElement("div");
    txt.className = "txt";
    txt.textContent = m.text || "";
    el.appendChild(txt);
    if (m.changed && m.changed.length) addSeePlan(el, m.changed);
    return el;
  }

  function addSeePlan(el, changed) {
    const b = document.createElement("button");
    b.className = "btn see-plan";
    b.type = "button";
    b.textContent = "🗓️ Poglej načrt";
    b.onclick = () => { setView("plan"); flashDays(changed); };
    el.appendChild(b);
  }

  function renderMessages() {
    const box = $("messages");
    box.innerHTML = "";
    box.appendChild(bubble({ role: "assistant", text: WELCOME }));
    state.messages.forEach((m) => box.appendChild(bubble(m)));
    $("chips").hidden = state.messages.length > 0;
    $("chips").innerHTML = CHIPS.map((c) => `<button class="chip" type="button">${esc(c)}</button>`).join("");
    $("chips").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => send(b.textContent)));
    scrollChat();
  }

  $("sendForm").addEventListener("submit", (e) => { e.preventDefault(); send(); });
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(); }
  });
  $("input").addEventListener("input", autoGrow);
  function autoGrow() { const t = $("input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }

  async function send(preset) {
    if (state.busy) return;
    stopMic();
    const text = (preset ?? $("input").value).trim();
    const image = state.image;
    if (!text && !image) { $("input").focus(); return; }

    state.busy = true;
    $("sendBtn").disabled = true;
    $("chips").hidden = true;
    $("input").value = "";
    autoGrow();
    clearImage();

    const box = $("messages");
    box.appendChild(bubble({ role: "user", text, imageUrl: image?.url }));
    const bot = bubble({ role: "assistant", text: "" });
    const txt = bot.querySelector(".txt");
    txt.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
    box.appendChild(bot);
    scrollChat();

    let got = "";
    let finished = false;
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, image: image ? { type: image.type, data: image.data } : null }),
      });
      if (r.status === 401) return show("login");
      if (!r.ok || !r.body) throw new Error("bad");

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.t === "text") {
            got += ev.v;
            txt.textContent = got;
            scrollChat();
          } else if (ev.t === "working") {
            const w = document.createElement("div");
            w.className = "working";
            w.textContent = "✍️ Urejam načrt …";
            bot.appendChild(w);
            scrollChat();
          } else if (ev.t === "done") {
            finished = true;
            bot.querySelector(".working")?.remove();
            txt.textContent = ev.text;
            if (ev.plan) {
              state.plan = ev.plan;
              renderPlan();
              addSeePlan(bot, ev.changed);
              $("planDot").hidden = false;
            }
            state.messages.push({ role: "user", text }, { role: "assistant", text: ev.text, changed: ev.changed });
          } else if (ev.t === "error") {
            throw new Error("stream");
          }
        }
      }
      if (!finished) throw new Error("cut");
    } catch {
      bot.querySelector(".working")?.remove();
      txt.textContent = (got ? got + "\n\n" : "") + "Ups, nekaj se je zataknilo 😕 Poskusi še enkrat čez trenutek.";
      if (!got && text) $("input").value = text;
    } finally {
      state.busy = false;
      $("sendBtn").disabled = false;
      scrollChat();
    }
  }

  // ---------- photo ----------
  $("file").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      state.image = await compress(f);
      $("previewImg").src = state.image.url;
      $("preview").hidden = false;
      $("input").placeholder = "Dodaj vprašanje ali kar pošlji ➤";
    } catch {
      alert("Te slike ne morem odpreti. Poskusi z drugo.");
    }
  });
  $("previewX").addEventListener("click", clearImage);
  function clearImage() {
    state.image = null;
    $("preview").hidden = true;
    $("input").placeholder = "Napiši, kaj bi rada videla …";
  }
  function compress(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const src = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1280;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL("image/jpeg", 0.82);
        URL.revokeObjectURL(src);
        resolve({ type: "image/jpeg", data: url.split(",")[1], url });
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(); };
      img.src = src;
    });
  }

  // ---------- voice ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recBtn = null;
  if (SR) {
    $("micSl").hidden = false;
    $("micRu").hidden = false;
    $("micSl").addEventListener("click", () => toggleMic("sl-SI", $("micSl")));
    $("micRu").addEventListener("click", () => toggleMic("ru-RU", $("micRu")));
  }
  function toggleMic(lang, btn) {
    if (rec) { const same = recBtn === btn; stopMic(); if (same) return; }
    rec = new SR();
    recBtn = btn;
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    const before = $("input").value ? $("input").value.trim() + " " : "";
    rec.onresult = (e) => {
      let t = "";
      for (const r of e.results) t += r[0].transcript;
      $("input").value = before + t;
      autoGrow();
    };
    rec.onend = () => stopMic();
    rec.onerror = () => stopMic();
    btn.classList.add("on");
    btn.dataset.label = btn.textContent;
    btn.textContent = lang === "ru-RU" ? "⏹ Стоп" : "⏹ Ustavi";
    try { rec.start(); } catch { stopMic(); }
  }
  function stopMic() {
    if (!rec) return;
    try { rec.onend = null; rec.stop(); } catch {}
    if (recBtn) { recBtn.classList.remove("on"); recBtn.textContent = recBtn.dataset.label; }
    rec = null; recBtn = null;
  }

  // ---------- plan ----------
  function renderPlan() {
    if (!state.plan) return;
    $("plan").innerHTML = state.plan.days.map((d) => `
      <article class="day" id="day-${d.date}">
        <div class="day-head">
          <div class="day-date">${dayLabel(d.date)}</div>
          <h2 class="day-title">${esc(d.title)}</h2>
          ${d.base ? `<span class="base">🏨 ${esc(d.base)}</span>` : ""}
        </div>
        ${d.stops.length ? `<ul class="stops">${d.stops.map(stopHtml).join("")}</ul>`
          : `<div class="empty-day">Ta dan je še prazen.<br><button class="btn ask" type="button" data-date="${d.date}">💬 Vprašaj Amiro, kaj početi</button></div>`}
      </article>`).join("");
    $("plan").querySelectorAll("img.photo[data-wiki]").forEach(loadPhoto);
    $("plan").querySelectorAll(".ask").forEach((b) => b.addEventListener("click", () => {
      setView("chat");
      $("input").value = `Kaj predlagaš za ${dayLabel(b.dataset.date)}?`;
      autoGrow();
      $("input").focus();
    }));
  }

  function stopHtml(s) {
    const maps = s.maps ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.maps)}` : "";
    return `<li class="stop">
      ${s.wiki ? `<img class="photo" data-wiki="${esc(s.wiki)}" alt="${esc(s.title)}" hidden>` : ""}
      <div class="stop-body">
        <div class="time">${esc(s.time)}</div>
        <div class="stop-title"><span class="ico">${ICONS[s.kind] || "📍"}</span>${esc(s.title)}</div>
        ${s.note ? `<div class="note">${esc(s.note)}</div>` : ""}
        ${maps ? `<a class="btn map-btn" href="${maps}" target="_blank" rel="noopener">📍 Zemljevid</a>` : ""}
      </div>
    </li>`;
  }

  function flashDays(dates) {
    (dates || []).forEach((d, i) => {
      const el = $("day-" + d);
      if (!el) return;
      if (i === 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    });
  }

  // Photos from Wikipedia (free, no key). Cached in the browser.
  const photoCache = store.get("photos") || {};
  async function loadPhoto(img) {
    const title = img.dataset.wiki;
    let url = photoCache[title];
    if (url === undefined) {
      url = (await wikiThumb(`titles=${encodeURIComponent(title)}&redirects=1`)) ||
            (await wikiThumb(`generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(title)}`)) || "";
      photoCache[title] = url;
      store.set("photos", photoCache);
    }
    if (url) {
      img.onload = () => (img.hidden = false);
      img.src = url;
    }
  }
  async function wikiThumb(q) {
    try {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=900&${q}`);
      const j = await r.json();
      const pages = Object.values(j.query?.pages || {});
      return pages.find((p) => p.thumbnail)?.thumbnail.source || null;
    } catch { return null; }
  }

  $("resetBtn").addEventListener("click", async () => {
    if (!confirm("Res želiš začeti znova? Izbrisal se bo celoten načrt in pogovor.")) return;
    const r = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
    const data = await r.json();
    state.plan = data.plan;
    state.messages = [];
    renderPlan();
    renderMessages();
  });

  boot();
})();
