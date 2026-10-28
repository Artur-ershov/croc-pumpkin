# Панель «Плёнка» (снята из игры)

Панель с ползунками, которой подбирали покадровую тыкву: FPS и сила эффектов «дрожание контура»,
«тряска кадра», «мерцание». Значения она держит в `localStorage` этого браузера.
Из игры убрана 28.10.2026; выбранные значения зашиты в `FILM_DEFAULTS` в `app.js`:

| Параметр | Значение |
|---|---|
| Кадров в секунду (`fps`) | 8 |
| Дрожание контура (`boil`) | 20% → 0.2 |
| Тряска кадра (`shake`) | 50% → 0.5 |
| Мерцание (`flicker`) | 50% → 0.5 |

## Как вернуть

1. В `app.js`, в блоке «Film look», после `const FILM = { ...FILM_DEFAULTS };` добавить:

```js
  const SHOW_TUNER = location.hash === "#tune"; // open the game with #tune at the end of the link
  const FILM_KEY = "croc-pumpkin-film";
  try { Object.assign(FILM, JSON.parse(localStorage.getItem(FILM_KEY) || "{}")); } catch {}
  function saveFilm() { try { localStorage.setItem(FILM_KEY, JSON.stringify(FILM)); } catch {} }
```

2. Перед блоком «Pumpkin slot» вставить сам код панели:

```js
  // ── Tuner panel: live sliders for the film look ─────────────────────────────
  if (SHOW_TUNER) {
    const panel = document.createElement("details");
    panel.className = "tuner";
    try { panel.open = localStorage.getItem(FILM_KEY + "-open") === "1"; } catch {}
    panel.addEventListener("toggle", () => { try { localStorage.setItem(FILM_KEY + "-open", panel.open ? "1" : "0"); } catch {} });
    panel.innerHTML = `<summary>Плёнка</summary><div class="tuner-body"></div>`;
    const body = panel.querySelector(".tuner-body");
    const rows = [["fps", "Кадров в секунду", 4, 24], ["boil", "Дрожание контура", 0, 100], ["shake", "Тряска кадра", 0, 100], ["flicker", "Мерцание", 0, 100]];
    const sync = [];
    rows.forEach(([key, label, min, max]) => {
      const row = document.createElement("label");
      row.className = "tuner-row";
      row.innerHTML = `<span>${label}</span><b></b><input type="range" id="tuner-${key}" min="${min}" max="${max}" step="1">`;
      const input = row.querySelector("input"), out = row.querySelector("b");
      const show = () => {
        input.value = key === "fps" ? FILM.fps : Math.round(FILM[key] * 100);
        out.textContent = key === "fps" ? String(FILM.fps) : input.value + "%";
      };
      input.addEventListener("input", () => {
        FILM[key] = key === "fps" ? Number(input.value) : input.value / 100;
        out.textContent = key === "fps" ? input.value : input.value + "%";
        if (key === "boil") applyBoil();
        saveFilm();
      });
      show(); sync.push(show); body.appendChild(row);
    });
    const reset = document.createElement("button");
    reset.type = "button"; reset.className = "tuner-reset"; reset.textContent = "Сбросить";
    reset.addEventListener("click", () => { Object.assign(FILM, FILM_DEFAULTS); applyBoil(); saveFilm(); sync.forEach((s) => s()); });
    body.appendChild(reset);
    document.body.appendChild(panel);
  }
```

3. В `styles.css` перед `@media (prefers-reduced-motion: reduce)` вставить стили:

```css
/* ── Film tuner panel (SHOW_TUNER in app.js) ── */
.tuner {
  position: fixed; z-index: 100; width: 280px;
  right: max(12px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top));
  background: rgba(0, 7, 6, .92); border: 1.5px solid var(--orange-deep); border-radius: 16px; color: var(--cream);
}
.tuner:not([open]) { width: auto; }
.tuner summary {
  padding: 10px 16px; cursor: pointer; list-style: none; color: var(--orange); font-size: 22px;
  font-variation-settings: "wdth" 75, "wght" 800;
}
.tuner summary::-webkit-details-marker { display: none; }
.tuner summary::after { content: "–"; float: right; margin-left: 14px; }
.tuner:not([open]) summary::after { content: "+"; }
.tuner summary:focus-visible, .tuner input:focus-visible, .tuner-reset:focus-visible { outline: 2px solid var(--cream); outline-offset: 2px; }
.tuner-body { display: flex; flex-direction: column; gap: 12px; padding: 2px 16px 16px; }
.tuner-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; font-size: 15px; }
.tuner-row b { color: var(--orange); font-weight: 600; font-variant-numeric: tabular-nums; }
.tuner-row input { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: var(--orange); }
.tuner-reset {
  align-self: flex-start; padding: 6px 14px; border: 1.5px solid var(--orange-deep); border-radius: 999px;
  background: none; color: var(--cream); font: inherit; font-size: 14px; cursor: pointer;
}
body.mobile .tuner[open] { left: max(12px, env(safe-area-inset-left)); width: auto; }
```

Панель появляется, только если `SHOW_TUNER` истинно (в варианте выше — по ссылке с `#tune` на конце).
