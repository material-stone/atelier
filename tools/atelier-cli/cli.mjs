#!/usr/bin/env node
// Atelier command line: log in once, then upload web builds through the upload API without the browser.
// No dependencies: Node 18+ (fetch). npm i -g @material-stone/atelier-cli (or npm link in this folder), then: atelier-cli help
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HELP = `Atelier CLI

사용법:
  atelier-cli <명령> [옵션]

명령:
  login                  브라우저에서 관리자 Google 계정으로 승인하면 이 기기에 업로드 키가 저장됨
    --label <이름>       설정 창의 키 목록에 보일 이름 (기본: 컴퓨터 이름)
    --no-browser         브라우저를 열지 않고 주소만 출력
    --with-key           설정 창에서 직접 발급한 키를 붙여 넣어 저장 (브라우저 승인 없이)
    --url <주소>         uploadApi 주소를 바꿔 저장 (보통 필요 없음)
  logout                 이 기기의 키를 서버에서 폐기하고 지움
  upload <build.zip>     웹빌드 ZIP을 올림 (아래 옵션)
  status <gameId>        게임의 빌드 상태 확인
  config                 설정을 어디서 읽는지 확인 (키는 가려서 표시)
  help                   이 도움말

upload — 게임 지정 (둘 중 하나, 둘 다 없으면 새 게임):
  --game <id>            기존 게임 ID
  --title <제목>         같은 제목의 게임이 있으면 그 게임을 업데이트, 없으면 새로 만듦

upload — 게임 정보 (기존 게임에서 생략하면 지금 값 유지, 바꾼 값은 새 빌드가 공개될 때 반영):
  --description <글>     설명 (500자 이하, \\n 줄바꿈 가능)
  --genres <a,b,c>       장르 태그, 쉼표로 구분 (최대 8개)
  --stage <단계>         release(공개) | demo(데모) | prototype(프로토타입). 새 게임에서 생략하면 등급에 맞춰 정함
  --access <등급>        public(누구나) | member(멤버, 매주 30%는 구독자에게) | private(초대)
  --emails <a@b,c@d>     private 게임의 초대 이메일
  --cover <이미지>       JPG/PNG/WebP, 5MB 이하. 새 게임은 필수

upload — 중단했을 때:
  Ctrl+C                 업로드를 취소하고 서버 상태를 되돌림 (새 게임은 삭제, 업데이트는 이전 빌드 유지)
  연결 실패로 멈춤       같은 명령을 다시 실행하면 이어서 올림
  --cancel               같은 명령에 붙이면 멈춘 업로드를 취소하고 되돌림

upload — 기타:
  --no-wait              업로드만 하고 서버 처리 완료를 기다리지 않음
  --dry-run              파일과 설정만 검사하고 아무것도 올리지 않음

설정은 환경변수 > ~/.atelier-cli/config 순서로 읽음:
  ATELIER_UPLOAD_URL     uploadApi 주소 (기본값이 있어 보통 필요 없음)
  ATELIER_UPLOAD_KEY     업로드 키 (CI처럼 로그인할 수 없는 곳에서 사용)
`;

const MAX_ZIP_BYTES = 250 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024; // must be a multiple of 256 KiB
const COVER_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const ACCESS_LEVELS = ["public", "member", "private"];
const STAGES = ["release", "demo", "prototype"];
// Cloud Storage keeps a resumable session for a week; stop resuming a little before that.
const STATE_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;
const HOME_DIR = join(homedir(), ".atelier-cli");
const STATE_DIR = join(HOME_DIR, "state");
// One config for every project on this machine, so they all share the same key.
const CONFIG_PATH = join(HOME_DIR, "config");
const PACKAGE_PATH = join(dirname(fileURLToPath(import.meta.url)), "package.json");
const DEFAULT_URL = "https://asia-northeast3-material-stone-atelier.cloudfunctions.net/uploadApi";
const CONFIG_KEYS = ["ATELIER_UPLOAD_URL", "ATELIER_UPLOAD_KEY"];

/** Aborted on Ctrl+C so in-flight requests stop at once. */
const interrupt = new AbortController();

class UserError extends Error {}

function fail(message, code = 1) {
  console.error(`\n오류: ${message}`);
  process.exit(code);
}

async function readEnvFile(path) {
  const text = await readFile(path, "utf8").catch(() => "");
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

/** Fills missing settings: environment first, then the user config, then the built-in URL. Returns where each came from. */
async function loadConfig() {
  const sources = {};
  for (const key of CONFIG_KEYS) if (process.env[key]) sources[key] = "환경변수";
  const values = await readEnvFile(CONFIG_PATH);
  for (const key of CONFIG_KEYS) {
    if (!process.env[key] && values[key]) {
      process.env[key] = values[key];
      sources[key] = CONFIG_PATH;
    }
  }
  if (!process.env.ATELIER_UPLOAD_URL) {
    process.env.ATELIER_UPLOAD_URL = DEFAULT_URL;
    sources.ATELIER_UPLOAD_URL = "기본값";
  }
  process.env.ATELIER_UPLOAD_URL = process.env.ATELIER_UPLOAD_URL.replace(/\/+$/, "");
  return sources;
}

function maskKey(key) {
  return key ? `${key.slice(0, 4)}…${key.slice(-2)} (${key.length}자)` : "(없음)";
}

/** Saves a key issued in the settings window, read from stdin so it never lands in shell history. */
async function saveIssuedKey(url) {
  const prompt = createInterface({ input: process.stdin });
  try {
    process.stdout.write("설정 창에서 발급한 업로드 키: ");
    const { value } = await prompt[Symbol.asyncIterator]().next();
    const key = (value ?? "").trim();
    if (!key) fail("키를 입력해 주세요.");
    await saveConfig(url, key);
    console.log(`저장했습니다: ${CONFIG_PATH}\n이제 어느 프로젝트에서든 atelier-cli upload를 쓸 수 있습니다.`);
  } finally {
    prompt.close();
  }
}

async function saveConfig(url, key) {
  await mkdir(HOME_DIR, { recursive: true });
  const lines = [...(url === DEFAULT_URL ? [] : [`ATELIER_UPLOAD_URL=${url}`]), ...(key ? [`ATELIER_UPLOAD_KEY=${key}`] : [])];
  await writeFile(CONFIG_PATH, lines.length ? `${lines.join("\n")}\n` : "", { mode: 0o600 });
}

function openBrowser(url) {
  const [command, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(command, args, { detached: true, stdio: "ignore" }).on("error", () => undefined).unref();
  } catch {
    // The URL is printed too, so a missing opener only means one extra click.
  }
}

/**
 * Device-code login: the server hands out a short code, an admin approves it on the site with their
 * Google account, and this machine receives its own key. The key is saved, never printed.
 */
async function login({ label, browser }) {
  const url = process.env.ATELIER_UPLOAD_URL;
  const start = await fetch(`${url}/cli/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: label || `${hostname()} (atelier-cli)` }),
    signal: interrupt.signal,
  });
  const session = await start.json().catch(() => ({}));
  if (!start.ok) throw new UserError(session.error ?? `로그인을 시작하지 못했습니다 (HTTP ${start.status})`);

  console.log(`\n  코드: ${session.userCode}\n`);
  console.log(`브라우저에서 관리자 Google 계정으로 로그인하고, 위 코드와 같은지 확인한 뒤 승인하세요.`);
  console.log(`  ${session.verificationUrl}\n`);
  if (browser) openBrowser(session.verificationUrl);

  const deadline = Date.now() + session.expiresIn * 1000;
  process.on("SIGINT", () => process.exit(130));
  process.stdout.write("승인을 기다리는 중");
  while (Date.now() < deadline) {
    await sleep(session.interval * 1000);
    process.stdout.write(".");
    const response = await fetch(`${url}/cli/sessions/${session.sessionId}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pollToken: session.pollToken }),
      signal: interrupt.signal,
    }).catch(() => null);
    if (!response || response.status === 202 || response.status >= 500) continue;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new UserError(result.error ?? `로그인 실패 (HTTP ${response.status})`);
    await saveConfig(url, result.key);
    console.log(`\n로그인했습니다. 이 기기의 키(${result.label})를 ${CONFIG_PATH}에 저장했습니다.`);
    return;
  }
  throw new UserError("10분 안에 승인되지 않았습니다. atelier-cli login을 다시 실행해 주세요.");
}

/** Revokes this machine's key on the server and removes it from the config. */
async function logout() {
  const config = await readEnvFile(CONFIG_PATH);
  if (!config.ATELIER_UPLOAD_KEY) return console.log("이 기기에 저장된 키가 없습니다.");
  const url = (config.ATELIER_UPLOAD_URL || DEFAULT_URL).replace(/\/+$/, "");
  const response = await fetch(`${url}/keys/self`, { method: "DELETE", headers: { Authorization: `Bearer ${config.ATELIER_UPLOAD_KEY}` } }).catch(() => null);
  await saveConfig(url, null);
  if (response?.ok) console.log("키를 폐기하고 이 기기에서 지웠습니다.");
  else if (response?.status === 401) console.log("이미 폐기된 키라서 이 기기에서만 지웠습니다.");
  else console.log("이 기기에서는 지웠지만 서버에서 폐기하지 못했습니다. 설정 창의 업로드 키에서 직접 폐기해 주세요.");
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
}

function sleep(ms) {
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    interrupt.signal.addEventListener("abort", () => { clearTimeout(timer); done(); }, { once: true });
  });
}

async function api(method, path, body, { signal = interrupt.signal } = {}) {
  const base = process.env.ATELIER_UPLOAD_URL.replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.ATELIER_UPLOAD_KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new UserError(data.error ?? `API 요청 실패 (HTTP ${response.status})`);
  return data;
}

// ---- Saved upload state, so a rerun of the same command resumes instead of starting over ----

async function stateKey(body, zipPath, coverPath) {
  const fingerprint = async (path) => {
    if (!path) return null;
    const info = await stat(path);
    return { path: resolve(path), size: info.size, mtime: info.mtimeMs };
  };
  const source = JSON.stringify({ url: process.env.ATELIER_UPLOAD_URL, body, zip: await fingerprint(zipPath), cover: await fingerprint(coverPath) });
  return createHash("sha256").update(source).digest("hex").slice(0, 32);
}

const statePath = (key) => join(STATE_DIR, `${key}.json`);

async function loadState(key) {
  const text = await readFile(statePath(key), "utf8").catch(() => null);
  if (!text) return null;
  const state = JSON.parse(text);
  if (Date.now() - state.savedAt > STATE_MAX_AGE_MS) {
    await clearState(key);
    return null;
  }
  return state;
}

async function saveState(key, state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(statePath(key), JSON.stringify({ ...state, savedAt: state.savedAt ?? Date.now() }, null, 2));
}

async function clearState(key) {
  await rm(statePath(key), { force: true });
}

/** Whether the server still waits for this version's ZIP (it may have published or been replaced since). */
function stillWaiting(status, versionId) {
  return status.pendingVersionId === versionId || (status.buildVersionId === versionId && status.buildStatus === "processing");
}

// ---- Resumable upload ----

/** Bytes Cloud Storage already has for a resumable session, or null once the upload is complete. */
async function committedBytes(sessionUrl, total) {
  const response = await fetch(sessionUrl, { method: "PUT", headers: { "Content-Range": `bytes */${total}` }, signal: interrupt.signal });
  if (response.status === 200 || response.status === 201) return null;
  if (response.status !== 308) throw new Error(`업로드 세션 확인 실패 (HTTP ${response.status})`);
  const range = response.headers.get("range");
  return range ? Number(range.split("-")[1]) + 1 : 0;
}

/** Uploads in chunks; a dropped connection resumes from what the server already has. */
async function uploadResumable(sessionUrl, filePath, total, label) {
  let offset = (await committedBytes(sessionUrl, total)) ?? total;
  if (offset > 0 && offset < total) console.log(`  ${label}: ${formatBytes(offset)}부터 이어서 올립니다.`);
  const handle = await open(filePath, "r");
  try {
    let failures = 0;
    while (offset < total) {
      const length = Math.min(CHUNK_BYTES, total - offset);
      const chunk = Buffer.alloc(length);
      await handle.read(chunk, 0, length, offset);
      try {
        const response = await fetch(sessionUrl, {
          method: "PUT",
          headers: { "Content-Length": String(length), "Content-Range": `bytes ${offset}-${offset + length - 1}/${total}` },
          body: chunk,
          signal: interrupt.signal,
        });
        if (response.status === 200 || response.status === 201) offset = total;
        else if (response.status === 308) {
          const range = response.headers.get("range");
          offset = range ? Number(range.split("-")[1]) + 1 : 0;
        } else if (response.status === 404 || response.status === 410) {
          throw new UserError("업로드 세션이 만료되었습니다. --cancel로 정리한 뒤 다시 올려 주세요.");
        } else throw new Error(`HTTP ${response.status} ${await response.text().catch(() => "")}`.trim());
        failures = 0;
      } catch (error) {
        if (interrupt.signal.aborted || error instanceof UserError) throw error;
        failures += 1;
        if (failures > 5) throw new Error(`${label} 업로드 실패: ${error.message}`);
        const wait = 2 ** failures * 1000;
        console.warn(`\n  연결 문제(${error.message}), ${wait / 1000}초 뒤 이어서 올립니다…`);
        await sleep(wait);
        if (interrupt.signal.aborted) throw error;
        const committed = await committedBytes(sessionUrl, total).catch(() => offset);
        offset = committed === null ? total : committed;
      }
      process.stdout.write(`\r  ${label} ${Math.floor((offset / total) * 100)}% (${formatBytes(offset)} / ${formatBytes(total)})`);
    }
    process.stdout.write("\n");
  } finally {
    await handle.close();
  }
}

/** Ends the upload sessions and asks the server to undo the draft. Never throws. */
async function cancelUpload(key, state) {
  // A ZIP that fully reached Storage is already being processed; cancelling now would race it.
  const zipComplete = state.zipDone || (await committedBytes(state.buildUploadUrl, state.zipSize).catch(() => 0)) === null;
  if (zipComplete) {
    await clearState(key);
    return "ZIP은 이미 다 올라가 서버가 처리 중입니다. 취소하지 않았습니다.";
  }
  const sessions = [state.buildUploadUrl, state.coverDone ? null : state.coverUploadUrl].filter(Boolean);
  await Promise.all(sessions.map((url) => fetch(url, { method: "DELETE" }).catch(() => undefined)));
  try {
    const { result } = await api("DELETE", `/games/${state.gameId}/versions/${state.versionId}`, undefined, { signal: AbortSignal.timeout(30_000) });
    await clearState(key);
    return {
      "game-deleted": "새로 만들던 게임을 지웠습니다.",
      "update-cancelled": "업데이트를 취소했습니다. 이전 빌드가 계속 공개됩니다.",
      "marked-failed": "이번 빌드를 실패로 표시했습니다.",
      "not-pending": "서버에 되돌릴 것이 없었습니다.",
    }[result] ?? "취소했습니다.";
  } catch (error) {
    return `서버 정리에 실패했습니다(${error.message}). 같은 명령에 --cancel을 붙여 다시 시도해 주세요.`;
  }
}

/** Polls until processBuildZip has published or rejected this version. */
async function waitForBuild(gameId, versionId) {
  const deadline = Date.now() + 12 * 60 * 1000;
  process.stdout.write("  서버에서 ZIP 검사·압축 해제 중");
  while (Date.now() < deadline) {
    await sleep(5000);
    if (interrupt.signal.aborted) throw new UserError("기다리기를 멈췄습니다. 서버 처리는 계속됩니다.");
    process.stdout.write(".");
    const status = await api("GET", `/games/${gameId}`).catch(() => null);
    if (!status || stillWaiting(status, versionId)) continue;
    process.stdout.write("\n");
    if (status.buildVersionId === versionId && status.buildStatus === "published") return status;
    throw new UserError(`빌드 처리 실패: ${status.buildError ?? "알 수 없는 오류 (이전 빌드는 그대로 공개 중일 수 있습니다)"}`);
  }
  throw new UserError("12분 안에 처리가 끝나지 않았습니다. 나중에 atelier-cli status <gameId>로 확인해 주세요.");
}

const COMMAND_OPTIONS = {
  login: ["label", "no-browser", "with-key", "url"],
  logout: [],
  upload: ["zip", "game", "title", "description", "genres", "access", "emails", "cover", "cancel", "no-wait", "dry-run"],
  status: [],
  config: [],
};

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      label: { type: "string" },
      "no-browser": { type: "boolean", default: false },
      "with-key": { type: "boolean", default: false },
      url: { type: "string" },
      zip: { type: "string" },
      game: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      genres: { type: "string" },
      access: { type: "string" },
      stage: { type: "string" },
      emails: { type: "string" },
      cover: { type: "string" },
      cancel: { type: "boolean", default: false },
      "no-wait": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.version || command === "version") return console.log(JSON.parse(await readFile(PACKAGE_PATH, "utf8")).version);
  if (values.help || !command || command === "help") return console.log(HELP);
  if (!COMMAND_OPTIONS[command]) fail(`알 수 없는 명령: ${command}. atelier-cli help로 사용법을 확인하세요.`);
  // Catch options given to the wrong command (for example `atelier-cli login --zip x`) instead of ignoring them.
  const allowed = new Set(COMMAND_OPTIONS[command]);
  const misplaced = Object.keys(values).filter((name) => !allowed.has(name) && values[name] !== false && name !== "help" && name !== "version");
  if (misplaced.length) fail(`${command}에는 --${misplaced.join(", --")} 옵션을 쓸 수 없습니다. atelier-cli help로 확인하세요.`);
  const maxArgs = { upload: 1, status: 1 }[command] ?? 0;
  if (args.length > maxArgs) fail(`필요 없는 인자: ${args.slice(maxArgs).join(" ")}`);

  if (values.url) process.env.ATELIER_UPLOAD_URL = values.url;
  const sources = await loadConfig();
  if (command === "login") {
    return values["with-key"] ? saveIssuedKey(process.env.ATELIER_UPLOAD_URL) : login({ label: values.label, browser: !values["no-browser"] });
  }
  if (command === "logout") return logout();
  if (command === "config") {
    console.log(`URL: ${process.env.ATELIER_UPLOAD_URL}  ← ${sources.ATELIER_UPLOAD_URL}`);
    console.log(`키:  ${maskKey(process.env.ATELIER_UPLOAD_KEY)}  ← ${sources.ATELIER_UPLOAD_KEY ?? "-"}`);
    return;
  }

  const requireKey = () => {
    if (!process.env.ATELIER_UPLOAD_KEY) fail("이 기기에 업로드 키가 없습니다. atelier-cli login으로 로그인해 주세요.");
  };
  if (command === "status") {
    if (!args[0]) fail("게임 ID가 필요합니다: atelier-cli status <gameId>");
    requireKey();
    return console.log(JSON.stringify(await api("GET", `/games/${args[0]}`), null, 2));
  }
  return upload(args[0] ?? values.zip, values, requireKey);
}

async function upload(zipPath, values, requireKey) {
  if (!zipPath) fail("ZIP 파일이 필요합니다: atelier-cli upload <build.zip>");
  if (!values["dry-run"]) requireKey();
  const zipSize = (await stat(zipPath).catch(() => fail(`ZIP 파일을 찾을 수 없습니다: ${zipPath}`))).size;
  if (extname(zipPath).toLowerCase() !== ".zip") fail(".zip 파일을 지정해 주세요.");
  if (zipSize > MAX_ZIP_BYTES) fail(`ZIP은 250MiB 이하만 올릴 수 있습니다. (현재 ${formatBytes(zipSize)})`);

  let cover = null;
  if (values.cover) {
    const contentType = COVER_TYPES[extname(values.cover).toLowerCase()];
    if (!contentType) fail("대표 이미지는 JPG, PNG, WebP만 올릴 수 있습니다.");
    const size = (await stat(values.cover).catch(() => fail(`이미지를 찾을 수 없습니다: ${values.cover}`))).size;
    if (size > MAX_COVER_BYTES) fail(`대표 이미지는 5MB 이하만 올릴 수 있습니다. (현재 ${formatBytes(size)})`);
    cover = { size, contentType };
  }
  if (values.access === "login") fail("login 등급은 없어졌습니다. 데모는 --stage demo --access public으로 올려 주세요.");
  if (values.access === "subscriber") fail("subscriber 등급은 없어졌습니다. 프로토타입은 --access member로 올리면 매주 일부가 구독자에게 열립니다.");
  if (values.access && !ACCESS_LEVELS.includes(values.access)) fail(`--access는 ${ACCESS_LEVELS.join(" | ")} 중 하나입니다.`);
  if (values.stage && !STAGES.includes(values.stage)) fail(`--stage는 ${STAGES.join(" | ")} 중 하나입니다.`);

  const body = { build: { size: zipSize, contentType: "application/zip" } };
  if (cover) body.cover = cover;
  if (values.game) body.gameId = values.game;
  if (values.title) body.title = values.title;
  if (values.description !== undefined) body.description = values.description.replace(/\\n/g, "\n");
  if (values.genres !== undefined) body.genres = values.genres.split(",").map((genre) => genre.trim()).filter(Boolean).slice(0, 8);
  if (values.access) body.accessLevel = values.access;
  if (values.stage) body.stage = values.stage;
  if (values.emails !== undefined) body.allowedEmails = values.emails.split(/[,\s]+/).filter(Boolean);

  console.log(`ZIP: ${basename(zipPath)} (${formatBytes(zipSize)})${cover ? `, 표지: ${basename(values.cover)}` : ""}`);
  if (values["dry-run"]) {
    console.log("dry-run: 요청 본문만 출력하고 끝냅니다.");
    return console.log(JSON.stringify(body, null, 2));
  }

  const key = await stateKey(body, zipPath, values.cover);
  let state = await loadState(key);

  if (values.cancel) {
    if (!state) return console.log("이 명령으로 멈춰 있는 업로드가 없습니다.");
    return console.log(await cancelUpload(key, state));
  }

  if (state) {
    const status = await api("GET", `/games/${state.gameId}`).catch(() => null);
    if (status && stillWaiting(status, state.versionId)) {
      console.log(`멈췄던 업로드를 이어서 올립니다: ${state.title} (gameId ${state.gameId})`);
    } else {
      await clearState(key);
      state = null;
    }
  }
  if (!state) {
    const draft = await api("POST", "/games", body);
    state = { ...draft, zipSize, coverSize: cover?.size ?? 0, zipDone: false, coverDone: !draft.coverUploadUrl };
    await saveState(key, state);
    console.log(`${draft.created ? "새 게임" : "기존 게임 업데이트"}: ${draft.title} (gameId ${draft.gameId}, version ${draft.versionId})`);
    if (!draft.created) console.log("  바꾼 게임 정보는 새 빌드가 공개될 때 함께 반영됩니다.");
  }

  // Ctrl+C: stop requests, then undo the draft so nothing is left half-made.
  let cancelling = false;
  process.on("SIGINT", async () => {
    if (cancelling) process.exit(130);
    cancelling = true;
    interrupt.abort();
    if (state.zipDone) return; // the build is already processing; main() reports and exits
    console.log("\n중단 요청. 업로드를 취소하고 서버 상태를 되돌리는 중… (한 번 더 누르면 바로 종료)");
    console.log(await cancelUpload(key, state));
    process.exit(130);
  });

  const uploadCover = async () => {
    if (state.coverDone) return;
    await uploadResumable(state.coverUploadUrl, values.cover, state.coverSize, "표지");
    state.coverDone = true;
    await saveState(key, state);
  };
  const uploadZip = async () => {
    if (state.zipDone) return;
    await uploadResumable(state.buildUploadUrl, zipPath, state.zipSize, "ZIP");
    state.zipDone = true;
    await saveState(key, state);
  };

  try {
    if (state.created) {
      // A new game publishes as soon as its ZIP lands, so its cover must be there first.
      await uploadCover();
      await uploadZip();
    } else {
      // An update keeps the old cover until its ZIP is safely up, so a stopped upload changes nothing.
      await uploadZip();
      await uploadCover();
    }
  } catch (error) {
    if (interrupt.signal.aborted) {
      if (!state.zipDone) return new Promise(() => {}); // the SIGINT handler cleans up and exits
      await clearState(key);
      throw new UserError("중단했습니다. ZIP은 이미 올라가 서버가 처리하고, 표지는 바뀌지 않았습니다.");
    }
    if (error instanceof UserError) throw error;
    throw new UserError(`${error.message}\n같은 명령을 다시 실행하면 이어서 올립니다. 그만두려면 같은 명령에 --cancel을 붙여 실행하세요.`);
  }
  await clearState(key);

  if (values["no-wait"]) return console.log(`업로드 완료. 처리 상태: atelier-cli status ${state.gameId}`);
  await waitForBuild(state.gameId, state.versionId);
  console.log(`공개 완료: ${state.title} (gameId ${state.gameId})`);
}

main().catch((error) => fail(error.message, interrupt.signal.aborted ? 130 : 1));
