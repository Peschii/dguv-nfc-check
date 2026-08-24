const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const nfcScriptPath = path.join(root, "nfc-pcsc.ps1");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(type.startsWith("application/json") ? JSON.stringify(body, null, 2) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100000) req.destroy(new Error("Body zu gross."));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function isLocalRequest(req) {
  const addr = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function requireLocal(req, res) {
  if (isLocalRequest(req)) return false;
  send(res, 403, { ok: false, error: "NFC-Hardware darf nur lokal auf diesem PC genutzt werden." });
  return true;
}

function runPcscNfc(action, data = "") {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", nfcScriptPath, action];
  if (data) args.push(String(data));
  try {
    const raw = execFileSync("powershell.exe", args, { encoding: "utf8", timeout: 20000 });
    return JSON.parse(raw.trim() || "{}");
  } catch (error) {
    const raw = String(error.stdout || "").trim();
    if (raw) {
      try { return JSON.parse(raw); } catch (_) {}
    }
    return { ok: false, error: String(error.stderr || error.message || error) };
  }
}

function serveStatic(req, res) {
  const cleanUrl = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.join(root, cleanUrl === "/" ? "index.html" : cleanUrl);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return send(res, 204, {});

      if (req.method === "GET" && req.url.split("?")[0] === "/api/nfc/list") {
        if (requireLocal(req, res)) return;
        const result = runPcscNfc("list");
        return send(res, result.ok ? 200 : 500, result);
      }

      if (req.method === "GET" && req.url.split("?")[0] === "/api/nfc/read") {
        if (requireLocal(req, res)) return;
        const result = runPcscNfc("read");
        return send(res, result.ok ? 200 : 500, result);
      }

      if (req.method === "POST" && req.url.split("?")[0] === "/api/nfc/write") {
        if (requireLocal(req, res)) return;
        const body = JSON.parse(await readBody(req) || "{}");
        const payload = String(body.url || body.payload || body.id || "").trim();
        if (!payload) return send(res, 400, { ok: false, error: "Keine NFC-URL uebergeben." });
        const result = runPcscNfc("write", payload);
        return send(res, result.ok ? 200 : 500, result);
      }

      serveStatic(req, res);
    } catch (error) {
      send(res, 500, { ok: false, error: error.message || String(error) });
    }
  })
  .listen(port, host, () => {
    console.log(`DGUV NFC Check: http://${host}:${port}`);
    console.log("Lokale NFC API: /api/nfc/list /api/nfc/read /api/nfc/write");
  });
