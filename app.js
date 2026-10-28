(() => {
  // ── Content (copy from the brief, unchanged) ────────────────────────────────
  const SCENARIOS = [
    {
      tab: "СПРОСИТЬ", word: "СПРОСИТЬ", mood: "surprise",
      text: "Представь, что тебе нужно уточнить информацию по проекту у коллеги: ты не можешь найти нужный файл в хранилище. Как бы ты сформулировал свое письмо в почте?",
      hint: null,
    },
    {
      tab: "НАПОМНИТЬ", word: "НАПОМНИТЬ", mood: "nerd",
      text: "До сдачи проекта осталось 2 дня, и для завершения своей задачи тебе нужна готовая часть от коллеги из смежной команды, которую он обещал скинуть сегодня. Как ты напомнишь о задаче коллеге?",
      hint: "(при вводе ответа можешь указать, где именно ты бы написал сообщение: в почте, Talks, Telegram или др.)",
    },
    {
      tab: "ПОБЛАГОДАРИТЬ", word: "ПОБЛАГОДАРИТЬ", mood: "happy",
      text: "Коллега круто помог тебе в выполнении твоей задачи, подхватив ее часть. Как бы ты сформулировал сообщение с благодарностью?",
      hint: "(При вводе ответа можешь указать, где именно ты бы написал сообщение: в почте, Talks, Telegram или др.; также укажи, если обычно выражаешь благодарность устно)",
    },
    {
      tab: "НЕ СОГЛАСИТЬСЯ", word: "НЕ СОГЛАСИТЬСЯ", mood: "disagree",
      text: "Коллега из твоей команды предлагает подход, с которым ты не согласен. Твое виденье тактики, которую команде стоит взять внутри проекта, кардинально отличается. Как бы ты начал сообщение, в котором бы описал предложение со своим подходом?",
      hint: "(При вводе ответа можешь указать, где именно ты бы написал сообщение: в почте, Talks, Telegram или др.)",
    },
  ];

  // ── Pumpkin media. Put video paths here when the animations are ready:
  //    e.g. surprise: { image: "...", idle: "assets/video/surprise-idle.webm", eat: "assets/video/surprise-eat.webm" }
  const PUMPKIN = {
    base:     { image: "assets/pumpkin-base.png" },
    surprise: { image: "assets/pumpkin-surprise.png" },
    nerd:     { image: "assets/pumpkin-nerd.png" },
    happy:    { image: "assets/pumpkin-happy.png" },
    disagree: { image: "assets/pumpkin-disagree.png" },
  };

  const EMAIL_RE = /^[a-z0-9._%+-]+@croc\.ru$/i;
  const STORE_KEY = "croc-pumpkin-v1";

  // ── State ───────────────────────────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  if (params.has("reset")) localStorage.removeItem(STORE_KEY);
  let store = {};
  try { store = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { store = {}; }
  let email = "";
  let current = 0;
  let answers = {};

  const $ = (s) => document.querySelector(s);
  const stage = $("#stage");

  // ── Layout: scale the 1920×1080 stage, or reflow on phones ──────────────────
  function layout() {
    const mobile = innerWidth < 760 || innerWidth / innerHeight < 0.75;
    document.body.classList.toggle("mobile", mobile);
    if (mobile) { stage.style.transform = ""; fitAll(); return; }
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
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
    if (src) {
      el.classList.add("has-video");
      video.src = src; video.loop = action === "idle"; video.play().catch(() => {});
      el.classList.remove("idle", "eat", "happy");
    } else {
      el.classList.remove("has-video");
      el.classList.remove("idle", "eat", "happy");
      void el.offsetWidth; // restart CSS animation
      el.classList.add(action);
      if (action !== "idle") el.addEventListener("animationend", () => { el.classList.remove(action); el.classList.add("idle"); }, { once: true });
    }
  }
  document.querySelectorAll("[data-pumpkin]").forEach((el) => setPumpkin(el, el.dataset.mood));

  // ── Screens ─────────────────────────────────────────────────────────────────
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
    requestAnimationFrame(fitAll);
    if (document.body.classList.contains("mobile")) scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── 01 → 02: email modal ────────────────────────────────────────────────────
  const modal = $("#modal");
  const emailInput = $("#email");
  const emailField = $("#email-field");
  const emailBtn = $("#btn-email");
  let emailTimer = null;

  function validateEmail(showError) {
    const v = emailInput.value.trim();
    const ok = EMAIL_RE.test(v);
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
  $("#email-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateEmail(true)) { emailInput.focus(); return; }
    email = emailInput.value.trim().toLowerCase();
    answers = (store[email] && store[email].answers) || {};
    modal.hidden = true;
    current = firstUndone();
    if (current === -1) { finish(); return; }
    renderGame();
    show("screen-game");
  });
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
    for (let i = 0; i < SCENARIOS.length; i++) if (!answers[i]) return i;
    return -1;
  }
  function doneCount() { return SCENARIOS.filter((_, i) => answers[i]).length; }

  function renderGame(popIndex = -1) {
    const s = SCENARIOS[current];
    [...tabs.children].forEach((b, i) => {
      b.classList.toggle("is-active", i === current);
      b.classList.toggle("is-done", !!answers[i]);
    });
    const word = $("#scenario-word");
    word.textContent = s.word;
    $("#scenario-text").textContent = s.text;
    $("#hint").hidden = !s.hint;
    $("#hint-text").textContent = s.hint || "";
    answer.value = answers[current] || "";
    const stars = $("#stars");
    const n = doneCount();
    stars.innerHTML = SCENARIOS.map((_, i) => `<i class="${i < n ? "on" : ""}${i === popIndex ? " pop" : ""}"></i>`).join("");
    setPumpkin(pumpkinGame, s.mood);
    fit(word); placeColumns();
  }

  // Text "flies" into the pumpkin, the pumpkin chews, progress updates.
  function feedAnimation(text) {
    return new Promise((resolve) => {
      if (document.body.classList.contains("mobile")) { setPumpkin(pumpkinGame, SCENARIOS[current].mood, "eat"); setTimeout(resolve, 900); return; }
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
      setTimeout(resolve, 1500);
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
    const wasDone = !!answers[current];
    await feedAnimation(text);
    answers[current] = text;
    save();
    sendToBackend({ email, scenario: SCENARIOS[current].word, answer: text });
    btn.disabled = false;
    const next = firstUndone();
    if (next === -1) { setTimeout(finish, 300); return; }
    if (!wasDone) current = next;
    renderGame(wasDone ? -1 : doneCount() - 1);
  });
  answer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#answer-form").requestSubmit();
  });

  function save() {
    store[email] = { answers, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  // Stub: in production post to Google Apps Script / form backend (as in "Растопи лёд").
  function sendToBackend(payload) {
    console.log("[pumpkin] answer", payload);
  }

  // ── 04: final ───────────────────────────────────────────────────────────────
  function finish() {
    show("screen-final");
    setPumpkin(document.querySelector(".pumpkin-final"), "happy", "happy");
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  document.fonts.ready.then(layout);
  layout();
})();
