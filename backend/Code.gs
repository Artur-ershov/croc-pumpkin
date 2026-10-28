// Приём ответов игры «Заколдованная тыква».
// Таблица → Расширения → Apps Script → вставить этот файл → Развернуть → Новое развертывание →
// тип «Веб-приложение», запуск от моего имени, доступ «Все». Полученный URL — в BACKEND_URL в app.js.

const SCENARIOS = ["СПРОСИТЬ", "НАПОМНИТЬ", "ПОБЛАГОДАРИТЬ", "НЕ СОГЛАСИТЬСЯ"];
const LOG_SHEET = "Все ответы";
const PEOPLE_SHEET = "По участникам";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const email = String(data.email || "").trim().toLowerCase();
    const scenario = String(data.scenario || "");
    const answer = String(data.answer || "");
    if (!/^[a-z0-9._%+-]+@croc\.ru$/.test(email) || SCENARIOS.indexOf(scenario) === -1 || !answer) {
      return json({ ok: false, error: "bad request" });
    }
    const now = new Date();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Every submission, including re-answers.
    sheet(ss, LOG_SHEET, ["Время", "Почта", "Сценарий", "Ответ"]).appendRow([now, email, scenario, answer]);

    // One row per player with the latest answer to each scenario.
    const people = sheet(ss, PEOPLE_SHEET, ["Почта"].concat(SCENARIOS, ["Пройдено", "Обновлено"]));
    const emails = people.getRange(1, 1, people.getLastRow(), 1).getValues().map((r) => r[0]);
    let row = emails.indexOf(email) + 1;
    if (row === 0) {
      people.appendRow([email]);
      row = people.getLastRow();
    }
    people.getRange(row, 2 + SCENARIOS.indexOf(scenario)).setValue(answer);
    const filled = people.getRange(row, 2, 1, SCENARIOS.length).getValues()[0].filter(String).length;
    people.getRange(row, 2 + SCENARIOS.length, 1, 2).setValues([[filled + "/" + SCENARIOS.length, now]]);

    return json({ ok: true });
  } finally {
    lock.releaseLock();
  }
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
