// Приём ответов игры «Заколдованная тыква».
// Таблица → Расширения → Apps Script → вставить этот файл → Развернуть → Новое развертывание →
// тип «Веб-приложение», запуск от моего имени, доступ «Все». Полученный URL — в BACKEND_URL в app.js.
//
// Under a burst of players the account allows 30 simultaneous executions, so doPost only appends one
// row and holds the lock for a fraction of a second. "По участникам" is a plain formula typed into the
// sheet itself; the script never writes there.

const SCENARIOS = ["СПРОСИТЬ", "НАПОМНИТЬ", "ПОБЛАГОДАРИТЬ", "НЕ СОГЛАСИТЬСЯ"];
const LOG_SHEET = "Все ответы";
const LOG_HEADER = ["Время", "Почта", "Сценарий", "Ответ"];
// Same rule as «Растопи лёд»: any domain, one "@", non-empty parts, login not all digits.
function isValidEmail(email) {
  const parts = email.split("@");
  return parts.length === 2 && parts[0] !== "" && parts[1] !== "" && !/^\d+$/.test(parts[0]);
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad request" }); }
  const email = String(data.email || "").trim().toLowerCase();
  const scenario = String(data.scenario || "");
  const answer = String(data.answer || "");
  if (!isValidEmail(email) || SCENARIOS.indexOf(scenario) === -1 || !answer) {
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
  if (!isValidEmail(email)) return json({ ok: false, error: "bad request" });
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
  if (!log || log.getLastRow() < 2) return json({ ok: true, done: [] });
  const rows = log.getRange(2, 2, log.getLastRow() - 1, 2).getValues(); // Почта, Сценарий
  const done = {};
  rows.forEach((r) => { if (String(r[0]).toLowerCase() === email) done[SCENARIOS.indexOf(String(r[1]))] = true; });
  return json({ ok: true, done: Object.keys(done).map(Number).filter((i) => i >= 0).sort() });
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
