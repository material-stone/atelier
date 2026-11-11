// Splits each game's old access level into a stage label and the new access level.
//   public → release/public, login → demo/public, subscriber → prototype/member,
//   member → prototype/member, private → prototype/private (a stage already set is kept).
// Held updates in pendingGameUpdates are rewritten too, so a build that publishes later cannot bring an old level back.
// Dry run by default; pass --apply to write.
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
if (!getApps().length) initializeApp();
const db = getFirestore();

const STAGES = new Set(["release", "demo", "prototype"]);
const NEW_LEVEL = { public: "public", login: "public", subscriber: "member", member: "member", private: "private" };
const DEFAULT_STAGE = { public: "release", login: "demo", subscriber: "prototype", member: "prototype", private: "prototype" };

/** The fields to change on a game (or held meta), or null when it is already migrated. */
function migrated(data) {
  const level = data?.accessLevel;
  if (!(level in NEW_LEVEL)) return null;
  const accessLevel = NEW_LEVEL[level];
  const stage = STAGES.has(data.stage) ? data.stage : DEFAULT_STAGE[level];
  return accessLevel === level && stage === data.stage ? null : { accessLevel, stage };
}

console.log(apply ? "APPLY\n" : "DRY RUN (pass --apply to write)\n");
let changed = 0;

for (const game of (await db.collection("games").get()).docs) {
  const next = migrated(game.data());
  if (!next) continue;
  changed += 1;
  console.log(`game  ${String(game.get("title") ?? game.id).padEnd(32)} ${game.get("accessLevel")} → ${next.stage} / ${next.accessLevel}`);
  // updatedAt stays as it is so the game list keeps its order.
  if (apply) await game.ref.update(next);
}

for (const pending of (await db.collection("pendingGameUpdates").get()).docs) {
  const meta = pending.get("meta");
  const next = migrated(meta);
  if (!next) continue;
  changed += 1;
  console.log(`held  ${String(meta?.title ?? pending.id).padEnd(32)} ${meta.accessLevel} → ${next.stage} / ${next.accessLevel}`);
  if (apply) await pending.ref.update({ "meta.accessLevel": next.accessLevel, "meta.stage": next.stage, migratedAt: FieldValue.serverTimestamp() });
}

console.log(`\n${changed} document(s) ${apply ? "updated" : "would change"}.`);
