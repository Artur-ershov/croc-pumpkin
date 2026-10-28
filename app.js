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

  // ── Pumpkin media. Videos are black-background clips made from each mood's PNG (first and last
  //    frame = the PNG, so they loop and hand back to the image without a jump); CSS blends the
  //    black away (mix-blend-mode: lighten). idle and happy loop, eat plays once (~2 s).
  //    A mood without a video for an action falls back to its PNG plus the CSS animation.
  const clip = (mood, action) => `assets/video/${mood}-${action}.mp4`;
  const EAT_MS = 2100; // a bit longer than the eat clip
  const PUMPKIN = {
    base:     { image: "assets/pumpkin-base.png", idle: clip("base", "idle"), eat: clip("base", "eat") },
    surprise: { image: "assets/pumpkin-surprise.png", idle: clip("surprise", "idle"), eat: clip("surprise", "eat") },
    nerd:     { image: "assets/pumpkin-nerd.png", idle: clip("nerd", "idle"), eat: clip("nerd", "eat") },
    happy:    { image: "assets/pumpkin-happy.png", idle: clip("happy", "idle"), eat: clip("happy", "eat"), happy: clip("happy", "final") },
    disagree: { image: "assets/pumpkin-disagree.png", idle: clip("disagree", "idle"), eat: clip("disagree", "eat") },
  };
  // Load a clip ahead of time (e.g. the eat clip while the idle one plays), so the bite doesn't wait for the network.
  const warmed = new Map();
  function warm(src) {
    if (!src || warmed.has(src)) return;
    const v = document.createElement("video");
    v.preload = "auto"; v.muted = true; v.src = src;
    warmed.set(src, v);
  }

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

  // ── Pumpkin slot ────────────────────────────────────────────────────────────
  function setPumpkin(el, mood, action = "idle") {
    const media = PUMPKIN[mood] || PUMPKIN.base;
    const img = el.querySelector("img");
    const video = el.querySelector("video");
    if (!img.src.endsWith(media.image)) img.src = media.image;
    el.dataset.mood = mood;
    const src = media[action];
    video.onended = video.onerror = video.onplaying = null;
    if (src) {
      const toImage = () => { el.classList.remove("has-video"); el.classList.add("idle"); };
      // The PNG (with its CSS idle) stays up until the clip really plays, so a slow network never leaves the slot empty.
      el.classList.remove("has-video", "eat", "happy");
      el.classList.add("idle");
      video.onplaying = () => { el.classList.add("has-video"); el.classList.remove("idle"); };
      video.onerror = toImage;
      if (action === "eat") video.onended = () => setPumpkin(el, mood);
      video.loop = action !== "eat";
      if (!video.src.endsWith(src)) video.src = src;
      else try { video.currentTime = 0; } catch {}
      video.play().catch(toImage);
      warm(media.eat);
    } else {
      video.pause();
      el.classList.remove("has-video");
      el.classList.remove("idle", "eat", "happy");
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
    // hidden screens keep no clip running
    document.querySelectorAll(".screen:not(.is-active) .pumpkin video").forEach((v) => v.pause());
    if (id === "screen-game") warm(PUMPKIN.happy.happy);
    replay(document.getElementById(id), "entering", 1500);
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
  $("#memo-link").addEventListener("click", (e) => {
    e.preventDefault();
    // TODO: ссылка на памятку по коммуникациям
  });

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
      const hasVideo = !!(PUMPKIN[SCENARIOS[current].mood] || PUMPKIN.base).eat;
      if (document.body.classList.contains("mobile")) { setPumpkin(pumpkinGame, SCENARIOS[current].mood, "eat"); setTimeout(resolve, hasVideo ? EAT_MS : 900); return; }
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
      setTimeout(resolve, hasVideo ? 650 + EAT_MS : 1500);
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
