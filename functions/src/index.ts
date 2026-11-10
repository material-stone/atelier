import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type DocumentData, type DocumentReference, type DocumentSnapshot, type QuerySnapshot } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import mime from "mime-types";
import unzipper from "unzipper";
import { type AccessLevel, isAccessLevel, normalizeEmailList, weeklyRotationIds } from "./access.js";
import { bearerToken, hashSecret, keyPreview, newApiKey, newPollToken, newUserCode, normalizeUserCode, sameDigest } from "./apiKey.js";
import { DIRECT_ASSET_CACHE_CONTROL, isDirectAsset, signedUrlWindow } from "./delivery.js";
import { monthKeyBefore, pageMonthKey } from "./month.js";

if (!getApps().length) initializeApp();

const db = getFirestore();
// Game files live in a US bucket (GAME_STORAGE_BUCKET): Cloud Storage's no-cost quota excludes Seoul.
const GAME_STORAGE_BUCKET = defineString("GAME_STORAGE_BUCKET");
const bucket = getStorage().bucket(process.env.GAME_STORAGE_BUCKET);
const YOUTUBE_CHANNEL_ID = defineString("YOUTUBE_CHANNEL_ID", { default: "" });
const PAGES_ORIGIN = defineString("PAGES_ORIGIN", { default: "https://material-stone-games.github.io" });
const FUNCTIONS_BASE_URL = defineString("FUNCTIONS_BASE_URL", { default: "" });
const PLAY_SESSION_SECRET = defineSecret("PLAY_SESSION_SECRET");
// The site's own address (with its base path), for links the CLI login opens.
const SITE_URL = defineString("SITE_URL", { default: "https://material-stone-games.github.io/atelier" });

const MAX_ZIP_BYTES = 250 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024;
const MAX_EXTRACTED_FILES = 20_000;
const MAX_DESCRIPTION_LENGTH = 500;

type TargetType = "post" | "game";

function requireUser(request: CallableRequest<unknown>) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Google 로그인이 필요합니다.");
  return request.auth;
}

function requireAdmin(request: CallableRequest<unknown>) {
  const auth = requireUser(request);
  if (auth.token.admin !== true) throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  return auth;
}

// Posts and comments are public, so never fall back to the account's email.
function publicAuthorName(auth: CallableRequest<unknown>["auth"] & {}): string {
  const name = typeof auth.token.name === "string" ? auth.token.name.trim() : "";
  return name.slice(0, 40) || "visitor";
}

const RATE_LIMITS = {
  post: { minIntervalMs: 30_000, perHour: 10 },
  comment: { minIntervalMs: 5_000, perHour: 60 },
  like: { minIntervalMs: 300, perHour: 300 },
} as const;

/** Per-user throttle stored in rateLimits/{uid}; the collection has no client rules, so only Functions can touch it. */
async function enforceRateLimit(auth: CallableRequest<unknown>["auth"] & {}, action: keyof typeof RATE_LIMITS): Promise<void> {
  if (auth.token.admin === true) return;
  const { minIntervalMs, perHour } = RATE_LIMITS[action];
  const ref = db.doc(`rateLimits/${auth.uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();
    const entry = snapshot.get(action) as { last?: number; windowStart?: number; count?: number } | undefined;
    const last = Number(entry?.last ?? 0);
    const inWindow = now - Number(entry?.windowStart ?? 0) < 60 * 60 * 1000;
    const count = inWindow ? Number(entry?.count ?? 0) : 0;
    if (now - last < minIntervalMs || count >= perHour) {
      throw new HttpsError("resource-exhausted", "너무 자주 요청했습니다. 잠시 후 다시 시도해 주세요.");
    }
    transaction.set(ref, { [action]: { last: now, windowStart: inWindow ? Number(entry?.windowStart) : now, count: count + 1 } }, { merge: true });
  });
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function secretValue(): string {
  const secret = PLAY_SESSION_SECRET.value() || process.env.PLAY_SESSION_SECRET || "";
  if (secret) return secret;
  // A known fallback would let anyone mint play tokens, so only the emulator may use it.
  if (process.env.FUNCTIONS_EMULATOR === "true") return "local-development-secret";
  throw new HttpsError("internal", "플레이 세션 설정이 누락되었습니다.");
}

function createSessionToken(payload: { gameId: string; versionId: string; uid: string | null; level: AccessLevel; expiresAt: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secretValue()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function readSessionToken(value: string): { gameId: string; versionId: string; uid: string | null; level: AccessLevel; expiresAt: number } | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secretValue()).update(encoded).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { gameId: string; versionId: string; uid: string | null; level: AccessLevel; expiresAt: number };
    if (!payload.gameId || !payload.versionId || !payload.expiresAt || payload.expiresAt < Date.now() || !isAccessLevel(payload.level)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isActiveUntil(value: unknown): boolean {
  return value instanceof Timestamp && value.toMillis() > Date.now();
}

async function userStatus(uid: string): Promise<{ subscriber: boolean; member: boolean }> {
  const snapshot = await db.doc(`users/${uid}`).get();
  return { subscriber: isActiveUntil(snapshot.get("youtubeVerifiedUntil")), member: isActiveUntil(snapshot.get("memberUntil")) };
}

async function inWeeklyRotation(gameId: string): Promise<boolean> {
  const snapshot = await db.collection("games").where("buildStatus", "==", "published").where("accessLevel", "==", "subscriber").select().get();
  return weeklyRotationIds(snapshot.docs.map((doc) => doc.id)).has(gameId);
}

/** Verified, lowercase email of the caller, or null when the account has none. */
function verifiedEmail(auth: CallableRequest<unknown>["auth"]): string | null {
  const email = auth?.token.email;
  return typeof email === "string" && auth?.token.email_verified === true ? email.toLowerCase() : null;
}

// Private-game allowlists live apart from games/{id} so invitees never see each other's addresses.
function allowlistRef(gameId: string) {
  return db.doc(`gameAllowlists/${gameId}`);
}

async function onAllowlist(gameId: string, auth: CallableRequest<unknown>["auth"]): Promise<boolean> {
  const email = verifiedEmail(auth);
  if (!email) return false;
  const emails = (await allowlistRef(gameId).get()).get("emails");
  return Array.isArray(emails) && emails.includes(email);
}

/** Whether the caller may know a game exists; private games stay hidden from everyone off the list. */
async function canSeeGame(game: DocumentSnapshot<DocumentData>, auth: CallableRequest<unknown>["auth"]): Promise<boolean> {
  if (game.get("accessLevel") !== "private" || auth?.token.admin === true) return true;
  return onAllowlist(game.id, auth);
}

async function canPlay(game: DocumentSnapshot<DocumentData>, request: CallableRequest<unknown>): Promise<boolean> {
  const level = game.get("accessLevel") as AccessLevel;
  if (level === "public") return true;
  if (level === "private") return request.auth ? canSeeGame(game, request.auth) : false;
  if (level === "subscriber" && (await inWeeklyRotation(game.id))) return true;
  if (!request.auth) return false;
  if (request.auth.token.admin === true || level === "login") return true;
  const status = await userStatus(request.auth.uid);
  return level === "member" ? status.member : status.subscriber || status.member;
}

function readGameMeta(data: Record<string, unknown>) {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const genres = Array.isArray(data.genres) ? data.genres.filter((genre): genre is string => typeof genre === "string").map((genre) => genre.trim()).filter(Boolean).slice(0, 8) : [];
  const accessLevel = isAccessLevel(data.accessLevel) ? data.accessLevel : null;
  if (!title || title.length > 80 || !accessLevel) throw new HttpsError("invalid-argument", "게임 제목과 접근 등급을 확인해 주세요.");
  if (description.length > MAX_DESCRIPTION_LENGTH) throw new HttpsError("invalid-argument", `설명은 ${MAX_DESCRIPTION_LENGTH}자 이하로 작성해 주세요.`);
  return { title, titleKey: normalizeTitle(title), description, genres, accessLevel };
}

function readAllowedEmails(data: Record<string, unknown>, accessLevel: AccessLevel): string[] | null {
  if (accessLevel !== "private") return null;
  const emails = normalizeEmailList(data.allowedEmails);
  if (!emails) throw new HttpsError("invalid-argument", "공개할 이메일 목록을 확인해 주세요. (최대 100개)");
  return emails;
}

/** Keeps gameAllowlists/{id} in step with the game: written for private games, removed otherwise. */
async function saveAllowlist(gameId: string, emails: string[] | null): Promise<void> {
  if (emails) await allowlistRef(gameId).set({ emails, updatedAt: FieldValue.serverTimestamp() });
  else await allowlistRef(gameId).delete();
}

export const verifyYoutubeSubscription = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 2 }, async (request) => {
  const auth = requireUser(request);
  const accessToken = typeof request.data?.youtubeAccessToken === "string" ? request.data.youtubeAccessToken : "";
  const channelId = YOUTUBE_CHANNEL_ID.value();
  if (!accessToken || !channelId) throw new HttpsError("failed-precondition", "YouTube 채널 ID 또는 권한 동의가 설정되지 않았습니다.");

  const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("forChannelId", channelId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new HttpsError("permission-denied", "YouTube 구독 정보를 확인하지 못했습니다.");
  const data = (await response.json()) as { items?: unknown[] };
  if (!data.items?.length) throw new HttpsError("permission-denied", "Material Stone YouTube 채널 구독을 확인하지 못했습니다.");

  const verifiedUntil = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  await db.doc(`users/${auth.uid}`).set({ youtubeVerifiedUntil: verifiedUntil, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { verifiedUntil: verifiedUntil.toDate().toISOString() };
});

/**
 * Game info changes sent with an update of a published game, held until its build publishes.
 * Kept apart from games/{id} because that document is public and may carry invitee emails.
 * The collection has no client rules, so only Functions can read it.
 */
function pendingUpdateRef(versionId: string) {
  return db.doc(`pendingGameUpdates/${versionId}`);
}

/** Applies held game info for a just-published update, in the same order as a direct edit. */
async function publishUpdate(gameRef: DocumentReference<DocumentData>,versionId: string, buildFields: Record<string, unknown>): Promise<void> {
  const pending = await pendingUpdateRef(versionId).get();
  const meta = pending.exists ? (pending.get("meta") as Record<string, unknown>) : null;
  const allowedEmails = pending.exists ? (pending.get("allowedEmails") as string[] | null) : null;
  // Write the allowlist before the game turns private, and drop it only after the game has left private.
  if (meta && allowedEmails) await saveAllowlist(gameRef.id, allowedEmails);
  await gameRef.update({ ...(meta ?? {}), ...buildFields });
  if (meta && !allowedEmails) await saveAllowlist(gameRef.id, null);
  if (pending.exists) await pending.ref.delete();
}

/** The game a draft targets:the given id when it exists, otherwise the game with the same title. */
async function findDraftTarget(existingGameId: unknown, titleKey: string | null): Promise<DocumentSnapshot<DocumentData> | null> {
  if (typeof existingGameId === "string" && existingGameId) {
    const snapshot = await db.doc(`games/${existingGameId}`).get();
    if (snapshot.exists) return snapshot;
  }
  if (!titleKey) return null;
  const match = await db.collection("games").where("titleKey", "==", titleKey).limit(1).get();
  return match.docs[0] ?? null;
}

/**
 * Points a game at a new build version and returns where its ZIP and cover go.
 * Shared by the web upload room and the upload API; processBuildZip takes it from there.
 * `uploader` only namespaces the incoming path, the processor ignores it.
 */
async function prepareGameDraft(
  meta: ReturnType<typeof readGameMeta>,
  allowedEmails: string[] | null,
  existing: DocumentSnapshot<DocumentData> | null,
  uploader: string,
) {
  const gameRef = existing?.ref ?? db.collection("games").doc();
  const versionId = randomUUID();
  const gameId = gameRef.id;
  const buildPath = `incoming-builds/${uploader}/${gameId}/${versionId}.zip`;
  const coverPath = `game-covers/${gameId}/cover`;
  if (existing?.exists && existing.get("buildStatus") === "published") {
    // Keep the current build and its title, description and access playable as they are until the
    // new build publishes; processBuildZip applies the held changes then, and drops them on failure.
    const previous = existing.get("pendingVersionId");
    if (typeof previous === "string") await pendingUpdateRef(previous).delete();
    await pendingUpdateRef(versionId).set({ gameId, meta, allowedEmails, createdAt: FieldValue.serverTimestamp() });
    await gameRef.update({ pendingVersionId: versionId, coverPath, buildError: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return { gameId, versionId, buildPath, coverPath, created: false };
  }
  const payload: Record<string, unknown> = { ...meta, coverPath, buildError: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() };
  // Not public yet, so the new title and description can show right away.
  payload.buildVersionId = versionId;
  payload.buildStatus = "processing";
  payload.buildRoot = `game-builds/${gameId}/${versionId}`;
  payload.pendingVersionId = FieldValue.delete();
  if (!existing?.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.likeCount = 0;
    // Lets a cancelled first upload remove the game it created, and nothing older.
    payload.createdByVersionId = versionId;
  }
  // Write the allowlist first so a game never turns private before its invitees are on file.
  if (allowedEmails) await saveAllowlist(gameId, allowedEmails);
  await gameRef.set(payload, { merge: true });
  if (!allowedEmails) await saveAllowlist(gameId, null);
  return { gameId, versionId, buildPath, coverPath, created: !existing?.exists };
}

export const createOrUpdateGameDraft = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 2 }, async (request) => {
  const auth = requireAdmin(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const meta = readGameMeta(data);
  const allowedEmails = readAllowedEmails(data, meta.accessLevel);
  const existing = await findDraftTarget(data.existingGameId, meta.titleKey);
  const { gameId, buildPath, coverPath } = await prepareGameDraft(meta, allowedEmails, existing, auth.uid);
  return { gameId, buildPath, coverPath };
});

// ---- Upload API: the same pipeline as the upload room, reached with an API key instead of a browser. ----

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function readFileSpec(value: unknown, label: string, maxBytes: number): { size: number; contentType: string } | null {
  if (value === undefined || value === null) return null;
  const spec = value as { size?: unknown; contentType?: unknown };
  const size = Number(spec.size);
  const contentType = typeof spec.contentType === "string" ? spec.contentType : "";
  if (!Number.isInteger(size) || size <= 0) throw new ApiError(400, `${label} 크기를 확인해 주세요.`);
  if (size > maxBytes) throw new ApiError(413, `${label}은(는) ${Math.floor(maxBytes / 1024 / 1024)}MiB 이하만 올릴 수 있습니다.`);
  return { size, contentType };
}

/**
 * Fills fields the caller left out from the existing game, so a build-only update keeps
 * the title, description, genres, access level and invitees exactly as they are.
 */
async function mergedGameInput(body: Record<string, unknown>, existing: DocumentSnapshot<DocumentData> | null): Promise<Record<string, unknown>> {
  if (!existing?.exists) return body;
  const merged: Record<string, unknown> = {
    title: existing.get("title"),
    description: existing.get("description") ?? "",
    genres: existing.get("genres") ?? [],
    accessLevel: existing.get("accessLevel"),
  };
  for (const key of ["title", "description", "genres", "accessLevel", "allowedEmails"]) {
    if (body[key] !== undefined) merged[key] = body[key];
  }
  if (merged.allowedEmails === undefined && merged.accessLevel === "private") {
    merged.allowedEmails = (await allowlistRef(existing.id).get()).get("emails") ?? [];
  }
  return merged;
}

/** A resumable upload session URI: the client can PUT the file straight to Cloud Storage, in chunks, without credentials. */
async function uploadSession(path: string, contentType: string): Promise<string> {
  const metadata: Record<string, unknown> = { contentType };
  // Firebase download URLs (used for covers) need a token on the object.
  if (path.startsWith("game-covers/")) metadata.metadata = { firebaseStorageDownloadTokens: randomUUID() };
  const [uri] = await bucket.file(path).createResumableUpload({ metadata });
  return uri;
}

async function createApiDraft(body: Record<string, unknown>) {
  const build = readFileSpec(body.build, "ZIP", MAX_ZIP_BYTES);
  if (!build) throw new ApiError(400, "build.size가 필요합니다.");
  const cover = readFileSpec(body.cover, "대표 이미지", MAX_COVER_BYTES);
  if (cover && !COVER_TYPES.has(cover.contentType)) throw new ApiError(400, "대표 이미지는 JPG, PNG, WebP만 올릴 수 있습니다.");

  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const titleKey = typeof body.title === "string" ? normalizeTitle(body.title) : null;
  const existing = await findDraftTarget(gameId, titleKey);
  if (gameId && !existing) throw new ApiError(404, "게임을 찾을 수 없습니다.");
  if (!existing && !cover) throw new ApiError(400, "새 게임은 대표 이미지가 필요합니다.");

  let meta: ReturnType<typeof readGameMeta>;
  let allowedEmails: string[] | null;
  try {
    const input = await mergedGameInput(body, existing);
    meta = readGameMeta(input);
    allowedEmails = readAllowedEmails(input, meta.accessLevel);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "게임 정보를 확인해 주세요.");
  }
  if (existing) {
    const duplicate = await db.collection("games").where("titleKey", "==", meta.titleKey).limit(2).get();
    if (duplicate.docs.some((doc) => doc.id !== existing.id)) throw new ApiError(409, "같은 제목의 게임이 이미 있습니다.");
  }

  const draft = await prepareGameDraft(meta, allowedEmails, existing, "upload-api");
  return {
    gameId: draft.gameId,
    versionId: draft.versionId,
    created: draft.created,
    title: meta.title,
    buildUploadUrl: await uploadSession(draft.buildPath, "application/zip"),
    coverUploadUrl: cover ? await uploadSession(draft.coverPath, cover.contentType) : null,
  };
}

/**
 * Undoes a draft whose ZIP never finished uploading, so an interrupted upload leaves no
 * game stuck in "processing". A version that already published or moved on is left alone.
 */
async function cancelApiDraft(gameId: string, versionId: string): Promise<{ result: "update-cancelled" | "game-deleted" | "marked-failed" | "not-pending" }> {
  const gameRef = db.doc(`games/${gameId}`);
  const game = await gameRef.get();
  if (!game.exists) return { result: "not-pending" };
  await bucket.file(`incoming-builds/upload-api/${gameId}/${versionId}.zip`).delete({ ignoreNotFound: true });
  if (game.get("pendingVersionId") === versionId) {
    // The previous build and game info are still live; only the pending marker and held changes go.
    await pendingUpdateRef(versionId).delete();
    await gameRef.update({ pendingVersionId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return { result: "update-cancelled" };
  }
  if (game.get("buildVersionId") !== versionId || game.get("buildStatus") !== "processing") return { result: "not-pending" };
  if (game.get("createdByVersionId") === versionId) {
    // Never published, so nobody could have liked or commented on it.
    await bucket.file(`game-covers/${gameId}/cover`).delete({ ignoreNotFound: true });
    await saveAllowlist(gameId, null);
    await gameRef.delete();
    return { result: "game-deleted" };
  }
  await gameRef.update({ buildStatus: "failed", buildError: "업로드가 취소되었습니다.", updatedAt: FieldValue.serverTimestamp() });
  return { result: "marked-failed" };
}

async function apiGameStatus(gameId: string) {
  const game = await db.doc(`games/${gameId}`).get();
  if (!game.exists) throw new ApiError(404, "게임을 찾을 수 없습니다.");
  return {
    gameId,
    title: game.get("title") ?? "",
    accessLevel: game.get("accessLevel") ?? null,
    buildStatus: game.get("buildStatus") ?? null,
    buildVersionId: game.get("buildVersionId") ?? null,
    pendingVersionId: game.get("pendingVersionId") ?? null,
    buildError: game.get("buildError") ?? null,
  };
}

// ---- Upload API keys: issued from the settings window or by approving a CLI login, stored only as hashes. ----

const MAX_KEY_LABEL = 60;
const CLI_LOGIN_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_CLI_LOGINS = 20;
const KEY_TOUCH_INTERVAL_MS = 10 * 60 * 1000;

// Neither collection has client rules: only Functions can read or write them.
const apiKeyRef = (hash: string) => db.doc(`apiKeys/${hash}`);
const cliLoginRef = (id: string) => db.doc(`cliLogins/${id}`);

function readLabel(value: unknown, fallback: string): string {
  const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, MAX_KEY_LABEL) : "";
  return label || fallback;
}

function apiKeyRecord(key: string, label: string, createdBy: string, source: "settings" | "cli") {
  return { label, preview: keyPreview(key), source, createdBy, createdAt: FieldValue.serverTimestamp(), lastUsedAt: null, revokedAt: null };
}

/** Finds the active key behind an Authorization header and notes when it was last used. */
async function authenticateApiKey(header: string | undefined): Promise<string> {
  const key = bearerToken(header);
  if (!key) throw new ApiError(401, "API 키가 필요합니다. atelier-cli login으로 로그인해 주세요.");
  const hash = hashSecret(key);
  const snapshot = await apiKeyRef(hash).get();
  if (!snapshot.exists || snapshot.get("revokedAt")) throw new ApiError(401, "API 키가 올바르지 않거나 폐기되었습니다. atelier-cli login으로 다시 로그인해 주세요.");
  const lastUsed = snapshot.get("lastUsedAt");
  // Writing on every request would only add cost; a coarse "last used" is all the settings list needs.
  if (!(lastUsed instanceof Timestamp) || Date.now() - lastUsed.toMillis() > KEY_TOUCH_INTERVAL_MS) {
    await snapshot.ref.update({ lastUsedAt: FieldValue.serverTimestamp() });
  }
  return hash;
}

export const createApiKey = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1 }, async (request) => {
  const auth = requireAdmin(request);
  const label = readLabel(request.data?.label, "이름 없는 키");
  const key = newApiKey();
  await apiKeyRef(hashSecret(key)).create(apiKeyRecord(key, label, auth.uid, "settings"));
  logger.info("API key issued", { label, by: auth.uid, source: "settings" });
  // The only time the key itself leaves the server.
  return { key, label };
});

export const listApiKeys = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1 }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection("apiKeys").orderBy("createdAt", "desc").limit(100).get();
  const iso = (value: unknown) => (value instanceof Timestamp ? value.toDate().toISOString() : null);
  return {
    keys: snapshot.docs.map((doc) => ({
      id: doc.id,
      label: String(doc.get("label") ?? ""),
      preview: String(doc.get("preview") ?? ""),
      source: String(doc.get("source") ?? ""),
      createdAt: iso(doc.get("createdAt")),
      lastUsedAt: iso(doc.get("lastUsedAt")),
      revokedAt: iso(doc.get("revokedAt")),
    })),
  };
});

export const revokeApiKey = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1 }, async (request) => {
  const auth = requireAdmin(request);
  const id = typeof request.data?.id === "string" && /^[0-9a-f]{64}$/.test(request.data.id) ? request.data.id : "";
  const ref = apiKeyRef(id);
  if (!id || !(await ref.get()).exists) throw new HttpsError("not-found", "키를 찾을 수 없습니다.");
  await ref.update({ revokedAt: FieldValue.serverTimestamp(), revokedBy: auth.uid });
  logger.info("API key revoked", { id: id.slice(0, 8), by: auth.uid });
  return { ok: true };
});

/** Pending CLI login for a code typed on (or linked to) the approval page. */
async function pendingCliLogin(code: unknown) {
  const userCode = normalizeUserCode(code);
  if (!userCode) throw new HttpsError("invalid-argument", "코드 형식이 올바르지 않습니다.");
  const match = await db.collection("cliLogins").where("userCode", "==", userCode).limit(1).get();
  const doc = match.docs[0];
  const expiresAt = doc?.get("expiresAt");
  if (!doc || doc.get("status") !== "pending" || !(expiresAt instanceof Timestamp) || expiresAt.toMillis() < Date.now()) {
    throw new HttpsError("not-found", "코드가 없거나 만료되었습니다. 터미널에서 다시 로그인해 주세요.");
  }
  return doc;
}

export const describeCliLogin = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1 }, async (request) => {
  requireAdmin(request);
  const doc = await pendingCliLogin(request.data?.code);
  return { userCode: doc.get("userCode"), label: doc.get("label"), expiresAt: (doc.get("expiresAt") as Timestamp).toDate().toISOString() };
});

export const approveCliLogin = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1 }, async (request) => {
  const auth = requireAdmin(request);
  const doc = await pendingCliLogin(request.data?.code);
  const approve = request.data?.approve === true;
  // The key itself is minted only when the CLI collects it, so it is never stored in the clear.
  await doc.ref.update({ status: approve ? "approved" : "denied", decidedBy: auth.uid, decidedAt: FieldValue.serverTimestamp() });
  logger.info("CLI login decided", { approve, label: doc.get("label"), by: auth.uid });
  return { ok: true, label: doc.get("label") };
});

/** Starts a CLI login (device-code style): the terminal shows the code, an admin approves it on the site. */
async function startCliLogin(body: Record<string, unknown>) {
  const now = Date.now();
  // Unauthenticated, so keep it bounded: sweep expired attempts and cap the live ones.
  const expired = await db.collection("cliLogins").where("expiresAt", "<", Timestamp.fromMillis(now)).limit(50).get();
  await deleteDocs(expired);
  const live = await db.collection("cliLogins").where("expiresAt", ">=", Timestamp.fromMillis(now)).count().get();
  if (live.data().count >= MAX_PENDING_CLI_LOGINS) throw new ApiError(429, "로그인 요청이 너무 많습니다. 몇 분 뒤 다시 시도해 주세요.");

  const pollToken = newPollToken();
  const userCode = newUserCode();
  const ref = db.collection("cliLogins").doc();
  await ref.set({
    userCode,
    pollTokenHash: hashSecret(pollToken),
    label: readLabel(body.label, "CLI"),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + CLI_LOGIN_TTL_MS),
  });
  return {
    sessionId: ref.id,
    pollToken,
    userCode,
    verificationUrl: `${SITE_URL.value().replace(/\/+$/, "")}/cli-login?code=${encodeURIComponent(userCode)}`,
    expiresIn: CLI_LOGIN_TTL_MS / 1000,
    interval: 3,
  };
}

/** The CLI polls this; once approved it receives the new key exactly once. */
async function collectCliLogin(sessionId: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const pollToken = typeof body.pollToken === "string" ? body.pollToken : "";
  const ref = cliLoginRef(sessionId);
  return db.runTransaction(async (transaction) => {
    const session = await transaction.get(ref);
    if (!session.exists || !pollToken || !sameDigest(hashSecret(pollToken), String(session.get("pollTokenHash") ?? ""))) {
      return { status: 404, body: { error: "로그인 요청을 찾을 수 없습니다." } };
    }
    const expired = (session.get("expiresAt") as Timestamp).toMillis() < Date.now();
    const status = session.get("status");
    if (status === "denied" || (status === "pending" && expired)) {
      transaction.delete(ref);
      return { status: 410, body: { error: status === "denied" ? "로그인이 거절되었습니다." : "로그인 요청이 만료되었습니다. 다시 시도해 주세요." } };
    }
    if (status !== "approved") return { status: 202, body: { status: "pending" } };
    const key = newApiKey();
    const label = String(session.get("label") ?? "CLI");
    transaction.create(apiKeyRef(hashSecret(key)), apiKeyRecord(key, label, String(session.get("decidedBy") ?? ""), "cli"));
    transaction.delete(ref);
    return { status: 200, body: { key, label } };
  });
}

/**
 * Upload API. Every route needs `Authorization: Bearer <key>` except the CLI login pair.
 * POST   /cli/sessions                      — start a CLI login, returns a code to approve on the site.
 * POST   /cli/sessions/{id}/token           — poll; returns the new key once approved.
 * DELETE /keys/self                         — revoke the calling key (CLI logout).
 * POST   /games                             — create a game or point an existing one at a new build; returns upload URLs.
 * GET    /games/{id}                        — build status, for polling until processBuildZip finishes.
 * DELETE /games/{id}/versions/{versionId}   — cancel a draft whose ZIP never finished uploading.
 * A key acts as the admin for uploads, so it must stay off the client.
 */
export const uploadApi = onRequest({ region: "asia-northeast3", maxInstances: 1 }, async (request, response) => {
  response.set("Cache-Control", "no-store");
  try {
    const path = request.path.replace(/\/+$/, "");
    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
    if (request.method === "POST" && path === "/cli/sessions") {
      response.status(201).json(await startCliLogin(body));
      return;
    }
    const tokenMatch = path.match(/^\/cli\/sessions\/([A-Za-z0-9]{1,40})\/token$/);
    if (request.method === "POST" && tokenMatch?.[1]) {
      const result = await collectCliLogin(tokenMatch[1], body);
      if (result.status === 200) logger.info("API key issued", { label: result.body.label, source: "cli" });
      response.status(result.status).json(result.body);
      return;
    }

    const keyId = await authenticateApiKey(request.get("authorization"));
    if (request.method === "DELETE" && path === "/keys/self") {
      await apiKeyRef(keyId).update({ revokedAt: FieldValue.serverTimestamp(), revokedBy: "self" });
      logger.info("API key revoked", { id: keyId.slice(0, 8), by: "self" });
      response.json({ ok: true });
      return;
    }
    if (request.method === "POST" && path === "/games") {
      const result = await createApiDraft(body);
      logger.info("Upload API draft", { gameId: result.gameId, versionId: result.versionId, created: result.created });
      response.status(result.created ? 201 : 200).json(result);
      return;
    }
    const statusMatch = path.match(/^\/games\/([A-Za-z0-9_-]{1,64})$/);
    if (request.method === "GET" && statusMatch?.[1]) {
      response.json(await apiGameStatus(statusMatch[1]));
      return;
    }
    const cancelMatch = path.match(/^\/games\/([A-Za-z0-9_-]{1,64})\/versions\/([0-9a-f-]{36})$/);
    if (request.method === "DELETE" && cancelMatch?.[1] && cancelMatch[2]) {
      const result = await cancelApiDraft(cancelMatch[1], cancelMatch[2]);
      logger.info("Upload API cancel", { gameId: cancelMatch[1], versionId: cancelMatch[2], ...result });
      response.json(result);
      return;
    }
    throw new ApiError(404, "지원하지 않는 경로입니다.");
  } catch (error) {
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    logger.error("Upload API failed", { error });
    response.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

export const createPost = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3 }, async (request) => {
  const auth = requireUser(request);
  const text = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  const hasImage = request.data?.hasImage === true;
  if (!text || text.length > 100) throw new HttpsError("invalid-argument", "게시글은 100자 이하로 작성해 주세요.");
  // A post may point at one game; only a game the author can see, so a link never reveals a private title.
  const gameId = typeof request.data?.gameId === "string" && request.data.gameId ? request.data.gameId : null;
  if (gameId) {
    if (gameId.length > 128 || gameId.includes("/")) throw new HttpsError("invalid-argument", "연결할 게임을 찾을 수 없습니다.");
    const game = await db.doc(`games/${gameId}`).get();
    if (!game.exists || !(await canSeeGame(game, auth))) throw new HttpsError("invalid-argument", "연결할 게임을 찾을 수 없습니다.");
  }
  await enforceRateLimit(auth, "post");
  const postRef = db.collection("posts").doc();
  const postId = postRef.id;
  await postRef.set({
    text,
    imagePath: hasImage ? `board-images/${postId}/image` : null,
    gameId,
    authorId: auth.uid,
    authorName: publicAuthorName(auth),
    likeCount: 0,
    commentCount: 0,
    monthKey: pageMonthKey(),
    retentionStatus: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
  return { postId, imagePath: hasImage ? `board-images/${postId}/image` : undefined };
});

export const createComment = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3 }, async (request) => {
  const auth = requireUser(request);
  const targetType: TargetType = request.data?.targetType === "game" ? "game" : "post";
  const targetId = typeof request.data?.targetId === "string" ? request.data.targetId : "";
  const text = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  const parentId = typeof request.data?.parentId === "string" ? request.data.parentId : null;
  if (!targetId || !text || text.length > 50) throw new HttpsError("invalid-argument", "댓글은 50자 이하로 작성해 주세요.");
  const target = await db.doc(`${targetType === "game" ? "games" : "posts"}/${targetId}`).get();
  if (!target.exists || (targetType === "game" && !(await canSeeGame(target, auth)))) throw new HttpsError("not-found", "댓글 대상이 존재하지 않습니다.");
  let depth: 0 | 1 = 0;
  if (parentId) {
    const parent = await db.doc(`comments/${parentId}`).get();
    if (!parent.exists || parent.get("targetId") !== targetId || parent.get("targetType") !== targetType || parent.get("depth") !== 0) {
      throw new HttpsError("invalid-argument", "답글은 1단계까지만 작성할 수 있습니다.");
    }
    depth = 1;
  }
  await enforceRateLimit(auth, "comment");
  const commentRef = db.collection("comments").doc();
  await commentRef.set({ targetType, targetId, parentId, depth, text, authorId: auth.uid, authorName: publicAuthorName(auth), createdAt: FieldValue.serverTimestamp() });
  await target.ref.update({ commentCount: FieldValue.increment(1) });
  return { commentId: commentRef.id };
});

export const toggleLike = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3 }, async (request) => {
  const auth = requireUser(request);
  const targetType: TargetType = request.data?.targetType === "game" ? "game" : "post";
  const targetId = typeof request.data?.targetId === "string" ? request.data.targetId : "";
  if (!targetId) throw new HttpsError("invalid-argument", "좋아요 대상을 확인해 주세요.");
  await enforceRateLimit(auth, "like");
  const targetRef = db.doc(`${targetType === "game" ? "games" : "posts"}/${targetId}`);
  const recordRef = db.doc(`likeRecords/${targetType}_${targetId}_${auth.uid}`);
  const result = await db.runTransaction(async (transaction) => {
    const [target, record] = await Promise.all([transaction.get(targetRef), transaction.get(recordRef)]);
    if (!target.exists || (targetType === "game" && !(await canSeeGame(target, auth)))) throw new HttpsError("not-found", "좋아요 대상을 찾을 수 없습니다.");
    const current = Number(target.get("likeCount") ?? 0);
    if (record.exists) {
      transaction.delete(recordRef);
      transaction.update(targetRef, { likeCount: Math.max(0, current - 1) });
      return { liked: false, likeCount: Math.max(0, current - 1) };
    }
    transaction.set(recordRef, { targetType, targetId, uid: auth.uid, createdAt: FieldValue.serverTimestamp() });
    transaction.update(targetRef, { likeCount: current + 1 });
    return { liked: true, likeCount: current + 1 };
  });
  return result;
});

function requireAuthorOrAdmin(request: CallableRequest<unknown>, authorId: unknown) {
  const auth = requireUser(request);
  if (auth.token.admin !== true && authorId !== auth.uid) throw new HttpsError("permission-denied", "본인이 작성한 글만 삭제할 수 있습니다.");
  return auth;
}

export const deletePost = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3 }, async (request) => {
  const postId = typeof request.data?.postId === "string" ? request.data.postId : "";
  if (!postId) throw new HttpsError("invalid-argument", "삭제할 게시글을 확인해 주세요.");
  const post = await db.doc(`posts/${postId}`).get();
  if (!post.exists) throw new HttpsError("not-found", "이미 삭제된 게시글입니다.");
  requireAuthorOrAdmin(request, post.get("authorId"));
  await deletePostData(post);
  return { deleted: true };
});

export const deleteComment = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3 }, async (request) => {
  const commentId = typeof request.data?.commentId === "string" ? request.data.commentId : "";
  if (!commentId) throw new HttpsError("invalid-argument", "삭제할 댓글을 확인해 주세요.");
  const comment = await db.doc(`comments/${commentId}`).get();
  if (!comment.exists) throw new HttpsError("not-found", "이미 삭제된 댓글입니다.");
  requireAuthorOrAdmin(request, comment.get("authorId"));
  // Replies hang off a top-level comment, so they go with it.
  const replies = await db.collection("comments").where("parentId", "==", commentId).get();
  const batch = db.batch();
  for (const reply of replies.docs) batch.delete(reply.ref);
  batch.delete(comment.ref);
  const targetRef = db.doc(`${comment.get("targetType") === "game" ? "games" : "posts"}/${String(comment.get("targetId"))}`);
  const target = await targetRef.get();
  if (target.exists) batch.update(targetRef, { commentCount: Math.max(0, Number(target.get("commentCount") ?? 0) - (replies.size + 1)) });
  await batch.commit();
  return { deleted: replies.size + 1 };
});

/** Published private games the caller is invited to (admins get all of them). */
export const listPrivateGames = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3 }, async (request) => {
  const auth = requireUser(request);
  let gameIds: string[];
  if (auth.token.admin === true) {
    gameIds = (await db.collection("games").where("accessLevel", "==", "private").select().get()).docs.map((doc) => doc.id);
  } else {
    const email = verifiedEmail(auth);
    if (!email) return { games: [] };
    gameIds = (await db.collection("gameAllowlists").where("emails", "array-contains", email).select().get()).docs.map((doc) => doc.id);
  }
  if (!gameIds.length) return { games: [] };
  const snapshots = await db.getAll(...gameIds.map((id) => db.doc(`games/${id}`)));
  const games = snapshots
    .filter((game) => game.exists && game.get("accessLevel") === "private" && game.get("buildStatus") === "published")
    .map((game) => {
      const { createdAt, updatedAt, ...data } = game.data() ?? {};
      // Callables serialize Timestamps as plain objects, so send milliseconds instead.
      return { ...data, id: game.id, createdAtMs: (createdAt as Timestamp | undefined)?.toMillis() ?? null, updatedAtMs: (updatedAt as Timestamp | undefined)?.toMillis() ?? null };
    });
  return { games };
});

export const getPlaySession = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3, secrets: [PLAY_SESSION_SECRET] }, async (request) => {
  const gameId = typeof request.data?.gameId === "string" ? request.data.gameId : "";
  if (!gameId) throw new HttpsError("invalid-argument", "게임을 확인해 주세요.");
  const game = await db.doc(`games/${gameId}`).get();
  if (!game.exists || game.get("buildStatus") !== "published" || !(await canSeeGame(game, request.auth))) throw new HttpsError("not-found", "아직 공개되지 않은 빌드입니다.");
  if (!(await canPlay(game, request))) throw new HttpsError("permission-denied", "현재 계정에는 이 빌드를 플레이할 권한이 없습니다.");
  const level = game.get("accessLevel") as AccessLevel;
  const token = createSessionToken({ gameId, versionId: String(game.get("buildVersionId")), uid: request.auth?.uid ?? null, level, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
  const path = `/s/${token}/g/${encodeURIComponent(gameId)}/index.html`;
  const base = FUNCTIONS_BASE_URL.value().replace(/\/$/, "");
  return { playPath: path, playUrl: base ? `${base}/playGateway${path}` : undefined };
});

/** Counts one visit to a game page and returns the total; stats live outside games/{id} so visits don't wake every onSnapshot listener. */
export const recordGameView = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 3 }, async (request) => {
  const gameId = typeof request.data?.gameId === "string" ? request.data.gameId : "";
  if (!gameId) throw new HttpsError("invalid-argument", "게임을 확인해 주세요.");
  const game = await db.doc(`games/${gameId}`).get();
  if (!game.exists || !(await canSeeGame(game, request.auth))) throw new HttpsError("not-found", "게임을 찾을 수 없습니다.");
  const statsRef = db.doc(`gameStats/${gameId}`);
  const countable = request.data?.countView === true && game.get("buildStatus") === "published" && request.auth?.token.admin !== true;
  if (countable) await statsRef.set({ viewCount: FieldValue.increment(1) }, { merge: true });
  const stats = await statsRef.get();
  return { viewCount: Number(stats.get("viewCount") ?? 0) };
});

export const playGateway = onRequest({ region: "asia-northeast3", maxInstances: 3, secrets: [PLAY_SESSION_SECRET], cors: true }, async (request, response) => {
  const match = request.path.match(/^\/s\/([^/]+)\/g\/([^/]+)\/(.*)$/);
  if (!match) {
    response.status(404).send("Not found");
    return;
  }
  const tokenValue = match[1];
  const gameIdValue = match[2];
  const pathValue = match[3];
  if (!tokenValue || !gameIdValue) {
    response.status(404).send("Not found");
    return;
  }
  const token = readSessionToken(tokenValue);
  const gameId = decodeURIComponent(gameIdValue);
  if (!token || token.gameId !== gameId) {
    response.status(403).send("Session expired");
    return;
  }
  const relativePath = decodeURIComponent(pathValue || "index.html").replaceAll("\\", "/");
  if (relativePath.startsWith("/") || relativePath.split("/").some((part) => part === ".." || part.includes("\0"))) {
    response.status(400).send("Invalid path");
    return;
  }
  const file = bucket.file(`game-builds/${gameId}/${token.versionId}/${relativePath}`);
  if (isDirectAsset(relativePath)) {
    response.set("Cache-Control", "no-store");
    response.redirect(302, await directAssetUrl(file));
    return;
  }
  const [exists] = await file.exists();
  if (!exists) {
    response.status(404).send("Asset not found");
    return;
  }
  const { contentType, contentEncoding } = assetHeaders(relativePath);
  response.set("Content-Type", contentType);
  // Unity WebGL ships pre-compressed .gz/.br assets that the browser must decode itself.
  if (contentEncoding) response.set("Content-Encoding", contentEncoding);
  response.set("Cache-Control", "private, max-age=300");
  response.set("Content-Security-Policy", `frame-ancestors ${PAGES_ORIGIN.value()}`);
  response.set("X-Content-Type-Options", "nosniff");
  file.createReadStream().on("error", () => response.end()).pipe(response);
});

// Signing is a remote IAM call, and a URL stays the same for its whole window.
const signedUrls = new Map<string, string>();
let signedUrlsWindowStart = 0;

async function directAssetUrl(file: ReturnType<typeof bucket.file>): Promise<string> {
  const { accessibleAt, expires } = signedUrlWindow(Date.now());
  if (accessibleAt.getTime() !== signedUrlsWindowStart) {
    signedUrls.clear();
    signedUrlsWindowStart = accessibleAt.getTime();
  }
  const cached = signedUrls.get(file.name);
  if (cached) return cached;
  const [url] = await file.getSignedUrl({ version: "v4", action: "read", accessibleAt, expires });
  signedUrls.set(file.name, url);
  return url;
}

function assetHeaders(path: string): { contentType: string; contentEncoding?: "gzip" | "br" } {
  const contentEncoding = path.endsWith(".gz") ? "gzip" : path.endsWith(".br") ? "br" : undefined;
  const basePath = contentEncoding ? path.slice(0, -3) : path;
  const contentType = basePath.endsWith(".data") ? "application/octet-stream" : mime.lookup(basePath) || "application/octet-stream";
  return { contentType, contentEncoding };
}

function safeArchivePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part.includes("\0"))) throw new Error("Unsafe archive path");
  return normalized;
}

/** Returns the folder prefix holding index.html: "" for the ZIP root, or a single wrapping folder. */
function buildRootPrefix(paths: string[]): string {
  if (paths.includes("index.html")) return "";
  const topLevel = new Set(paths.map((path) => path.split("/")[0]));
  const [folder] = [...topLevel];
  if (topLevel.size === 1 && folder && paths.includes(`${folder}/index.html`)) return `${folder}/`;
  throw new Error("ZIP 루트(또는 단일 최상위 폴더)에 index.html이 필요합니다.");
}

async function deletePrefix(prefix: string, keep?: (name: string) => boolean): Promise<number> {
  const [files] = await bucket.getFiles({ prefix });
  const targets = files.filter((file) => !keep?.(file.name));
  await Promise.all(targets.map((file) => file.delete().catch(() => undefined)));
  return targets.length;
}

// A Storage trigger has to run in its bucket's region.
export const processBuildZip = onObjectFinalized({ bucket: GAME_STORAGE_BUCKET, region: "us-central1", memory: "2GiB", timeoutSeconds: 540 }, async (event) => {
  const object = event.data;
  const objectName = object.name ?? "";
  const match = objectName.match(/^incoming-builds\/([^/]+)\/([^/]+)\/([^/]+)\.zip$/);
  if (!match || !object.bucket) return;
  const [, , gameId, versionId] = match;
  const source = getStorage().bucket(object.bucket).file(objectName);
  const gameRef = db.doc(`games/${gameId}`);
  const game = await gameRef.get();
  const isUpdate = game.exists && game.get("pendingVersionId") === versionId;
  const isInitial = game.exists && game.get("buildVersionId") === versionId && game.get("buildStatus") !== "published";
  if (!isUpdate && !isInitial) {
    // A superseded or cancelled upload: its held game info will never apply.
    await pendingUpdateRef(versionId ?? "").delete().catch(() => undefined);
    await source.delete().catch(() => undefined);
    return;
  }
  const versionRoot = `game-builds/${gameId}/${versionId}/`;
  try {
    if (Number(object.size ?? 0) > MAX_ZIP_BYTES) throw new Error("ZIP은 250MiB 이하만 업로드할 수 있습니다.");
    const [zipBuffer] = await source.download();
    const directory = await unzipper.Open.buffer(zipBuffer);
    const files = directory.files.filter((entry) => entry.type === "File" && !entry.path.startsWith("__MACOSX/"));
    if (files.length > MAX_EXTRACTED_FILES) throw new Error("ZIP 안의 파일이 너무 많습니다.");
    const paths = files.map((entry) => safeArchivePath(entry.path));
    const prefix = buildRootPrefix(paths);
    let extractedBytes = 0;
    for (const [index, entry] of files.entries()) {
      const path = (paths[index] ?? "").slice(prefix.length);
      if (!path) continue;
      const content = await entry.buffer();
      extractedBytes += content.byteLength;
      if (extractedBytes > MAX_EXTRACTED_BYTES) throw new Error("압축 해제 결과가 너무 큽니다.");
      // Cloud Storage serves direct assets itself, so the object must carry the headers the gateway would set.
      const { contentType, contentEncoding } = assetHeaders(path);
      await bucket.file(`${versionRoot}${path}`).save(content, { resumable: false, metadata: { contentType, contentEncoding, cacheControl: DIRECT_ASSET_CACHE_CONTROL } });
    }
    const buildFields = { buildVersionId: versionId, buildStatus: "published", buildRoot: versionRoot.slice(0, -1), pendingVersionId: FieldValue.delete(), buildError: FieldValue.delete(), createdByVersionId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() };
    if (isUpdate) await publishUpdate(gameRef, versionId ?? "", buildFields);
    else await gameRef.update(buildFields);
    const removed = await deletePrefix(`game-builds/${gameId}/`, (name) => name.startsWith(versionRoot));
    logger.info("Published game build", { gameId, versionId, files: files.length, removedOldFiles: removed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZIP processing failed";
    await deletePrefix(versionRoot);
    // A failed update keeps the previous build published, along with its game info.
    if (isUpdate) await pendingUpdateRef(versionId ?? "").delete().catch(() => undefined);
    await gameRef.update(isUpdate
      ? { buildError: message, pendingVersionId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }
      : { buildStatus: "failed", buildError: message, updatedAt: FieldValue.serverTimestamp() });
    logger.error("Failed to process game build", { gameId, versionId, error });
  } finally {
    await source.delete().catch(() => undefined);
  }
});

export const updateGameMeta = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 2 }, async (request) => {
  requireAdmin(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const gameId = typeof data.gameId === "string" ? data.gameId : "";
  const meta = readGameMeta(data);
  const allowedEmails = readAllowedEmails(data, meta.accessLevel);
  const gameRef = db.doc(`games/${gameId}`);
  if (!gameId || !(await gameRef.get()).exists) throw new HttpsError("not-found", "게임을 찾을 수 없습니다.");
  const duplicate = await db.collection("games").where("titleKey", "==", meta.titleKey).limit(2).get();
  if (duplicate.docs.some((doc) => doc.id !== gameId)) throw new HttpsError("already-exists", "같은 제목의 게임이 이미 있습니다.");
  // Write the allowlist before the game turns private, and drop it only after the game has left private.
  if (allowedEmails) await saveAllowlist(gameId, allowedEmails);
  await gameRef.update({ ...meta, updatedAt: FieldValue.serverTimestamp() });
  if (!allowedEmails) await saveAllowlist(gameId, null);
  return { ok: true };
});

async function deleteDocs(snapshot: QuerySnapshot<DocumentData>): Promise<void> {
  for (let index = 0; index < snapshot.docs.length; index += 400) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

export const deleteGame = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1, timeoutSeconds: 300 }, async (request) => {
  requireAdmin(request);
  const gameId = typeof request.data?.gameId === "string" ? request.data.gameId : "";
  const gameRef = db.doc(`games/${gameId}`);
  if (!gameId || !(await gameRef.get()).exists) throw new HttpsError("not-found", "게임을 찾을 수 없습니다.");
  await deletePrefix(`game-builds/${gameId}/`);
  await deletePrefix(`game-covers/${gameId}/`);
  const [incoming] = await bucket.getFiles({ prefix: "incoming-builds/" });
  await Promise.all(incoming.filter((file) => file.name.split("/")[2] === gameId).map((file) => file.delete().catch(() => undefined)));
  await deleteDocs(await db.collection("comments").where("targetType", "==", "game").where("targetId", "==", gameId).get());
  await deleteDocs(await db.collection("likeRecords").where("targetType", "==", "game").where("targetId", "==", gameId).get());
  await deleteDocs(await db.collection("pendingGameUpdates").where("gameId", "==", gameId).get());
  await gameRef.delete();
  await allowlistRef(gameId).delete();
  await db.doc(`gameStats/${gameId}`).delete();
  logger.info("Deleted game", { gameId });
  return { ok: true };
});

async function buildStorageReport() {
  const [files] = await bucket.getFiles();
  const games = new Map((await db.collection("games").get()).docs.map((doc) => [doc.id, doc]));
  const postIds = new Set((await db.collection("posts").select().get()).docs.map((doc) => doc.id));
  const liveVersions = (gameId: string) => {
    const game = games.get(gameId);
    return new Set([game?.get("buildVersionId"), game?.get("pendingVersionId")].filter(Boolean));
  };
  const byPrefix: Record<string, { bytes: number; files: number }> = {};
  const orphanedPaths: string[] = [];
  const builtGames = new Set<string>();
  let totalBytes = 0;
  for (const file of files) {
    const size = Number(file.metadata.size ?? 0);
    const [prefix = "", first = "", second = "", third = ""] = file.name.split("/");
    totalBytes += size;
    byPrefix[prefix] = { bytes: (byPrefix[prefix]?.bytes ?? 0) + size, files: (byPrefix[prefix]?.files ?? 0) + 1 };
    let orphan = false;
    if (prefix === "game-builds") {
      orphan = !liveVersions(first).has(second);
      if (!orphan && second === games.get(first)?.get("buildVersionId")) builtGames.add(first);
    } else if (prefix === "game-covers") orphan = !games.has(first);
    else if (prefix === "incoming-builds") orphan = !liveVersions(second).has(third.replace(/\.zip$/, ""));
    else if (prefix === "board-images") orphan = !postIds.has(first);
    if (orphan) orphanedPaths.push(file.name);
  }
  const gamesWithoutBuild = [...games.values()].filter((game) => game.get("buildStatus") === "published" && !builtGames.has(game.id)).map((game) => game.id);
  return { totalBytes, fileCount: files.length, byPrefix, orphanedPaths, gamesWithoutBuild };
}

export const storageReport = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1, timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  return buildStorageReport();
});

export const deleteStorageOrphans = onCall({ region: "asia-northeast3", enforceAppCheck: true, maxInstances: 1, timeoutSeconds: 300 }, async (request) => {
  requireAdmin(request);
  const requested: unknown[] = Array.isArray(request.data?.paths) ? request.data.paths : [];
  // Only delete paths that are still orphaned when the request arrives.
  const orphaned = new Set((await buildStorageReport()).orphanedPaths);
  const targets = requested.filter((path): path is string => typeof path === "string" && orphaned.has(path));
  await Promise.all(targets.map((path) => bucket.file(path).delete().catch(() => undefined)));
  logger.info("Deleted orphaned storage objects", { count: targets.length });
  return { deleted: targets.length };
});

async function deletePostData(snapshot: DocumentSnapshot<DocumentData>): Promise<void> {
  const postId = snapshot.id;
  const comments = await db.collection("comments").where("targetType", "==", "post").where("targetId", "==", postId).get();
  let batch = db.batch();
  let count = 0;
  for (const comment of comments.docs) {
    batch.delete(comment.ref);
    count += 1;
    if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  const likes = await db.collection("likeRecords").where("targetType", "==", "post").where("targetId", "==", postId).get();
  for (const like of likes.docs) {
    batch.delete(like.ref);
    count += 1;
    if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  batch.delete(snapshot.ref);
  await batch.commit();
  const imagePath = snapshot.get("imagePath") as string | null | undefined;
  if (imagePath) await bucket.file(imagePath).delete().catch(() => undefined);
}

export const monthlyRetentionSweep = onSchedule({ schedule: "0 3 1 * *", timeZone: "Asia/Seoul", region: "asia-northeast3", maxInstances: 1 }, async () => {
  // Runs on the 1st (KST) and evaluates the month two months earlier, e.g. Aug 1 → June.
  const monthKey = monthKeyBefore(2);
  const snapshot = await db.collection("posts").where("monthKey", "==", monthKey).get();
  const posts = snapshot.docs.filter((post) => post.get("retentionStatus") !== "preserved").sort((left, right) => {
    const likes = Number(right.get("likeCount") ?? 0) - Number(left.get("likeCount") ?? 0);
    if (likes !== 0) return likes;
    const leftDate = (left.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0;
    const rightDate = (right.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0;
    if (leftDate !== rightDate) return leftDate - rightDate;
    return left.id.localeCompare(right.id);
  });
  const winner = posts[0];
  if (winner && Number(winner.get("likeCount") ?? 0) >= 10) {
    await winner.ref.update({ retentionStatus: "preserved", preservedAt: FieldValue.serverTimestamp() });
  }
  for (const post of posts) {
    if (winner && post.id === winner.id && Number(winner.get("likeCount") ?? 0) >= 10) continue;
    await deletePostData(post);
  }
  logger.info("Monthly retention sweep complete", { monthKey, evaluated: posts.length, preserved: winner && Number(winner.get("likeCount") ?? 0) >= 10 ? winner.id : null });
});
