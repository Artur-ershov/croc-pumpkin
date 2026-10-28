(() => {
  // ── Content (copy from the brief, unchanged) ────────────────────────────────
  const SCENARIOS = [
    {
      tab: "СПРОСИТЬ", word: "СПРОСИТЬ", mood: "surprise",
      text: "Представь, что тебе нужно уточнить информацию по\u00A0проекту у\u00A0коллеги: ты\u00A0не\u00A0можешь найти нужный файл в\u00A0хранилище. Как\u00A0бы ты\u00A0сформулировал свое письмо в\u00A0почте?",
      hint: null,
    },
    {
      tab: "НАПОМНИТЬ", word: "НАПОМНИТЬ", mood: "nerd",
      text: "До\u00A0сдачи проекта осталось 2\u00A0дня, и\u00A0для\u00A0завершения своей задачи тебе нужна готовая часть от\u00A0коллеги из\u00A0смежной команды, которую он\u00A0обещал скинуть сегодня. Как ты\u00A0напомнишь о\u00A0задаче коллеге?",
      hint: "(при\u00A0вводе ответа можешь указать, где именно ты\u00A0бы написал сообщение: в\u00A0почте, Talks, Telegram или\u00A0др.)",
    },
    {
      tab: "ПОБЛАГОДАРИТЬ", word: "ПОБЛАГОДАРИТЬ", mood: "happy",
      text: "Коллега круто помог тебе в\u00A0выполнении твоей задачи, подхватив ее\u00A0часть. Как\u00A0бы ты\u00A0сформулировал сообщение с\u00A0благодарностью?",
      hint: "(При\u00A0вводе ответа можешь указать, где именно ты\u00A0бы написал сообщение: в\u00A0почте, Talks, Telegram или\u00A0др.; также укажи, если обычно выражаешь благодарность устно)",
    },
    {
      tab: "НЕ СОГЛАСИТЬСЯ", word: "НЕ СОГЛАСИТЬСЯ", mood: "disagree",
      text: "Коллега из\u00A0твоей команды предлагает подход, с\u00A0которым ты\u00A0не\u00A0согласен. Твое виденье тактики, которую команде стоит взять внутри проекта, кардинально отличается. Как\u00A0бы ты\u00A0начал сообщение, в\u00A0котором\u00A0бы описал предложение со\u00A0своим подходом?",
      hint: "(При\u00A0вводе ответа можешь указать, где именно ты\u00A0бы написал сообщение: в\u00A0почте, Talks, Telegram или\u00A0др.)",
    },
  ];

  // ── Pumpkin media. Each mood has pre-rendered frames (transparent WebP, 8 per second, made from that
  //    mood's PNG): idle loops, eat plays once (~2 s), happy-final loops on the final screen. The first and
  //    last frames match the PNG, so loops and hand-offs don't jump.
  //    A mood without frames for an action falls back to its PNG plus the CSS animation.
  const FRAMES = {
    "base-idle": 40, "surprise-idle": 39, "surprise-eat": 15, "nerd-idle": 40, "nerd-eat": 16,
    "happy-idle": 39, "happy-eat": 15, "happy-final": 40, "disagree-idle": 40, "disagree-eat": 15,
  };
  const clip = (name) => ({ dir: `assets/frames/${name}/`, n: FRAMES[name] });
  const EAT_MS = 2100; // a bit longer than the eat clip
  const PUMPKIN = {
    base:     { image: "assets/pumpkin-base.png", idle: clip("base-idle") },
    surprise: { image: "assets/pumpkin-surprise.png", idle: clip("surprise-idle"), eat: clip("surprise-eat") },
    nerd:     { image: "assets/pumpkin-nerd.png", idle: clip("nerd-idle"), eat: clip("nerd-eat") },
    happy:    { image: "assets/pumpkin-happy.png", idle: clip("happy-idle"), eat: clip("happy-eat"), happy: clip("happy-final") },
    disagree: { image: "assets/pumpkin-disagree.png", idle: clip("disagree-idle"), eat: clip("disagree-eat") },
  };
  // Every frame starts downloading on page load: the start screen first, then clip by clip in the order
  // the game shows them. The images stay referenced here, so the browser keeps them.
  const frameCache = new Map();
  function framesOf(c) {
    if (!frameCache.has(c.dir)) {
      frameCache.set(c.dir, Array.from({ length: c.n }, (_, i) => {
        const im = new Image();
        im.src = c.dir + String(i).padStart(2, "0") + ".webp";
        return im;
      }));
    }
    return frameCache.get(c.dir);
  }
  const arrived = (im) => im.complete ? Promise.resolve() : new Promise((done) => {
    im.addEventListener("load", done, { once: true }); im.addEventListener("error", done, { once: true });
  });
  (async () => {
    const order = [PUMPKIN.base.idle, ...SCENARIOS.flatMap((s) => [PUMPKIN[s.mood].idle, PUMPKIN[s.mood].eat]), PUMPKIN.happy.happy];
    for (const c of order) if (c) await Promise.all(framesOf(c).map(arrived));
  })();

  // Same rule as «Растопи лёд»: any domain, one "@", non-empty parts, login not all digits.
  function isValidEmail(value) {
    const parts = value.toLowerCase().split("@");
    return parts.length === 2 && parts[0] !== "" && parts[1] !== "" && !/^\d+$/.test(parts[0]);
  }
  const STORE_KEY = "croc-pumpkin-v1";
  const QUEUE_KEY = "croc-pumpkin-outbox";
  // Apps Script web app URL (see backend/Code.gs). Empty = answers stay in the browser only.
  const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxzIIGbCbaGACQXJI12tUEkL2mwcIROfMdq7Hq52IVVdMJoihKg1VRnHZuHgndSX_E7Mg/exec";

  // ── State ───────────────────────────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  if (params.has("reset")) localStorage.removeItem(STORE_KEY);
  let store = {};
  try { store = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { store = {}; }
  let email = "";
  let current = 0;
  let answers = {};
  let remoteDone = new Set();

  const $ = (s) => document.querySelector(s);
  const stage = $("#stage");
  const viewport = $(".viewport");

  // ── Layout: scale the 1920×1080 stage, or reflow on phones ──────────────────
  function layout() {
    // Portrait screens and short landscape phones get the stacked layout;
    // the 1920×1080 stage there would scale text down to ~10px.
    const mobile = innerWidth < 760 || innerWidth < innerHeight || innerHeight < 500;
    document.documentElement.classList.toggle("mobile", mobile);
    document.body.classList.toggle("mobile", mobile);
    if (mobile) {
      stage.style.transform = "";
      // Tablets: enlarge the phone layout instead of leaving it tiny on a wide screen.
      const z = innerHeight >= 600 ? Math.min(Math.max(innerWidth / 540, 1), 1.6) : 1;
      stage.style.zoom = z === 1 ? "" : String(z);
      fitAll();
      return;
    }
    stage.style.zoom = "";
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    const tx = (innerWidth - 1920 * s) / 2, ty = (innerHeight - 1080 * s) / 2;
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    // Letterbox margins continue the stage texture at the same scale, so the stars inside the stage stay put.
    viewport.style.backgroundSize = `${1920 * s}px ${1080 * s}px`;
    viewport.style.backgroundPosition = `${tx}px ${ty}px`;
    fitAll();
  }
  function fit(el) {
    const mobile = document.body.classList.contains("mobile");
    const target = mobile ? el.parentElement.clientWidth - 40 : Number(el.dataset.fit);
    if (!target || target < 0) { el.style.fontSize = ""; return; }
    el.style.fontSize = "300px";
    el.style.fontSize = (300 * target / el.scrollWidth) + "px";
  }
  function fitAll() { document.querySelectorAll("[data-fit]").forEach(fit); placeColumns(); }
  // Side columns of the game screen sit just below the outline word.
  function placeColumns() {
    if (document.body.classList.contains("mobile")) return;
    const word = $("#scenario-word");
    const top = Math.max(word.offsetTop + word.offsetHeight + 36, 400);
    $(".col-question").style.top = top + "px";
    $(".col-progress").style.top = top + "px";
  }
  addEventListener("resize", layout);

  // ── Film look ───────────────────────────────────────────────────────────────
  // The visible pumpkin is a canvas redrawn FILM.fps times a second from the frames (or the PNG), so motion
  // steps like an old cartoon. Boil (edges wobble), shake and flicker change only on those steps.
  // Strengths are 0..1. The live tuner panel used to pick these values is kept in dev/film-tuner.md.
  const FILM_DEFAULTS = { fps: 8, boil: 0.2, shake: 0.5, flicker: 0.5 };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) Object.assign(FILM_DEFAULTS, { boil: 0, shake: 0, flicker: 0 });
  const FILM = { ...FILM_DEFAULTS };
  const BOIL_PX = 14;      // displacement at full boil
  const SHAKE_SHIFT = 0.009; // share of the frame width at full shake
  const SHAKE_TILT = 1.2;  // degrees at full shake
  const FLICKER = 0.2;     // brightness swing at full flicker
  const PAD = 0.03;        // the canvas is 6% bigger than the slot (styles.css), so the shake never crops
  // Three noise fields cycled frame to frame, like hand-drawn lines redrawn for every frame.
  const boilSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  boilSvg.setAttribute("width", "0"); boilSvg.setAttribute("height", "0"); boilSvg.setAttribute("aria-hidden", "true");
  boilSvg.style.position = "absolute";
  boilSvg.innerHTML = [3, 11, 29].map((seed, i) => `<filter id="film-boil${i}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="0"/></filter>`).join("");
  document.body.appendChild(boilSvg);
  function applyBoil() { boilSvg.querySelectorAll("feDisplacementMap").forEach((m) => m.setAttribute("scale", String(FILM.boil * BOIL_PX))); }
  applyBoil();

  function filmOf(el) {
    if (!el._film) {
      const cv = document.createElement("canvas"), snap = document.createElement("canvas");
      el.appendChild(cv); el.classList.add("film");
      el._film = { cv, ctx: cv.getContext("2d"), snap, sctx: snap.getContext("2d"), n: 0, tick: 0, ready: false, mood: "" };
    }
    return el._film;
  }
  // One frame: take a clean copy of the source (the clip's current frame, else the PNG), then draw it shaken.
  // A frame that hasn't arrived yet keeps the previous one on screen; a new mood shows its PNG meanwhile.
  function filmFrame(el) {
    const f = filmOf(el), img = el.querySelector("img"), play = el._play;
    const png = img.complete && img.naturalWidth ? img : null;
    let src = null;
    if (play) {
      const n = play.frames.length;
      let i = f.tick - play.start;
      if (i >= n) {
        if (play.loop) i %= n;
        else { i = n - 1; if (!play.done) { play.done = true; if (play.onEnd) setTimeout(play.onEnd); } }
      }
      const frame = play.frames[i];
      if (frame.complete && frame.naturalWidth) src = frame;
      else if (f.mood !== el.dataset.mood) src = png;
    } else src = png;
    f.tick++;
    if (src) {
      const w = src.naturalWidth, h = src.naturalHeight;
      const sw = Math.min(w, 720), sh = Math.round(sw * h / w);
      if (f.snap.width !== sw || f.snap.height !== sh) { f.snap.width = sw; f.snap.height = sh; }
      const cw = Math.round(sw * (1 + 2 * PAD)), ch = Math.round(sh * (1 + 2 * PAD));
      if (f.cv.width !== cw || f.cv.height !== ch) { f.cv.width = cw; f.cv.height = ch; }
      f.sctx.clearRect(0, 0, sw, sh); f.sctx.drawImage(src, 0, 0, sw, sh);
      f.ready = true; f.mood = el.dataset.mood;
    }
    if (!f.ready) return;
    const { cv, ctx, snap } = f, rnd = (a) => (Math.random() * 2 - 1) * a;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.translate(cv.width / 2 + rnd(FILM.shake * SHAKE_SHIFT * cv.width), cv.height / 2 + rnd(FILM.shake * SHAKE_SHIFT * cv.width));
    ctx.rotate(rnd(FILM.shake * SHAKE_TILT) * Math.PI / 180);
    ctx.drawImage(snap, -snap.width / 2, -snap.height / 2);
    const filters = [];
    if (FILM.boil > 0) filters.push(`url(#film-boil${f.n++ % 3})`);
    if (FILM.flicker > 0) filters.push(`brightness(${(1 + rnd(FILM.flicker * FLICKER)).toFixed(3)})`);
    cv.style.filter = filters.join(" ") || "none";
  }
  let filmNext = 0;
  (function filmLoop(t) {
    if (t >= filmNext) {
      const step = 1000 / FILM.fps;
      filmNext = t - filmNext > step ? t + step : filmNext + step; // keep the rate exact, resync after a stall
      document.querySelectorAll(".screen.is-active [data-pumpkin]").forEach(filmFrame);
    }
    requestAnimationFrame(filmLoop);
  })(0);

  // ── Pumpkin slot ────────────────────────────────────────────────────────────
  function setPumpkin(el, mood, action = "idle") {
    const media = PUMPKIN[mood] || PUMPKIN.base;
    const img = el.querySelector("img");
    if (!img.src.endsWith(media.image)) img.src = media.image;
    el.dataset.mood = mood;
    const c = media[action], f = filmOf(el);
    el.classList.remove("idle", "eat", "happy");
    if (c) {
      el._play = { frames: framesOf(c), start: f.tick, loop: action !== "eat", onEnd: action === "eat" ? () => setPumpkin(el, mood) : null };
    } else {
      el._play = null;
      void el.offsetWidth; // restart CSS animation
      el.classList.add(action);
      if (action !== "idle") el.addEventListener("animationend", () => { el.classList.remove(action); el.classList.add("idle"); }, { once: true });
    }
  }

  // Only the visible screen's pumpkin starts a clip; the others get theirs when their screen opens (renderGame, finish).
  document.querySelectorAll("[data-pumpkin]").forEach((el) => {
    if (el.closest(".screen.is-active")) setPumpkin(el, el.dataset.mood);
    else el.querySelector("img").src = (PUMPKIN[el.dataset.mood] || PUMPKIN.base).image;
  });

  // ── Screens ─────────────────────────────────────────────────────────────────
  // Children of each screen get a stagger index for the entrance animation.
  document.querySelectorAll(".screen").forEach((s) => [...s.children].forEach((el, i) => el.style.setProperty("--i", i)));
  // Restart a one-off animation class and drop it afterwards, so it doesn't mask the element's own animations (idle, shake).
  function replay(el, cls, ms) {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el["t_" + cls]);
    el["t_" + cls] = setTimeout(() => el.classList.remove(cls), ms);
  }

  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
    replay(document.getElementById(id), "entering", 1500);
    viewport.scrollTop = 0;
    requestAnimationFrame(fitAll);
    if (document.body.classList.contains("mobile")) scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── 01 → 02: email modal ────────────────────────────────────────────────────
  const modal = $("#modal");
  const emailInput = $("#email");
  const emailField = $("#email-field");
  const emailBtn = $("#btn-email");
  let emailTimer = null;
  let checkingEmail = false;

  function validateEmail(showError) {
    const v = emailInput.value.trim();
    const ok = isValidEmail(v);
    emailBtn.disabled = !ok;
    const err = showError && v !== "" && !ok;
    emailField.classList.toggle("invalid", err);
    return ok;
  }
  $("#btn-start").addEventListener("click", () => {
    modal.hidden = false;
    setTimeout(() => emailInput.focus(), 50);
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) modal.hidden = true; });
  emailInput.addEventListener("input", () => {
    validateEmail(false);
    clearTimeout(emailTimer);
    emailTimer = setTimeout(() => validateEmail(true), 1000);
  });
  // Enter must validate even while the arrow button is disabled (implicit submit is blocked then).
  emailInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (validateEmail(true)) $("#email-form").requestSubmit();
  });
  $("#email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateEmail(true)) { emailInput.focus(); return; }
    if (checkingEmail) return;
    email = emailInput.value.trim().toLowerCase();
    answers = (store[email] && store[email].answers) || {};
    checkingEmail = true; emailBtn.disabled = true;
    emailField.classList.add("is-loading"); emailInput.readOnly = true;
    remoteDone = await fetchRemoteDone(email);
    emailField.classList.remove("is-loading"); emailInput.readOnly = false;
    checkingEmail = false; emailBtn.disabled = false;
    modal.hidden = true;
    current = firstUndone();
    if (current === -1) { finish(); return; }
    renderGame();
    show("screen-game");
  });
  // Scenarios this email already answered (possibly in another browser). Only indices come back, never texts.
  async function fetchRemoteDone(mail) {
    if (!BACKEND_URL) return new Set();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${BACKEND_URL}?email=${encodeURIComponent(mail)}`, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      return new Set(data.ok && Array.isArray(data.done) ? data.done : []);
    } catch {
      return new Set(); // offline or old script version: fall back to this browser's progress
    }
  }

  // ── 03: scenarios ───────────────────────────────────────────────────────────
  const tabs = $("#tabs");
  const answer = $("#answer");
  const pumpkinGame = document.querySelector(".pumpkin-game");

  SCENARIOS.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = s.tab;
    b.addEventListener("click", () => { current = i; renderGame(); });
    tabs.appendChild(b);
  });

  function firstUndone() {
    for (let i = 0; i < SCENARIOS.length; i++) if (!isDone(i)) return i;
    return -1;
  }
  // Done here or, per the sheet, in another browser.
  function isDone(i) { return !!answers[i] || remoteDone.has(i); }
  function doneCount() { return SCENARIOS.filter((_, i) => isDone(i)).length; }

  let shownScenario = -1;
  function renderGame(popIndex = -1) {
    const s = SCENARIOS[current];
    [...tabs.children].forEach((b, i) => {
      b.classList.toggle("is-active", i === current);
      b.classList.toggle("is-done", isDone(i));
    });
    // phones: the tab strip scrolls sideways, keep the active tab in view
    const activeTab = tabs.children[current];
    if (tabs.scrollWidth > tabs.clientWidth) tabs.scrollTo({ left: activeTab.offsetLeft - 20, behavior: "smooth" });
    const word = $("#scenario-word");
    word.textContent = s.word;
    $("#scenario-text").textContent = s.text;
    $("#hint").hidden = !s.hint;
    $("#hint-text").textContent = s.hint || "";
    answer.value = answers[current] || "";
    const stars = $("#stars");
    const n = doneCount();
    stars.innerHTML = SCENARIOS.map((_, i) => `<i class="${i < n ? "on" : i === n ? "next" : ""}${i === popIndex ? " pop" : ""}"></i>`).join("")
      + `<span>${n}/${SCENARIOS.length}</span>`;
    setPumpkin(pumpkinGame, s.mood);
    fit(word); placeColumns();
    // Scenario changed while the game is on screen: replay the word / question / hint / pumpkin entrance.
    if (shownScenario !== -1 && shownScenario !== current) replay($("#screen-game"), "swap", 900);
    shownScenario = current;
  }

  // Text "flies" into the pumpkin, the pumpkin chews, progress updates.
  function feedAnimation(text) {
    return new Promise((resolve) => {
      const hasClip = !!(PUMPKIN[SCENARIOS[current].mood] || PUMPKIN.base).eat;
      if (document.body.classList.contains("mobile")) { setPumpkin(pumpkinGame, SCENARIOS[current].mood, "eat"); setTimeout(resolve, hasClip ? EAT_MS : 900); return; }
      const bite = document.createElement("div");
      bite.className = "bite";
      bite.textContent = text.length > 140 ? text.slice(0, 140) + "…" : text;
      stage.appendChild(bite);
      bite.style.left = "120px"; bite.style.top = "880px";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bite.style.transform = "translate(720px, -400px) scale(.08) rotate(25deg)";
        bite.style.opacity = "0";
      }));
      setTimeout(() => { bite.remove(); setPumpkin(pumpkinGame, SCENARIOS[current].mood, "eat"); }, 650);
      setTimeout(resolve, hasClip ? 650 + EAT_MS : 1500);
    });
  }

  $("#answer-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = answer.value.trim();
    if (text.length < 3) {
      answer.classList.remove("shake"); void answer.offsetWidth; answer.classList.add("shake");
      answer.focus();
      return;
    }
    const btn = $("#btn-feed");
    btn.disabled = true;
    const wasDone = isDone(current);
    // Save and send before the animation, so closing the tab mid-bite loses nothing.
    answers[current] = text;
    save();
    sendToBackend({ email, scenario: SCENARIOS[current].word, answer: text });
    await feedAnimation(text);
    btn.disabled = false;
    const next = firstUndone();
    if (next === -1) { setTimeout(finish, 300); return; }
    if (!wasDone) current = next;
    renderGame(wasDone ? -1 : doneCount() - 1);
    // on phones the new scenario word is above the fold after typing
    if (!wasDone && document.body.classList.contains("mobile")) scrollTo({ top: 0, behavior: "smooth" });
  });
  answer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#answer-form").requestSubmit();
  });

  function save() {
    store[email] = { answers, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  // Answers go to a Google Sheet via Apps Script (backend/Code.gs).
  // Unsent ones wait in localStorage and are retried with backoff while the page is open, and on the next load.
  function sendToBackend(payload) {
    const queue = loadQueue();
    queue.push({ ...payload, ts: new Date().toISOString() });
    saveQueue(queue);
    flushQueue();
  }
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
  }
  let flushing = false;
  let retryTimer = null;
  let retryCount = 0;
  async function flushQueue() {
    if (!BACKEND_URL || flushing) return;
    flushing = true;
    clearTimeout(retryTimer);
    let failed = false;
    try {
      let queue = loadQueue();
      while (queue.length) {
        // text/plain keeps it a simple request, so there is no CORS preflight
        const res = await fetch(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(queue[0]) });
        const data = await res.json().catch(() => null);
        // "bad request" will never succeed, drop it; anything else ("busy", quota page, network) is retried
        if (!data || (!data.ok && data.error !== "bad request")) { failed = true; break; }
        queue = loadQueue().slice(1);
        saveQueue(queue);
      }
    } catch (err) {
      failed = true;
      console.warn("[pumpkin] send failed, will retry", err);
    } finally {
      flushing = false;
    }
    if (failed) {
      // 5s, 15s, 45s… up to 2 min, with jitter so a crowd doesn't retry in lockstep
      const delay = Math.min(5000 * 3 ** retryCount++, 120000) * (0.5 + Math.random());
      retryTimer = setTimeout(flushQueue, delay);
    } else {
      retryCount = 0;
    }
  }
  addEventListener("online", flushQueue);

  // ── 04: final ───────────────────────────────────────────────────────────────
  function finish() {
    show("screen-final");
    setPumpkin(document.querySelector(".pumpkin-final"), "happy", "happy");
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  document.fonts.ready.then(layout);
  layout();
  replay($("#screen-start"), "entering", 1500);
  flushQueue();
})();
