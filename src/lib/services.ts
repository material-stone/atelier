import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { demoComments, demoGames, demoPosts } from "../data/demo";
import type {
  AuthState,
  Comment,
  Game,
  GameDraftInput,
  GameMetaInput,
  Post,
  StorageReport,
  TargetType,
  UserProfile,
} from "../types";
import { LISTED_STORED_LEVELS, defaultStage, isGameStage, normalizeAccessLevel } from "./access";
import { appConfig, hasFirebaseConfig } from "./config";
import { trackGameView } from "./gameViews";
import { auth, db, functions, storage } from "./firebase";

export { hasFirebaseConfig };

const signedOut: AuthState = { user: null, profile: null, isAdmin: false, isSubscriber: false, isMember: false, loading: false };
let authListener: ((state: AuthState) => void) | null = null;

function isActive(value: UserProfile["youtubeVerifiedUntil"]): boolean {
  const date = value instanceof Date ? value : value?.toDate();
  return Boolean(date && date.getTime() > Date.now());
}

async function buildAuthState(user: User | null): Promise<AuthState> {
  if (!user) return signedOut;
  const token = await user.getIdTokenResult();
  const profile = await loadProfile(user);
  return {
    user,
    profile,
    isAdmin: token.claims.admin === true,
    isSubscriber: isActive(profile?.youtubeVerifiedUntil),
    isMember: isActive(profile?.memberUntil),
    loading: false,
  };
}

export function subscribeToAuth(callback: (state: AuthState) => void): () => void {
  if (!auth) {
    callback(signedOut);
    return () => undefined;
  }

  authListener = callback;
  callback({ ...signedOut, loading: true });
  const unsubscribe = onAuthStateChanged(auth, async (user) => callback(await buildAuthState(user)));
  return () => {
    authListener = null;
    unsubscribe();
  };
}

/** Re-reads the profile after server-side changes such as subscription verification. */
export async function refreshAuthState(): Promise<void> {
  if (auth && authListener) authListener(await buildAuthState(auth.currentUser));
}

async function loadProfile(user: User): Promise<UserProfile | null> {
  if (!db) return null;
  const snapshot = await getDoc(doc(db, "users", user.uid));
  const data = snapshot.data();
  if (!data) return null;
  return {
    uid: user.uid,
    displayName: data.displayName ?? user.displayName ?? user.email ?? "visitor",
    photoURL: data.photoURL ?? user.photoURL,
    role: data.role === "admin" ? "admin" : "user",
    youtubeVerifiedUntil: data.youtubeVerifiedUntil ?? null,
    memberUntil: data.memberUntil ?? null,
  };
}

// Plain sign-in asks only for the basic profile, so any Google account can log in without the
// sensitive YouTube scope. That scope is requested later, only when a player verifies a subscription.
export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error("Firebase 설정이 아직 연결되지 않았습니다.");
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function verifyYoutubeSubscription(): Promise<{ verifiedUntil: string }> {
  if (!auth?.currentUser || !functions) throw new Error("Google 로그인 후 다시 시도해 주세요.");
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/youtube.readonly");
  const credentialResult = await reauthenticateWithPopup(auth.currentUser, provider);
  const credential = GoogleAuthProvider.credentialFromResult(credentialResult);
  if (!credential?.accessToken) throw new Error("YouTube 권한 동의를 완료하지 못했습니다.");
  const callable = httpsCallable<{ youtubeAccessToken: string }, { verifiedUntil: string }>(
    functions,
    "verifyYoutubeSubscription",
  );
  const result = await callable({ youtubeAccessToken: credential.accessToken });
  await refreshAuthState();
  return result.data;
}

/** Removes this account's subscription check so it can be verified again from the start. */
export async function clearYoutubeVerification(): Promise<void> {
  if (!auth?.currentUser || !functions) throw new Error("Google 로그인 후 다시 시도해 주세요.");
  await httpsCallable(functions, "clearYoutubeVerification")({});
  await refreshAuthState();
}

export async function signOutUser(): Promise<void> {
  if (auth) await signOut(auth);
}

async function coverUrl(path?: string): Promise<string | undefined> {
  if (!path || !storage) return undefined;
  try {
    return await getDownloadURL(ref(storage, path));
  } catch {
    return undefined;
  }
}

function mapGame(snapshot: { id: string; data: () => Record<string, unknown> | undefined }): Game {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    title: String(data.title ?? "Untitled game"),
    titleKey: String(data.titleKey ?? ""),
    description: String(data.description ?? ""),
    coverPath: typeof data.coverPath === "string" ? data.coverPath : undefined,
    genres: Array.isArray(data.genres) ? data.genres.map(String) : [],
    accessLevel: normalizeAccessLevel(data.accessLevel) ?? "private",
    stage: isGameStage(data.stage) ? data.stage : defaultStage(data.accessLevel),
    buildVersionId: String(data.buildVersionId ?? ""),
    buildStatus: data.buildStatus === "failed" || data.buildStatus === "processing" ? data.buildStatus : "published",
    buildRoot: typeof data.buildRoot === "string" ? data.buildRoot : undefined,
    buildError: typeof data.buildError === "string" ? data.buildError : undefined,
    pendingVersionId: typeof data.pendingVersionId === "string" ? data.pendingVersionId : undefined,
    likeCount: Number(data.likeCount ?? 0),
    createdAt: data.createdAt as Game["createdAt"],
    updatedAt: data.updatedAt as Game["updatedAt"],
  };
}

function mapPost(snapshot: { id: string; data: () => Record<string, unknown> | undefined }): Post {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    text: String(data.text ?? ""),
    imagePath: typeof data.imagePath === "string" ? data.imagePath : null,
    gameId: typeof data.gameId === "string" ? data.gameId : null,
    authorId: String(data.authorId ?? ""),
    authorName: String(data.authorName ?? "visitor"),
    likeCount: Number(data.likeCount ?? 0),
    commentCount: Number(data.commentCount ?? 0),
    monthKey: String(data.monthKey ?? ""),
    retentionStatus: data.retentionStatus === "preserved" ? "preserved" : "pending",
    createdAt: data.createdAt as Post["createdAt"],
  };
}

function mapComment(snapshot: { id: string; data: () => Record<string, unknown> | undefined }): Comment {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    targetType: data.targetType === "game" ? "game" : "post",
    targetId: String(data.targetId ?? ""),
    parentId: typeof data.parentId === "string" ? data.parentId : null,
    depth: data.depth === 1 ? 1 : 0,
    text: String(data.text ?? ""),
    authorId: String(data.authorId ?? ""),
    authorName: String(data.authorName ?? "visitor"),
    createdAt: data.createdAt as Comment["createdAt"],
  };
}

function updatedMillis(game: Game): number {
  const value = game.updatedAt;
  return value instanceof Date ? value.getTime() : value?.toMillis() ?? 0;
}

/** Private games the signed-in account is invited to; the rules keep them out of the listed query. */
async function loadPrivateGames(): Promise<Game[]> {
  if (!functions) return [];
  type Row = Record<string, unknown> & { id: string; createdAtMs: number | null; updatedAtMs: number | null };
  const result = await httpsCallable<Record<string, never>, { games: Row[] }>(functions, "listPrivateGames")({});
  return Promise.all(
    result.data.games.map(async ({ id, createdAtMs, updatedAtMs, ...data }) => {
      const game = mapGame({ id, data: () => ({ ...data, createdAt: createdAtMs ? new Date(createdAtMs) : undefined, updatedAt: updatedAtMs ? new Date(updatedAtMs) : undefined }) });
      return { ...game, coverUrl: await coverUrl(game.coverPath) };
    }),
  );
}

export function subscribeToGames(callback: (games: Game[]) => void): () => void {
  if (!db) {
    callback(demoGames);
    return () => undefined;
  }
  let listed: Game[] = [];
  let invited: Game[] = [];
  let request = 0;
  const emit = () => callback([...listed, ...invited].sort((left, right) => updatedMillis(right) - updatedMillis(left)));
  const gamesQuery = query(
    collection(db, "games"),
    where("buildStatus", "==", "published"),
    where("accessLevel", "in", LISTED_STORED_LEVELS),
    orderBy("updatedAt", "desc"),
  );
  const unsubscribeGames = onSnapshot(gamesQuery, async (snapshot) => {
    listed = await Promise.all(
      snapshot.docs.map(async (item) => {
        const game = mapGame(item);
        return { ...game, coverUrl: await coverUrl(game.coverPath) };
      }),
    );
    emit();
  });
  const unsubscribeAuth = auth
    ? onAuthStateChanged(auth, async (user) => {
        const current = ++request;
        const games = user ? await loadPrivateGames().catch(() => []) : [];
        if (current !== request) return;
        invited = games;
        emit();
      })
    : () => undefined;
  return () => {
    request += 1;
    unsubscribeGames();
    unsubscribeAuth();
  };
}

/** Admin-only: every game regardless of build status, newest first. */
export function subscribeToAllGames(callback: (games: Game[]) => void): () => void {
  if (!db) {
    callback(demoGames);
    return () => undefined;
  }
  const gamesQuery = query(collection(db, "games"), orderBy("updatedAt", "desc"));
  // The management list shows each cover, so resolve their URLs like the public list does.
  return onSnapshot(
    gamesQuery,
    async (snapshot) => callback(await Promise.all(snapshot.docs.map(async (item) => {
      const game = mapGame(item);
      return { ...game, coverUrl: await coverUrl(game.coverPath) };
    }))),
    () => callback([]),
  );
}

export function subscribeToPosts(callback: (posts: Post[]) => void): () => void {
  if (!db) {
    callback(demoPosts);
    return () => undefined;
  }
  const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(postsQuery, async (snapshot) => {
    const posts = await Promise.all(
      snapshot.docs.map(async (item) => {
        const post = mapPost(item);
        return { ...post, imageUrl: await coverUrl(post.imagePath ?? undefined) };
      }),
    );
    callback(posts);
  });
}

export function subscribeToComments(
  targetType: TargetType,
  targetId: string,
  callback: (comments: Comment[]) => void,
): () => void {
  if (!db) {
    callback(demoComments.filter((comment) => comment.targetType === targetType && comment.targetId === targetId));
    return () => undefined;
  }
  const commentsQuery = query(
    collection(db, "comments"),
    where("targetType", "==", targetType),
    where("targetId", "==", targetId),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(commentsQuery, (snapshot) => callback(snapshot.docs.map(mapComment)));
}

export async function findGameById(gameId: string): Promise<Game | null> {
  if (!db) return demoGames.find((game) => game.id === gameId) ?? null;
  // A private game the account is not invited to reads as permission-denied; treat it as missing.
  const snapshot = await getDoc(doc(db, "games", gameId)).catch(() => null);
  if (!snapshot?.exists()) return null;
  const game = mapGame(snapshot);
  return { ...game, coverUrl: await coverUrl(game.coverPath) };
}

export async function findGameByTitle(title: string): Promise<Game | null> {
  if (!db) return demoGames.find((game) => game.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) ?? null;
  const snapshot = await getDocs(query(collection(db, "games"), where("titleKey", "==", title), limit(1)));
  if (snapshot.empty) return null;
  const game = mapGame(snapshot.docs[0]);
  return { ...game, coverUrl: await coverUrl(game.coverPath) };
}

export async function createOrUpdateGameDraft(input: GameDraftInput): Promise<{
  gameId: string;
  buildPath: string;
  coverPath: string;
}> {
  if (!functions) throw new Error("Firebase Functions 설정이 아직 연결되지 않았습니다.");
  const callable = httpsCallable<GameDraftInput, { gameId: string; buildPath: string; coverPath: string }>(
    functions,
    "createOrUpdateGameDraft",
  );
  return (await callable(input)).data;
}

/** Admin-only: the emails a private game is shared with. */
export async function getGameAllowlist(gameId: string): Promise<string[]> {
  if (!db) return [];
  const snapshot = await getDoc(doc(db, "gameAllowlists", gameId));
  const emails = snapshot.data()?.emails;
  return Array.isArray(emails) ? emails.map(String) : [];
}

async function callAdmin<Input, Output>(name: string, input: Input): Promise<Output> {
  if (!functions) throw new Error("Firebase Functions 설정이 아직 연결되지 않았습니다.");
  return (await httpsCallable<Input, Output>(functions, name)(input)).data;
}

export function updateGameMeta(input: GameMetaInput): Promise<{ ok: boolean }> {
  return callAdmin("updateGameMeta", input);
}

export function deleteGame(gameId: string): Promise<{ ok: boolean }> {
  return callAdmin("deleteGame", { gameId });
}

export function getStorageReport(): Promise<StorageReport> {
  return callAdmin("storageReport", {});
}

export function deleteStorageOrphans(paths: string[]): Promise<{ deleted: number }> {
  return callAdmin("deleteStorageOrphans", { paths });
}

/** Upload API keys. The server keeps only hashes, so a key is shown once, right after it is issued. */
export interface ApiKeyInfo {
  id: string;
  label: string;
  preview: string;
  source: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  return (await callAdmin<Record<string, never>, { keys: ApiKeyInfo[] }>("listApiKeys", {})).keys;
}

export function createApiKey(label: string): Promise<{ key: string; label: string }> {
  return callAdmin("createApiKey", { label });
}

export function revokeApiKey(id: string): Promise<{ ok: boolean }> {
  return callAdmin("revokeApiKey", { id });
}

export function describeCliLogin(code: string): Promise<{ userCode: string; label: string; expiresAt: string }> {
  return callAdmin("describeCliLogin", { code });
}

export function approveCliLogin(code: string, approve: boolean): Promise<{ ok: boolean; label: string }> {
  return callAdmin("approveCliLogin", { code, approve });
}

export async function uploadFile(
  path: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (!storage) throw new Error("Firebase Storage 설정이 아직 연결되지 않았습니다.");
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage!, path), file, { contentType: file.type });
    task.on(
      "state_changed",
      (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
      reject,
      () => resolve(),
    );
  });
}

export async function createPost(text: string, hasImage: boolean, gameId?: string): Promise<{ postId: string; imagePath?: string }> {
  if (!functions) throw new Error("Firebase Functions 설정이 아직 연결되지 않았습니다.");
  const callable = httpsCallable<{ text: string; hasImage: boolean; gameId?: string }, { postId: string; imagePath?: string }>(
    functions,
    "createPost",
  );
  return (await callable({ text, hasImage, ...(gameId ? { gameId } : {}) })).data;
}

export async function toggleLike(targetType: TargetType, targetId: string): Promise<{ liked: boolean; likeCount: number }> {
  if (!functions) throw new Error("Firebase Functions 설정이 아직 연결되지 않았습니다.");
  const callable = httpsCallable<
    { targetType: TargetType; targetId: string },
    { liked: boolean; likeCount: number }
  >(functions, "toggleLike");
  return (await callable({ targetType, targetId })).data;
}

export async function deletePost(postId: string): Promise<void> {
  if (!functions) throw new Error("Firebase Functions 설정이 아직 연결되지 않았습니다.");
  await httpsCallable<{ postId: string }, { deleted: boolean }>(functions, "deletePost")({ postId });
}

export async function deleteComment(commentId: string): Promise<void> {
  if (!functions) throw new Error("Firebase Functions 설정이 아직 연결되지 않았습니다.");
  await httpsCallable<{ commentId: string }, { deleted: number }>(functions, "deleteComment")({ commentId });
}

export async function createComment(
  targetType: TargetType,
  targetId: string,
  text: string,
  parentId?: string,
): Promise<{ commentId: string }> {
  if (!functions) throw new Error("Firebase Functions 설정이 아직 연결되지 않았습니다.");
  const callable = httpsCallable<
    { targetType: TargetType; targetId: string; text: string; parentId?: string },
    { commentId: string }
  >(functions, "createComment");
  return (await callable({ targetType, targetId, text, parentId })).data;
}

/** Returns the game's view total, counting this visit once per tab; null when the count is unavailable. */
export async function recordGameView(game: Game): Promise<number | null> {
  if (!functions) return game.demoViewCount ?? null;
  const callable = httpsCallable<{ gameId: string; countView: boolean }, { viewCount: number }>(functions, "recordGameView");
  try {
    return await trackGameView(game.id, async (countView) => (await callable({ gameId: game.id, countView })).data.viewCount);
  } catch {
    // The count is decorative, so a failure must never disturb the game page.
    return null;
  }
}

export async function getPlaySession(gameId: string): Promise<{ playUrl?: string; playPath?: string }> {
  if (!functions) return {};
  const callable = httpsCallable<{ gameId: string }, { playUrl?: string; playPath?: string }>(functions, "getPlaySession");
  const result = (await callable({ gameId })).data;
  if (result.playUrl || !result.playPath || !appConfig.functionsBaseUrl) return result;
  return { ...result, playUrl: `${appConfig.functionsBaseUrl}/playGateway${result.playPath}` };
}

export function authStateSubscription(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  return auth?.currentUser ?? null;
}

export function getDisplayName(user: User | null): string {
  return user?.displayName ?? user?.email ?? "visitor";
}

export async function uploadBoardImage(postId: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
  await uploadFile(`board-images/${postId}/image`, file, onProgress);
}

export function getConfiguredYoutubeUrl(): string {
  return appConfig.youtubeUrl;
}

export function getConfiguredDiscordUrl(): string | null {
  return appConfig.discordUrl;
}
