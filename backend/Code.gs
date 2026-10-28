// Приём ответов игры «Заколдованная тыква».
// Таблица → Расширения → Apps Script → вставить этот файл → Развернуть → Новое развертывание →
// тип «Веб-приложение», запуск от моего имени, доступ «Все». Полученный URL — в BACKEND_URL в app.js.
//
// Under a burst of players the account allows 30 simultaneous executions, so doPost only appends one
// row and holds the lock for a fraction of a second. "По участникам" is a live formula over the log:
// run setupPeople() once from the editor to create it.

const SCENARIOS = ["СПРОСИТЬ", "НАПОМНИТЬ", "ПОБЛАГОДАРИТЬ", "НЕ СОГЛАСИТЬСЯ"];
const LOG_SHEET = "Все ответы";
const LOG_HEADER = ["Время", "Почта", "Сценарий", "Ответ"];
const PEOPLE_SHEET = "По участникам";
const EMAIL_RE = /^[a-z0-9._%+-]+@croc\.ru$/;

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad request" }); }
  const email = String(data.email || "").trim().toLowerCase();
  const scenario = String(data.scenario || "");
  const answer = String(data.answer || "");
  if (!EMAIL_RE.test(email) || SCENARIOS.indexOf(scenario) === -1 || !answer) {
    return json({ ok: false, error: "bad request" });
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json({ ok: false, error: "busy" }); // the game retries later
  try {
    sheet(SpreadsheetApp.getActiveSpreadsheet(), LOG_SHEET, LOG_HEADER).appendRow([new Date(), email, scenario, answer]);
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

// GET ?email=… → indices of scenarios this player has answered, so the game resumes in any browser.
// Answer texts are never returned.
function doGet(e) {
  const email = String((e.parameter && e.parameter.email) || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "bad request" });
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
  if (!log || log.getLastRow() < 2) return json({ ok: true, done: [] });
  const rows = log.getRange(2, 2, log.getLastRow() - 1, 2).getValues(); // Почта, Сценарий
  const done = {};
  rows.forEach((r) => { if (String(r[0]).toLowerCase() === email) done[SCENARIOS.indexOf(String(r[1]))] = true; });
  return json({ ok: true, done: Object.keys(done).map(Number).filter((i) => i >= 0).sort() });
}

// One row per player with the latest answer to each scenario. A single formula: the log is scanned
// once to build "email|scenario" keys, and XLOOKUP from the bottom picks the latest answer.
function setupPeople() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  sheet(ss, LOG_SHEET, LOG_HEADER);
  const sh = ss.getSheetByName(PEOPLE_SHEET) || ss.insertSheet(PEOPLE_SHEET);
  sh.clear();
  const header = ["Почта"].concat(SCENARIOS, ["Пройдено", "Обновлено"]);
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
  sh.setFrozenRows(1);
  const L = "'" + LOG_SHEET + "'!";
  const scen = "{" + SCENARIOS.map((x) => '"' + x + '"').join(",") + "}";
  sh.getRange("A2").setFormula(
    "=LET(tm, " + L + "A2:A, em, " + L + "B2:B, sc, " + L + "C2:C, ans, " + L + "D2:D," +
    " key, em&\"|\"&sc, people, UNIQUE(FILTER(em, em<>\"\")), scen, " + scen + "," +
    " MAKEARRAY(ROWS(people), " + (SCENARIOS.length + 2) + ", LAMBDA(r, c, LET(e, INDEX(people, r)," +
    " IF(c <= " + SCENARIOS.length + ", XLOOKUP(e&\"|\"&INDEX(scen, 1, c), key, ans, \"\", 0, -1)," +
    " IF(c = " + (SCENARIOS.length + 1) + ", COUNTUNIQUEIFS(sc, em, e)&\"/" + SCENARIOS.length + "\", MAXIFS(tm, em, e)))))))"
  );
  sh.getRange(2, header.length, sh.getMaxRows() - 1, 1).setNumberFormat("dd.mm.yyyy hh:mm");
}

function sheet(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
  }
  return sh;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
