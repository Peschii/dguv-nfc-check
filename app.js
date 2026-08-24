const STORAGE_KEY = "dguv-nfc-devices-v1";
const SHEET_URL_KEY = "dguv-nfc-sheet-url-v1";
const WALK_LOG_KEY = "dguv-nfc-walk-log-v1";
const INSPECTOR_KEY = "dguv-nfc-inspector-v1";
const WRITER_KEY = "dguv-nfc-writer-v1";
const PUBLIC_APP_URL = "https://peschii.github.io/dguv-nfc-check/";
const CHECK_VALID_YEARS = 2;

const DEFAULT_DEVICES = [
  { tagId: "EL-001", part: "Test Netzteil", nextCheck: "2026-12-31", lab: "Labor 1", place: "Tisch 1" },
  { tagId: "EL-002", part: "Altes Kabel", nextCheck: "2025-01-01", lab: "Labor 1", place: "Schrank A" },
  { tagId: "EL-003", part: "Steckdosenleiste", nextCheck: "2026-09-30", lab: "Labor 2", place: "Werkbank links" },
  { tagId: "EL-004", part: "Gelbtest Netzteil", nextCheck: "2026-08-20", lab: "Labor 1", place: "Testplatz Gelb" },
];

const state = {
  devices: loadDevices(),
  walkLog: loadWalkLog(),
  currentTag: "",
  writerCount: 0,
};

const els = {
  checkModeButton: document.getElementById("checkModeButton"),
  writeModeButton: document.getElementById("writeModeButton"),
  writerPage: document.getElementById("writerPage"),
  checkViews: document.querySelectorAll(".check-view"),
  statusPanel: document.getElementById("statusPanel"),
  statusKicker: document.getElementById("statusKicker"),
  statusText: document.getElementById("statusText"),
  statusSubline: document.getElementById("statusSubline"),
  scanButton: document.getElementById("scanButton"),
  inspectorInput: document.getElementById("inspectorInput"),
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
  warningCount: document.getElementById("warningCount"),
  warningList: document.getElementById("warningList"),
  walkLogCount: document.getElementById("walkLogCount"),
  walkLogList: document.getElementById("walkLogList"),
  downloadLogButton: document.getElementById("downloadLogButton"),
  emailLogButton: document.getElementById("emailLogButton"),
  clearLogButton: document.getElementById("clearLogButton"),
  writerForm: document.getElementById("writerForm"),
  writerInspector: document.getElementById("writerInspector"),
  writerDate: document.getElementById("writerDate"),
  writerLab: document.getElementById("writerLab"),
  writerPlace: document.getElementById("writerPlace"),
  writerTag: document.getElementById("writerTag"),
  writerPart: document.getElementById("writerPart"),
  connectUsbButton: document.getElementById("connectUsbButton"),
  writePreparedButton: document.getElementById("writePreparedButton"),
  savePreparedButton: document.getElementById("savePreparedButton"),
  nextPreparedButton: document.getElementById("nextPreparedButton"),
  writerCounter: document.getElementById("writerCounter"),
  writerPreview: document.getElementById("writerPreview"),
  writerHint: document.getElementById("writerHint"),
};

let serialPort = null;
let serialReader = null;
let serialWriter = null;
let usbWriterMode = '';
let pcscPollTimer = null;
let lastPcscUid = '';
let lastPcscData = '';
let pcscPollBusy = false;

init();

function init() {
  els.sheetUrlInput.value = localStorage.getItem(SHEET_URL_KEY) || "";
  els.inspectorInput.value = localStorage.getItem(INSPECTOR_KEY) || "";
  loadWriterDefaults();

  if (!("NDEFReader" in window)) {
    els.nfcHint.textContent = "NFC Scan geht nur in Chrome auf Android. Manuelle Suche geht überall.";
    els.scanButton.disabled = true;
    els.writeUrlButton.disabled = true;
    els.writeTextButton.disabled = true;
  }

  if (!('serial' in navigator)) {
    els.writerHint.textContent = 'Am PC zuerst lokalen USB-Writer versuchen. WebSerial ist hier nicht verfügbar.';
  }

  const idFromUrl = new URLSearchParams(location.search).get("id");
  if (idFromUrl) {
    findAndShow(idFromUrl);
  } else {
    showStart();
  }

  initLocalPcscAutoDetect();

  els.scanButton.addEventListener("click", scanNfc);
  els.checkModeButton.addEventListener("click", () => setMode("check"));
  els.writeModeButton.addEventListener("click", () => setMode("write"));
  els.writeUrlButton.addEventListener("click", () => writeNfc("url"));
  els.writeTextButton.addEventListener("click", () => writeNfc("text"));
  els.copyUrlButton.addEventListener("click", copyCurrentUrl);
  els.searchButton.addEventListener("click", () => findAndShow(els.tagInput.value));
  els.inspectorInput.addEventListener("input", () => {
    localStorage.setItem(INSPECTOR_KEY, els.inspectorInput.value.trim());
    renderWarnings();
  });
  els.tagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") findAndShow(els.tagInput.value);
  });
  els.form.addEventListener("submit", saveDeviceFromForm);
  els.saveSheetUrlButton.addEventListener("click", saveSheetUrl);
  els.reloadSheetButton.addEventListener("click", loadFromSheet);
  els.addDemoButton.addEventListener("click", addDemoData);
  els.exportButton.addEventListener("click", exportJson);
  els.importInput.addEventListener("change", importJson);
  els.downloadLogButton.addEventListener("click", downloadWalkLog);
  els.emailLogButton.addEventListener("click", emailWalkLog);
  els.clearLogButton.addEventListener("click", clearWalkLog);
  els.connectUsbButton.addEventListener("click", connectUsbNfc);
  els.writerForm.addEventListener("submit", writePreparedTag);
  els.savePreparedButton.addEventListener("click", () => savePreparedDevice(true));
  els.nextPreparedButton.addEventListener("click", nextPreparedDevice);
  [els.writerInspector, els.writerDate, els.writerLab, els.writerPlace, els.writerTag, els.writerPart].forEach((input) => {
    input.addEventListener("input", () => {
      saveWriterDefaults();
      renderWriterPreview();
    });
  });
  renderList();
  renderWalkLog();
  renderWarnings();
  renderWriterPreview();

  if (els.sheetUrlInput.value) {
    loadFromSheet();
  }
}

function setMode(mode) {
  const writing = mode === "write";
  els.writerPage.classList.toggle("view-hidden", !writing);
  els.checkViews.forEach((section) => section.classList.toggle("view-hidden", writing));
  els.writeModeButton.classList.toggle("active", writing);
  els.checkModeButton.classList.toggle("active", !writing);
  if (writing) els.writerPart.focus();
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
    renderWarnings();
    if (state.currentTag) {
      findAndShow(state.currentTag, "Anzeige", false);
    } else {
      showStart();
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
  const url = buildDeviceUrl(tag, getCurrentDevice(tag));
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
      ? buildDeviceUrl(tag, getCurrentDevice(tag))
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

async function writePreparedTag(event) {
  event.preventDefault();
  const device = savePreparedDevice(false);
  if (!device) return;

  if (usbWriterMode === 'pcsc' || serialPort) {
    await writePreparedTagUsb(device);
    return;
  }

  if (!("NDEFReader" in window)) {
    els.writerHint.textContent = "Kein USB-NFC verbunden. Gerät wurde gespeichert.";
    return;
  }

  try {
    const writer = new NDEFReader();
    const payload = buildDeviceUrl(device.tagId, device);
    await writer.write({ records: [{ recordType: "url", data: payload }] });
    state.writerCount += 1;
    els.writerCounter.textContent = `${state.writerCount} geschrieben`;
    els.writerHint.textContent = `NFC geschrieben: ${payload}`;
    nextPreparedDevice();
  } catch (error) {
    els.writerHint.textContent = error.message || "NFC konnte nicht beschrieben werden.";
  }
}

async function initLocalPcscAutoDetect() {
  const localPcsc = await tryConnectLocalPcsc();
  if (localPcsc) {
    els.nfcHint.textContent = "USB-NFC Auto-Erkennung aktiv. Tag einfach auflegen.";
  }
}

async function connectUsbNfc() {
  usbWriterMode = "";

  const localPcsc = await tryConnectLocalPcsc();
  if (localPcsc) return;

  if (!("serial" in navigator)) {
    els.writerHint.textContent = "Kein lokaler PC/SC-Writer erreichbar. WebSerial geht nur in Chrome/Edge am PC.";
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });
    serialReader = serialPort.readable.getReader();
    serialWriter = serialPort.writable.getWriter();
    await pn532Wakeup();
    await pn532Command([0x14, 0x01, 0x14, 0x01]);
    usbWriterMode = "pn532";
    els.connectUsbButton.textContent = "USB-NFC verbunden";
    els.writerHint.textContent = "PN532 verbunden. Tag auflegen und schreiben.";
  } catch (error) {
    serialPort = null;
    usbWriterMode = "";
    els.writerHint.textContent = error.message || "USB-NFC konnte nicht verbunden werden.";
  }
}

async function tryConnectLocalPcsc() {
  try {
    const response = await fetch("/api/nfc/list?ts=" + Date.now(), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Kein lokaler NFC-Writer erreichbar.");
    usbWriterMode = "pcsc";
    serialPort = null;
    const reader = Array.isArray(data.readers) && data.readers.length ? data.readers[0] : "PC/SC Reader";
    els.connectUsbButton.textContent = "USB-NFC lokal verbunden";
    els.writerHint.textContent = `Lokaler NFC-Writer bereit: ${reader}. Tag auflegen und schreiben.`;
    startLocalPcscPolling();
    return true;
  } catch {
    return false;
  }
}

function startLocalPcscPolling() {
  if (pcscPollTimer) clearInterval(pcscPollTimer);
  lastPcscUid = "";
  lastPcscData = "";
  els.writerCounter.textContent = "Warte auf Tag";
  pcscPollTimer = setInterval(checkLocalPcscTag, 900);
  checkLocalPcscTag();
}

async function checkLocalPcscTag() {
  if (usbWriterMode !== "pcsc" || pcscPollBusy) return;
  pcscPollBusy = true;
  try {
    const response = await fetch("/api/nfc/read?ts=" + Date.now(), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Kein Tag erkannt.");
    const uid = data.uid || "ohne UID";
    const raw = String(data.data || "").trim();
    const tag = normalizeTag(raw);
    const known = raw ? ` · Inhalt: ${raw}` : " · leer oder nicht lesbar";
    const changed = uid !== lastPcscUid || raw !== lastPcscData;
    lastPcscUid = uid;
    lastPcscData = raw;
    els.writerCounter.textContent = "Tag erkannt";
    const message = tag
      ? `Tag erkannt: ${tag} · ${uid}. Daten wurden automatisch geladen.`
      : `Tag erkannt: ${uid}${known}. Neuer/leer Tag kann beschrieben werden.`;
    els.writerHint.textContent = message;
    els.nfcHint.textContent = message;
    if (tag && changed) applyDetectedLocalTag(tag);
  } catch {
    if (lastPcscUid) {
      lastPcscUid = "";
      lastPcscData = "";
      els.writerCounter.textContent = "Warte auf Tag";
      els.writerHint.textContent = "Reader verbunden. Tag auflegen und liegen lassen.";
      els.nfcHint.textContent = "USB-NFC Auto-Erkennung aktiv. Tag einfach auflegen.";
    }
  } finally {
    pcscPollBusy = false;
  }
}
function applyDetectedLocalTag(tag) {
  els.tagInput.value = tag;
  state.currentTag = tag;
  if (!els.writerPart.value.trim()) {
    els.writerTag.value = tag;
    saveWriterDefaults();
    renderWriterPreview();
  }
  findAndShow(tag, "USB-NFC", false);
}
async function writePreparedTagUsb(device) {
  const wasPolling = pcscPollTimer;
  if (pcscPollTimer) {
    clearInterval(pcscPollTimer);
    pcscPollTimer = null;
  }
  try {
    els.writerHint.textContent = "Tag auflegen...";
    const payload = buildDeviceUrl(device.tagId, device);

    if (usbWriterMode === "pcsc") {
      const response = await fetch("/api/nfc/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: payload }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Lokales NFC-Schreiben fehlgeschlagen.");
      state.writerCount += 1;
      els.writerCounter.textContent = `${state.writerCount} geschrieben`;
      els.writerHint.textContent = `USB-NFC geschrieben: ${device.tagId} · ${data.reader || "Reader"} · ${data.uid || "UID"}`;
      nextPreparedDevice();
      return;
    }

    const target = await pn532FindTarget();
    if (!target) {
      els.writerHint.textContent = "Kein NFC-Tag gefunden.";
      return;
    }

    await writeNtagUrl(target, payload);
    state.writerCount += 1;
    els.writerCounter.textContent = `${state.writerCount} geschrieben`;
    els.writerHint.textContent = `USB-NFC geschrieben: ${device.tagId}`;
    nextPreparedDevice();
  } catch (error) {
    els.writerHint.textContent = error.message || "USB-Schreiben fehlgeschlagen.";
  } finally {
    if (usbWriterMode === "pcsc" && wasPolling) startLocalPcscPolling();
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
      findAndShow(text || fallback, "NFC");
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

function normalizeKnownTagPrefix(tag) {
  const match = String(tag || "").trim().toUpperCase().match(/^([A-Z]+-\d{3,})(?:[A-Z]+)$/);
  return match ? match[1] : tag;
}

function getCurrentDevice(tagId) {
  const tag = normalizeTag(tagId);
  return state.devices.find((item) => normalizeTag(item.tagId) === tag)
    || DEFAULT_DEVICES.find((item) => normalizeTag(item.tagId) === tag)
    || {};
}

function findAndShow(input, source = "Manuell", shouldLog = true) {
  let tag = normalizeTag(input);
  els.tagInput.value = tag;
  state.currentTag = tag;
  let device = state.devices.find((item) => normalizeTag(item.tagId) === tag);
  if (!device) {
    const baseTag = normalizeKnownTagPrefix(tag);
    if (baseTag !== tag) {
      const baseDevice = state.devices.find((item) => normalizeTag(item.tagId) === baseTag);
      if (baseDevice) {
        tag = baseTag;
        els.tagInput.value = tag;
        state.currentTag = tag;
        device = baseDevice;
      }
    }
  }
  if (!device) {
    device = DEFAULT_DEVICES.find((item) => normalizeTag(item.tagId) === tag);
    if (device) {
      state.devices.push(device);
      persist();
      renderList();
    }
  }
  if (!device) {
    device = deviceFromTagPayload(input);
  }
  if (!device) {
    showUnknown("Nicht gefunden", "UNBEKANNT", tag ? `Keine Prüfdaten für ${tag}` : "Keine Tag-ID eingegeben.");
    setDetails({ tagId: tag });
    if (tag && shouldLog) logWalkCheck({ tagId: tag, status: "Unbekannt", source });
    return;
  }
  showDevice(device);
  if (shouldLog) logWalkCheck({ ...device, status: getStatusLabel(getCheckStatus(device.nextCheck)), source });
}

function showDevice(device) {
  state.currentTag = normalizeTag(device.tagId);
  const status = getCheckStatus(device.nextCheck);
  els.statusPanel.className = `status-panel ${status}`;
  els.statusKicker.textContent = device.tagId;
  els.statusText.textContent =
    status === "valid"
      ? "Geprüft und iO"
      : status === "soon"
        ? "Bald prüfen"
        : "Dringend Prüfung veranlassen";
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

function showStart() {
  els.statusPanel.className = "status-panel start";
  els.statusKicker.textContent = "Bereit";
  els.statusText.textContent = "Bitte erstes Gerät scannen";
  els.statusSubline.textContent = "NFC-Tag halten oder Tag-ID eingeben.";
  setDetails({});
}

function setDetails(device = {}) {
  els.partValue.textContent = device.part || "-";
  els.dateValue.textContent = device.nextCheck ? formatDate(device.nextCheck) : "-";
  els.labValue.textContent = device.lab || "-";
  els.placeValue.textContent = device.place || "-";
  els.tagValue.textContent = device.tagId || "-";
  els.urlValue.textContent = device.tagId ? buildDeviceUrl(device.tagId, device) : "-";
}

function buildDeviceUrl(tagId, device = {}) {
  const isLocal = ["127.0.0.1", "localhost"].includes(location.hostname);
  const base = isLocal ? PUBLIC_APP_URL : `${location.origin}${location.pathname}`;
  const params = new URLSearchParams({ id: normalizeTag(tagId) });
  const testDate = normalizeDate(device.testDate || device.pruefdatum || device.checked || "")
    || addYears(normalizeDate(device.nextCheck || ""), -CHECK_VALID_YEARS);
  if (testDate) params.set("date", testDate);
  return `${base.replace(/[?#].*$/, "").replace(/\/$/, "")}/?${params.toString().replace(/\+/g, "%20")}`;
}

function addYears(dateValue, years) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function deviceFromTagPayload(input) {
  const tagId = normalizeTag(input);
  if (!tagId) return null;
  let params;
  try {
    const url = String(input || "").includes("?") ? new URL(String(input), location.href) : null;
    params = url ? url.searchParams : new URLSearchParams(String(input || "").replace(/^\?/, ""));
  } catch {
    params = new URLSearchParams(String(input || "").replace(/^\?/, ""));
  }
  const testDate = normalizeDate(params.get("date") || params.get("pruefdatum") || params.get("checked") || "");
  if (!testDate) return null;
  return {
    tagId,
    part: tagId,
    testDate,
    nextCheck: addYears(testDate, CHECK_VALID_YEARS),
    lab: "",
    place: "",
    inspector: "",
  };
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

function getWarningStatus(dateValue) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(check.getTime())) return "unknown";
  const diffDays = Math.ceil((check.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "invalid";
  if (diffDays <= 60) return "soon";
  return "valid";
}

function getStatusLabel(status) {
  if (status === "valid") return "Geprüft und iO";
  if (status === "soon") return "Bald prüfen";
  if (status === "invalid") return "Dringend Prüfung veranlassen";
  return "Unbekannt";
}

function formatDate(dateValue) {
  if (!dateValue) return "-";
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
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
    inspector: els.inspectorInput.value.trim(),
  };

  const existing = state.devices.findIndex((item) => normalizeTag(item.tagId) === device.tagId);
  if (existing >= 0) {
    state.devices[existing] = device;
  } else {
    state.devices.push(device);
  }

  persist();
  renderList();
  renderWarnings();
  showDevice(device);
  els.form.reset();
}

function savePreparedDevice(showFeedback) {
  const device = buildPreparedDevice();
  if (!device) return null;

  upsertDevice(device);
  persist();
  renderList();
  renderWarnings();
  renderWriterPreview();
  if (showFeedback) els.writerHint.textContent = `${device.tagId} gespeichert.`;
  return device;
}

function buildPreparedDevice() {
  const testDate = els.writerDate.value;
  const device = {
    tagId: normalizeTag(els.writerTag.value),
    part: els.writerPart.value.trim(),
    testDate,
    nextCheck: addYears(testDate, CHECK_VALID_YEARS),
    lab: els.writerLab.value.trim(),
    place: els.writerPlace.value.trim(),
    inspector: els.writerInspector.value.trim(),
  };

  if (!device.tagId || !device.part || !device.testDate || !device.lab || !device.place) {
    els.writerHint.textContent = "Tag-ID, Bauteil, Prüfdatum, Labor und Ort müssen gefüllt sein.";
    return null;
  }
  saveWriterDefaults();
  return device;
}

function upsertDevice(device) {
  const existing = state.devices.findIndex((item) => normalizeTag(item.tagId) === device.tagId);
  if (existing >= 0) {
    state.devices[existing] = device;
  } else {
    state.devices.push(device);
  }
}

function nextPreparedDevice() {
  els.writerTag.value = incrementTag(els.writerTag.value);
  els.writerPart.value = "";
  saveWriterDefaults();
  renderWriterPreview();
  els.writerPart.focus();
}

function addDemoData() {
  state.devices = [...DEFAULT_DEVICES];
  persist();
  renderList();
  renderWarnings();
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
        <button type="button" data-action="assign" data-id="${escapeHtml(device.tagId)}">Tag zuweisen</button>
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
        renderWarnings();
      } else if (button.getAttribute("data-action") === "assign") {
        assignCurrentTag(id);
      } else {
        findAndShow(id, "Anzeige", false);
      }
    });
  });
}

function assignCurrentTag(oldId) {
  const newTag = normalizeTag(els.tagInput.value || state.currentTag);
  if (!newTag) {
    els.nfcHint.textContent = "Erst neue Tag-ID scannen oder eingeben.";
    return;
  }

  const index = state.devices.findIndex((item) => normalizeTag(item.tagId) === normalizeTag(oldId));
  if (index < 0) return;

  state.devices[index] = { ...state.devices[index], tagId: newTag };
  persist();
  renderList();
  renderWarnings();
  findAndShow(newTag, "Anzeige", false);
  els.nfcHint.textContent = `Tag ${newTag} zugewiesen.`;
}

function renderWarnings() {
  const selectedInspector = els.inspectorInput.value.trim().toLowerCase();
  const warnings = state.devices
    .map((device) => ({ device, status: getWarningStatus(device.nextCheck) }))
    .filter((item) => {
      const owner = String(item.device.inspector || "").trim().toLowerCase();
      return !owner || !selectedInspector || owner === selectedInspector;
    })
    .filter((item) => item.status !== "valid")
    .sort((a, b) => String(a.device.nextCheck).localeCompare(String(b.device.nextCheck)));

  els.warningCount.textContent = `${warnings.length} Geräte`;
  els.warningList.innerHTML = "";

  if (!warnings.length) {
    els.warningList.innerHTML = `<p class="hint">Keine fälligen Geräte in den nächsten 2 Monaten.</p>`;
    return;
  }

  for (const item of warnings) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `warning-row ${item.status}`;
    row.innerHTML = `
      <strong>${escapeHtml(item.device.tagId)}</strong>
      <span>${escapeHtml(getStatusLabel(item.status))}</span>
      <small>${escapeHtml(item.device.part)} · ${formatDate(item.device.nextCheck)} · ${escapeHtml(item.device.lab)} · ${escapeHtml(item.device.place)}</small>
      <small>Prüfer: ${escapeHtml(item.device.inspector || "alle")}</small>
    `;
    row.addEventListener("click", () => findAndShow(item.device.tagId, "Anzeige", false));
    els.warningList.appendChild(row);
  }
}

function renderWriterPreview() {
  const tag = normalizeTag(els.writerTag.value);
  const url = tag ? buildDeviceUrl(tag, { testDate: els.writerDate.value }) : "-";
  const nextCheck = addYears(els.writerDate.value, CHECK_VALID_YEARS);
  els.writerPreview.textContent = tag
    ? `${tag} · ${els.writerPart.value || "Bauteil fehlt"} · geprüft: ${formatDate(els.writerDate.value)} · fällig: ${formatDate(nextCheck)} · ${url}`
    : "-";
}

function logWalkCheck(entry) {
  const now = new Date();
  const row = {
    time: now.toISOString(),
    localTime: now.toLocaleString("de-DE"),
    inspector: els.inspectorInput.value.trim(),
    source: entry.source || "Manuell",
    tagId: normalizeTag(entry.tagId),
    status: entry.status || "Unbekannt",
    part: entry.part || "",
    nextCheck: entry.nextCheck || "",
    lab: entry.lab || "",
    place: entry.place || "",
  };

  state.walkLog = [row, ...state.walkLog].slice(0, 500);
  persistWalkLog();
  renderWalkLog();
}

function renderWalkLog() {
  els.walkLogCount.textContent = `${state.walkLog.length} Prüfungen`;
  els.walkLogList.innerHTML = "";

  if (!state.walkLog.length) {
    els.walkLogList.innerHTML = `<p class="hint">Noch kein Rundgang-Protokoll. Scannen oder suchen speichert hier automatisch.</p>`;
    return;
  }

  for (const row of state.walkLog.slice(0, 12)) {
    const item = document.createElement("div");
    item.className = "walklog-row";
    item.innerHTML = `
      <strong>${escapeHtml(row.tagId || "-")}</strong>
      <span>${escapeHtml(row.status || "-")}</span>
      <small>${escapeHtml(row.localTime || "-")} · ${escapeHtml(row.source || "-")} · ${escapeHtml(row.inspector || "Ohne Prüfer")}</small>
      <small>${escapeHtml(row.part || "-")} · ${escapeHtml(row.lab || "-")} · ${escapeHtml(row.place || "-")}</small>
    `;
    els.walkLogList.appendChild(item);
  }
}

function buildWalkLogCsv() {
  const rows = [
    ["Zeit", "Pruefer", "Quelle", "Tag_ID", "Ergebnis", "Bauteil", "NaechstePruefung", "Labor", "Ort"],
    ...state.walkLog.map((row) => [
      row.localTime,
      row.inspector || "",
      row.source,
      row.tagId,
      row.status,
      row.part,
      row.nextCheck ? formatDate(row.nextCheck) : "",
      row.lab,
      row.place,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function csvCell(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function downloadWalkLog() {
  if (!state.walkLog.length) {
    els.nfcHint.textContent = "Noch kein Protokoll vorhanden.";
    return;
  }

  const blob = new Blob([`\uFEFF${buildWalkLogCsv()}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dguv-laborrundgang-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function emailWalkLog() {
  if (!state.walkLog.length) {
    els.nfcHint.textContent = "Noch kein Protokoll vorhanden.";
    return;
  }

  const subject = encodeURIComponent(`DGUV Laborrundgang ${new Date().toLocaleDateString("de-DE")}`);
  const body = encodeURIComponent(buildWalkLogCsv());
  location.href = `mailto:?subject=${subject}&body=${body}`;
}

function clearWalkLog() {
  state.walkLog = [];
  persistWalkLog();
  renderWalkLog();
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
    inspector: String(item.inspector || "").trim(),
  }));
  persist();
  renderList();
  renderWarnings();
  showStart();
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
        inspector: String(record.pruefer || record.inspector || "").trim(),
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
    if (!Array.isArray(parsed) || !parsed.length) return [...DEFAULT_DEVICES];
    const merged = [...parsed];
    for (const demo of DEFAULT_DEVICES) {
      if (!merged.some((item) => normalizeTag(item.tagId) === normalizeTag(demo.tagId))) {
        merged.push(demo);
      }
    }
    return merged;
  } catch {
    return [...DEFAULT_DEVICES];
  }
}

function loadWalkLog() {
  try {
    const raw = localStorage.getItem(WALK_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function pn532Wakeup() {
  await serialWriteBytes([0x55, 0x55, 0x00, 0x00, 0x00]);
  await delay(80);
  await drainSerial();
}

async function pn532FindTarget() {
  const response = await pn532Command([0x4a, 0x01, 0x00]);
  const targetCount = response[2] || 0;
  if (!targetCount) return null;
  return response[3] || 1;
}

async function writeNtagUrl(target, url) {
  const bytes = buildNdefUrlBytes(url);
  const pageBytes = [...bytes];
  while (pageBytes.length % 4 !== 0) pageBytes.push(0x00);

  for (let offset = 0; offset < pageBytes.length; offset += 4) {
    const page = 4 + offset / 4;
    if (page > 39) throw new Error("URL ist zu lang für NTAG213.");
    const chunk = pageBytes.slice(offset, offset + 4);
    await pn532Command([0x40, target, 0xa2, page, ...chunk]);
  }
}

function buildNdefUrlBytes(url) {
  const prefix = "https://";
  const uriCode = url.startsWith(prefix) ? 0x04 : 0x00;
  const uriText = uriCode ? url.slice(prefix.length) : url;
  const uriBytes = [...new TextEncoder().encode(uriText)];
  const record = [
    0xd1,
    0x01,
    uriBytes.length + 1,
    0x55,
    uriCode,
    ...uriBytes,
  ];
  const tlv = [0x03, record.length, ...record, 0xfe];
  if (tlv.length > 144) throw new Error("URL ist zu lang für NTAG213.");
  return tlv;
}

async function pn532Command(command) {
  const frame = buildPn532Frame(command);
  await serialWriteBytes(frame);
  const ack = await serialReadBytes(6, 1200);
  if (!isPn532Ack(ack)) throw new Error("PN532 antwortet nicht.");
  const response = await readPn532Frame(1800);
  if (response[0] !== 0xd5 || response[1] !== command[0] + 1) {
    throw new Error("Unerwartete PN532-Antwort.");
  }
  return response;
}

function buildPn532Frame(command) {
  const data = [0xd4, ...command];
  const length = data.length;
  const lcs = (0x100 - length) & 0xff;
  const dcs = (0x100 - (data.reduce((sum, byte) => sum + byte, 0) & 0xff)) & 0xff;
  return [0x00, 0x00, 0xff, length, lcs, ...data, dcs, 0x00];
}

function isPn532Ack(bytes) {
  return bytes.length >= 6 && bytes.slice(0, 6).join(",") === "0,0,255,0,255,0";
}

async function readPn532Frame(timeoutMs) {
  const bytes = [];
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    bytes.push(...await serialReadAvailable(Math.max(80, end - Date.now())));
    const start = bytes.findIndex((_, index) => bytes[index] === 0x00 && bytes[index + 1] === 0x00 && bytes[index + 2] === 0xff);
    if (start < 0 || bytes.length < start + 6) continue;
    const length = bytes[start + 3];
    const frameEnd = start + 7 + length;
    if (bytes.length >= frameEnd) return bytes.slice(start + 5, start + 5 + length);
  }
  throw new Error("Zeitüberschreitung beim PN532.");
}

async function serialWriteBytes(bytes) {
  await serialWriter.write(new Uint8Array(bytes));
}

async function serialReadBytes(count, timeoutMs) {
  const bytes = [];
  const end = Date.now() + timeoutMs;
  while (bytes.length < count && Date.now() < end) {
    bytes.push(...await serialReadAvailable(Math.max(80, end - Date.now())));
  }
  return bytes.slice(0, count);
}

async function serialReadAvailable(timeoutMs) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ value: new Uint8Array(), done: false }), timeoutMs));
  const result = await Promise.race([serialReader.read(), timeout]);
  return result.value ? [...result.value] : [];
}

async function drainSerial() {
  for (let index = 0; index < 4; index += 1) {
    const bytes = await serialReadAvailable(40);
    if (!bytes.length) return;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadWriterDefaults() {
  try {
    const defaults = JSON.parse(localStorage.getItem(WRITER_KEY) || "{}");
    els.writerInspector.value = defaults.inspector || localStorage.getItem(INSPECTOR_KEY) || "Peschel";
    els.writerDate.value = defaults.testDate || defaults.nextCheck || "";
    els.writerLab.value = defaults.lab || "";
    els.writerPlace.value = defaults.place || "";
    els.writerTag.value = defaults.tagId || "";
    els.writerPart.value = "";
  } catch {
    els.writerInspector.value = localStorage.getItem(INSPECTOR_KEY) || "Peschel";
  }
}

function saveWriterDefaults() {
  localStorage.setItem(
    WRITER_KEY,
    JSON.stringify({
      inspector: els.writerInspector.value.trim(),
      testDate: els.writerDate.value,
      lab: els.writerLab.value.trim(),
      place: els.writerPlace.value.trim(),
      tagId: normalizeTag(els.writerTag.value),
    })
  );
}

function incrementTag(value) {
  const tag = normalizeTag(value);
  const match = tag.match(/^(.*?)(\d+)$/);
  if (!match) return tag;
  const nextNumber = String(Number(match[2]) + 1).padStart(match[2].length, "0");
  return `${match[1]}${nextNumber}`;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.devices));
}

function persistWalkLog() {
  localStorage.setItem(WALK_LOG_KEY, JSON.stringify(state.walkLog));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => registrations.forEach((registration) => registration.unregister()))
    .catch(() => {});
}









