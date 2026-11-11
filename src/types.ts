import type { Timestamp } from "firebase/firestore";

/** Who may play a game. Games saved before the stage split may still carry the retired "login" or "subscriber" level; read them through normalizeAccessLevel. */
export type AccessLevel = "public" | "member" | "private";
/** How far along a game is. Only a label: access is decided by AccessLevel alone. */
export type GameStage = "release" | "demo" | "prototype";
export type UserRole = "user" | "admin";
export type BuildStatus = "processing" | "published" | "failed";
export type TargetType = "post" | "game";

export interface Game {
  id: string;
  title: string;
  titleKey: string;
  description: string;
  coverPath?: string;
  coverUrl?: string;
  genres: string[];
  accessLevel: AccessLevel;
  stage: GameStage;
  buildVersionId: string;
  buildStatus: BuildStatus;
  buildRoot?: string;
  buildError?: string;
  pendingVersionId?: string;
  likeCount: number;
  /** Demo mode only: path under the site base that serves a bundled build. */
  demoPlayPath?: string;
  /** Demo mode only: stands in for the count kept in gameStats/{id}. */
  demoViewCount?: number;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  role: UserRole;
  youtubeVerifiedUntil?: Timestamp | Date | null;
  memberUntil?: Timestamp | Date | null;
}

export interface Post {
  id: string;
  text: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  /** The one game this post links to, if any. */
  gameId?: string | null;
  authorId: string;
  authorName: string;
  likeCount: number;
  commentCount: number;
  monthKey: string;
  retentionStatus: "pending" | "preserved";
  createdAt?: Timestamp | Date;
}

export interface Comment {
  id: string;
  targetType: TargetType;
  targetId: string;
  parentId?: string | null;
  depth: 0 | 1;
  text: string;
  authorId: string;
  authorName: string;
  createdAt?: Timestamp | Date;
}

export interface AuthState {
  user: import("firebase/auth").User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  isSubscriber: boolean;
  isMember: boolean;
  loading: boolean;
}

export interface GameDraftInput {
  title: string;
  description: string;
  genres: string[];
  accessLevel: AccessLevel;
  stage: GameStage;
  /** Only for private games: who may see and play it. */
  allowedEmails?: string[];
  existingGameId?: string;
}

export interface GameMetaInput {
  gameId: string;
  title: string;
  description: string;
  genres: string[];
  accessLevel: AccessLevel;
  stage: GameStage;
  allowedEmails?: string[];
}

export interface StorageReport {
  totalBytes: number;
  fileCount: number;
  byPrefix: Record<string, { bytes: number; files: number }>;
  orphanedPaths: string[];
  gamesWithoutBuild: string[];
}
