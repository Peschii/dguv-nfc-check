const STORAGE_KEY = "dguv-nfc-devices-v1";
const SHEET_URL_KEY = "dguv-nfc-sheet-url-v1";

const DEFAULT_DEVICES = [
  { tagId: "EL-001", part: "Test Netzteil", nextCheck: "2026-12-31", lab: "Labor 1", place: "Tisch 1" },
  { tagId: "EL-002", part: "Altes Kabel", nextCheck: "2025-01-01", lab: "Labor 1", place: "Schrank A" },
  { tagId: "EL-003", part: "Steckdosenleiste", nextCheck: "2026-09-30", lab: "Labor 2", place: "Werkbank links" },
  { tagId: "EL-004", part: "Gelbtest Netzteil", nextCheck: "2026-08-20", lab: "Labor 1", place: "Testplatz Gelb" },
];

const state = {
  devices: loadDevices(),
  currentTag: "",
};

const els = {
  statusPanel: document.getElementById("statusPanel"),
  statusKicker: document.getElementById("statusKicker"),
  statusText: document.getElementById("statusText"),
  statusSubline: document.getElementById("statusSubline"),
  scanButton: document.getElementById("scanButton"),
  writeUrlButton: document.getElementById("writeUrlButton"),
  writeTextButton: document.getElementById("writeTextButton"),
  searchButton: document.getElementById("searchButton"),
  tagInput: document.getElementById("tagInput"),
  nfcHint: document.getElementById("nfcHint"),
  partValue: document.getElementById("partValue"),
  dateValue: document.getElementById("dateValue"),
  labValue: document.getElementById("labValue"),
  placeValue: document.getElementById("placeValue"),
  tagValue: document.getElementById("tagValue"),
  urlValue: document.getElementById("urlValue"),
  copyUrlButton: document.getElementById("copyUrlButton"),
  form: document.getElementById("deviceForm"),
  formTag: document.getElementById("formTag"),
  formPart: document.getElementById("formPart"),
  formDate: document.getElementById("formDate"),
  formLab: document.getElementById("formLab"),
  formPlace: document.getElementById("formPlace"),
  sheetUrlInput: document.getElementById("sheetUrlInput"),
  saveSheetUrlButton: document.getElementById("saveSheetUrlButton"),
  reloadSheetButton: document.getElementById("reloadSheetButton"),
  addDemoButton: document.getElementById("addDemoButton"),
  exportButton: document.getElementById("exportButton"),
  importInput: document.getElementById("importInput"),
  deviceList: document.getElementById("deviceList"),
};

init();

function init() {
  els.sheetUrlInput.value = localStorage.getItem(SHEET_URL_KEY) || "";

  if (!("NDEFReader" in window)) {
    els.nfcHint.textContent = "NFC Scan geht nur in Chrome auf Android. Manuelle Suche geht überall.";
    els.scanButton.disabled = true;
    els.writeUrlButton.disabled = true;
    els.writeTextButton.disabled = true;
  }

  const idFromUrl = new URLSearchParams(location.search).get("id");
  if (idFromUrl) {
    findAndShow(idFromUrl);
  } else if (state.devices.length) {
    showDevice(state.devices[0]);
  } else {
    showUnknown("Bereit", "DGUV NFC Check", "Testdaten laden oder erstes Gerät speichern.");
  }

  els.scanButton.addEventListener("click", scanNfc);
  els.writeUrlButton.addEventListener("click", () => writeNfc("url"));
  els.writeTextButton.addEventListener("click", () => writeNfc("text"));
  els.copyUrlButton.addEventListener("click", copyCurrentUrl);
  els.searchButton.addEventListener("click", () => findAndShow(els.tagInput.value));
  els.tagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") findAndShow(els.tagInput.value);
  });
  els.form.addEventListener("submit", saveDeviceFromForm);
  els.saveSheetUrlButton.addEventListener("click", saveSheetUrl);
  els.reloadSheetButton.addEventListener("click", loadFromSheet);
  els.addDemoButton.addEventListener("click", addDemoData);
  els.exportButton.addEventListener("click", exportJson);
  els.importInput.addEventListener("change", importJson);
  renderList();

  if (els.sheetUrlInput.value) {
    loadFromSheet();
  }
}

function saveSheetUrl() {
  const url = els.sheetUrlInput.value.trim();
  if (!url) {
    localStorage.removeItem(SHEET_URL_KEY);
    els.nfcHint.textContent = "Sheet-URL entfernt. App nutzt lokale Daten.";
    return;
  }
  localStorage.setItem(SHEET_URL_KEY, url);
  els.nfcHint.textContent = "Sheet-URL gespeichert.";
  loadFromSheet();
}

async function loadFromSheet() {
  const url = els.sheetUrlInput.value.trim() || localStorage.getItem(SHEET_URL_KEY) || "";
  if (!url) {
    els.nfcHint.textContent = "Keine Sheet-URL eingetragen.";
    return;
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();
    const devices = parseDevicesCsv(csv);
    if (!devices.length) throw new Error("Keine gültigen Geräte im Sheet gefunden.");
    state.devices = devices;
    persist();
    renderList();
    if (state.currentTag) {
      findAndShow(state.currentTag);
    } else {
      showDevice(state.devices[0]);
    }
    els.nfcHint.textContent = `Sheet geladen: ${devices.length} Geräte.`;
  } catch (error) {
    showUnknown("Sheet-Fehler", "Nicht geladen", error.message || "CSV konnte nicht gelesen werden.");
  }
}

async function copyCurrentUrl() {
  const tag = normalizeTag(state.currentTag || els.tagInput.value);
  if (!tag) {
    showUnknown("Keine ID", "Tag-ID fehlt", "Erst Gerät anzeigen oder ID eingeben.");
    return;
  }
  const url = buildDeviceUrl(tag);
  try {
    await navigator.clipboard.writeText(url);
    els.nfcHint.textContent = `Tag-URL kopiert: ${url}`;
  } catch {
    els.urlValue.textContent = url;
    els.nfcHint.textContent = "Kopieren blockiert. URL steht im Feld Tag-URL.";
  }
}

async function writeNfc(mode) {
  if (!("NDEFReader" in window)) {
    showUnknown("Kein NFC", "Nicht unterstützt", "Bitte Chrome auf Android verwenden.");
    return;
  }

  const tag = normalizeTag(state.currentTag || els.tagInput.value);
  if (!tag) {
    showUnknown("Keine ID", "Tag-ID fehlt", "Erst Gerät anzeigen oder ID eingeben.");
    return;
  }

  const payload =
    mode === "url"
      ? buildDeviceUrl(tag)
      : `ELEKTRO|${tag}`;

  try {
    const writer = new NDEFReader();
    await writer.write({
      records: [
        mode === "url"
          ? { recordType: "url", data: payload }
          : { recordType: "text", data: payload },
      ],
    });
    els.nfcHint.textContent = `NFC-Tag geschrieben: ${payload}`;
  } catch (error) {
    showUnknown("Schreiben fehlgeschlagen", "NFC-Fehler", error.message || "Tag konnte nicht beschrieben werden.");
  }
}

async function scanNfc() {
  if (!("NDEFReader" in window)) {
    showUnknown("Kein NFC", "Nicht unterstützt", "Bitte Chrome auf Android verwenden.");
    return;
  }

  try {
    const reader = new NDEFReader();
    await reader.scan();
    els.nfcHint.textContent = "Scanner aktiv. NFC-Tag an das Android-Handy halten.";
    showUnknown("Scanner aktiv", "Tag halten", "Warte auf NFC...");

    reader.onreading = (event) => {
      const text = readNdefText(event);
      const fallback = event.serialNumber || "";
      findAndShow(text || fallback);
    };

    reader.onerror = () => {
      showUnknown("NFC-Fehler", "Scan abgebrochen", "Bitte erneut versuchen.");
    };
  } catch (error) {
    showUnknown("NFC-Fehler", "Keine Freigabe", error.message || "Scan konnte nicht gestartet werden.");
  }
}

function readNdefText(event) {
  for (const record of event.message.records) {
    if (record.recordType === "text") {
      const decoder = new TextDecoder(record.encoding || "utf-8");
      return decoder.decode(record.data);
    }
    if (record.recordType === "url") {
      const decoder = new TextDecoder();
      return decoder.decode(record.data);
    }
  }
  return "";
}

function normalizeTag(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const urlId = raw.match(/[?&]id=([^&]+)/i);
  if (urlId) return decodeURIComponent(urlId[1]).trim().toUpperCase();
  const pipe = raw.includes("|") ? raw.split("|").pop() : raw;
  return pipe.trim().toUpperCase();
}

function findAndShow(input) {
  const tag = normalizeTag(input);
  els.tagInput.value = tag;
  state.currentTag = tag;
  let device = state.devices.find((item) => normalizeTag(item.tagId) === tag);
  if (!device) {
    device = DEFAULT_DEVICES.find((item) => normalizeTag(item.tagId) === tag);
    if (device) {
      state.devices.push(device);
      persist();
      renderList();
    }
  }
  if (!device) {
    showUnknown("Nicht gefunden", "UNBEKANNT", tag ? `Keine Daten für ${tag}` : "Keine Tag-ID eingegeben.");
    setDetails({ tagId: tag });
    return;
  }
  showDevice(device);
}

function showDevice(device) {
  state.currentTag = normalizeTag(device.tagId);
  const status = getCheckStatus(device.nextCheck);
  els.statusPanel.className = `status-panel ${status}`;
  els.statusKicker.textContent = device.tagId;
  els.statusText.textContent = status === "valid" ? "GETESTET UND GUT" : status === "soon" ? "BALD TESTEN" : "MUSS GETESTET WERDEN";
  els.statusSubline.textContent =
    status === "valid"
      ? `Nächste Prüfung: ${formatDate(device.nextCheck)}`
      : status === "soon"
        ? `Innerhalb 1 Monat: ${formatDate(device.nextCheck)}`
        : `Fällig seit: ${formatDate(device.nextCheck)}`;
  setDetails(device);
}

function showUnknown(kicker, title, subline) {
  els.statusPanel.className = "status-panel unknown";
  els.statusKicker.textContent = kicker;
  els.statusText.textContent = title;
  els.statusSubline.textContent = subline;
}

function setDetails(device = {}) {
  els.partValue.textContent = device.part || "-";
  els.dateValue.textContent = device.nextCheck ? formatDate(device.nextCheck) : "-";
  els.labValue.textContent = device.lab || "-";
  els.placeValue.textContent = device.place || "-";
  els.tagValue.textContent = device.tagId || "-";
  els.urlValue.textContent = device.tagId ? buildDeviceUrl(device.tagId) : "-";
}

function buildDeviceUrl(tagId) {
  return `${location.origin}${location.pathname}?id=${encodeURIComponent(normalizeTag(tagId))}`;
}

function getCheckStatus(dateValue) {
  if (!dateValue) return "unknown";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(check.getTime())) return "unknown";
  const diffDays = Math.ceil((check.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "invalid";
  if (diffDays <= 30) return "soon";
  return "valid";
}

function formatDate(dateValue) {
  if (!dateValue) return "-";
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("de-DE");
}

function saveDeviceFromForm(event) {
  event.preventDefault();
  const device = {
    tagId: normalizeTag(els.formTag.value),
    part: els.formPart.value.trim(),
    nextCheck: els.formDate.value,
    lab: els.formLab.value.trim(),
    place: els.formPlace.value.trim(),
  };

  const existing = state.devices.findIndex((item) => normalizeTag(item.tagId) === device.tagId);
  if (existing >= 0) {
    state.devices[existing] = device;
  } else {
    state.devices.push(device);
  }

  persist();
  renderList();
  showDevice(device);
  els.form.reset();
}

function addDemoData() {
  state.devices = [...DEFAULT_DEVICES];
  persist();
  renderList();
  showDevice(state.devices[0]);
}

function renderList() {
  els.deviceList.innerHTML = "";
  for (const device of state.devices) {
    const row = document.createElement("div");
    row.className = "device-row";
    const status = getCheckStatus(device.nextCheck);
    const label = status === "valid" ? "OK" : status === "soon" ? "BALD" : status === "unknown" ? "?" : "PRÜFEN";
    row.innerHTML = `
      <div class="badge ${status}">${label}</div>
      <div class="row-main">
        <strong>${escapeHtml(device.part)}</strong>
        <span>${escapeHtml(device.tagId)} · ${escapeHtml(device.lab)} · ${escapeHtml(device.place)}</span>
      </div>
      <div class="row-actions">
        <button type="button" data-action="show" data-id="${escapeHtml(device.tagId)}">Anzeigen</button>
        <button type="button" data-action="delete" data-id="${escapeHtml(device.tagId)}">Löschen</button>
      </div>
    `;
    els.deviceList.appendChild(row);
  }

  els.deviceList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-id");
      if (button.getAttribute("data-action") === "delete") {
        state.devices = state.devices.filter((item) => normalizeTag(item.tagId) !== normalizeTag(id));
        persist();
        renderList();
      } else {
        findAndShow(id);
      }
    });
  });
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.devices, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dguv-nfc-geräte.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("JSON muss eine Liste sein.");
  state.devices = data.map((item) => ({
    tagId: normalizeTag(item.tagId),
    part: String(item.part || "").trim(),
    nextCheck: String(item.nextCheck || "").trim(),
    lab: String(item.lab || "").trim(),
    place: String(item.place || "").trim(),
  }));
  persist();
  renderList();
  if (state.devices[0]) showDevice(state.devices[0]);
}

function parseDevicesCsv(csv) {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => String(cell).trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map((cell) => normalizeHeader(cell));

  return rows
    .slice(1)
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] || "";
      });
      return {
        tagId: normalizeTag(record.tagid || record.tag_id || record.id),
        part: String(record.bauteil || record.geraet || record.part || "").trim(),
        nextCheck: normalizeDate(
          record.naechstepruefung ||
            record.datum ||
            record.pruefdatum
        ),
        lab: String(record.labor || "").trim(),
        place: String(record.ort || record.standort || "").trim(),
      };
    })
    .filter((device) => device.tagId && device.part && device.nextCheck);
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === "," || char === ";") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const german = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) {
    return `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
  }
  return raw;
}

function loadDevices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_DEVICES];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...DEFAULT_DEVICES];
  } catch {
    return [...DEFAULT_DEVICES];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.devices));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

