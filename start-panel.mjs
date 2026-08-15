import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const SECRET_FILE = path.join(DATA_DIR, ".app-secret");

const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://private.panelcloud.biz.id:7009";
process.env.PUBLIC_SITE_URL = PUBLIC_SITE_URL;
process.env.NEXT_PUBLIC_SITE_URL = PUBLIC_SITE_URL;

function log(message) {
  console.log(`[ASEP BOT] ${message}`);
}

function fail(message) {
  console.error(`[ASEP BOT] ${message}`);
  process.exit(1);
}

function nodeVersionOk() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 13);
}

if (!nodeVersionOk()) {
  fail(`Node.js ${process.versions.node} terdeteksi. Gunakan Node.js 22.13 atau lebih baru pada Startup/Docker Image panel.`);
}

const portCandidates = [
  process.env.SERVER_PORT,
  process.env.PORT,
  process.env.P_SERVER_PORT,
  process.env.PRIMARY_PORT,
  process.env.ALLOCATION_PORT,
].filter(Boolean);

const port = String(portCandidates[0] || "3000").trim();
if (!/^\d+$/.test(port)) fail(`Port panel tidak valid: ${port}`);

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!process.env.APP_SECRET) {
  if (fs.existsSync(SECRET_FILE)) {
    process.env.APP_SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim();
    log("APP_SECRET lokal ditemukan.");
  } else {
    const secret = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    process.env.APP_SECRET = secret;
    log("APP_SECRET dibuat otomatis dan disimpan di data/.app-secret.");
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, PORT: port, HOSTNAME: "0.0.0.0" },
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} keluar dengan kode ${code}`));
    });
  });
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const tailwindPostcss = path.join(ROOT, "node_modules", "@tailwindcss", "postcss");

if (!fs.existsSync(nextBin) || !fs.existsSync(tailwindPostcss)) {
  log("Dependency belum lengkap. Menjalankan npm install otomatis...");
  try {
    await run(npmCommand, ["install", "--include=dev", "--no-audit", "--no-fund"]);
  } catch (error) {
    fail(`npm install gagal: ${error instanceof Error ? error.message : error}`);
  }
}

if (!fs.existsSync(nextBin)) fail("Next.js tidak ditemukan setelah npm install.");

const buildId = path.join(ROOT, ".next", "BUILD_ID");

function newestSourceMtime() {
  const roots = [
    path.join(ROOT, "app"),
    path.join(ROOT, "db"),
    path.join(ROOT, "lib"),
    path.join(ROOT, "public"),
  ];
  const standalone = [
    path.join(ROOT, "package.json"),
    path.join(ROOT, "next.config.ts"),
    path.join(ROOT, "postcss.config.mjs"),
    path.join(ROOT, "tsconfig.json"),
  ];
  let newest = 0;
  const scan = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    newest = Math.max(newest, stat.mtimeMs);
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      scan(path.join(target, entry.name));
    }
  };
  for (const sourceRoot of roots) scan(sourceRoot);
  for (const file of standalone) scan(file);
  return newest;
}

const buildExists = fs.existsSync(buildId);
const buildMtime = buildExists ? fs.statSync(buildId).mtimeMs : 0;
const sourceChanged = buildExists && newestSourceMtime() > buildMtime;
const shouldBuild = !buildExists || process.env.REBUILD === "1" || sourceChanged;

if (shouldBuild) {
  if (sourceChanged) log("Source lebih baru dari build lama. Rebuild otomatis agar UI terbaru tidak tertahan cache .next.");
  else log("Build production belum ada atau rebuild diminta. Menjalankan next build otomatis...");
  try {
    await run(process.execPath, [nextBin, "build"]);
  } catch (error) {
    fail(`Build gagal: ${error instanceof Error ? error.message : error}`);
  }
}

log(`PORT PANEL TERDETEKSI: ${port}`);
log(`Website berjalan di 0.0.0.0:${port}`);
log(`URL publik disetel: ${PUBLIC_SITE_URL}`);
log("Jangan ubah port di source. Jika allocation panel berubah, restart server saja.");

const server = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", port], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: "0.0.0.0" },
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

server.on("error", (error) => fail(`Server gagal dijalankan: ${error.message}`));
server.on("exit", (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code ?? 1);
});
