// Copies games, covers, builds and Google users from the old shit-game-gallery Firebase project into Atelier.
// Dry run by default; pass --apply to write. Deploy Atelier Functions first: builds go through processBuildZip.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const usage = "Usage: npm run migrate-gallery -- --source-key=path/to/old-service-account.json --target-project=NEW_PROJECT_ID --target-bucket=NEW_BUCKET [--target-key=path] [--apply]";
if (!args["source-key"] || !args["target-project"] || !args["target-bucket"]) {
  console.error(usage);
  process.exit(1);
}
const apply = args.apply === true;

const sourceKey = JSON.parse(readFileSync(String(args["source-key"]), "utf8"));
const source = initializeApp({ credential: cert(sourceKey) }, "source");
const target = initializeApp({
  credential: args["target-key"] ? cert(JSON.parse(readFileSync(String(args["target-key"]), "utf8"))) : applicationDefault(),
  projectId: String(args["target-project"]),
}, "target");
if (sourceKey.project_id === args["target-project"]) {
  console.error("Source and target are the same project. Aborting.");
  process.exit(1);
}

const sourceDb = getFirestore(source);
const targetDb = getFirestore(target);
const sourceBucket = getStorage(source).bucket(String(args["source-bucket"] ?? `${sourceKey.project_id}.appspot.com`));
const targetBucket = getStorage(target).bucket(String(args["target-bucket"]));
const normalizeTitle = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");

console.log(`${apply ? "APPLY" : "DRY RUN"}: ${sourceKey.project_id} → ${args["target-project"]} (${targetBucket.name})\n`);

async function migrateUsers() {
  const { users } = await getAuth(source).listUsers(1000);
  const toImport = [];
  for (const user of users) {
    const exists = await getAuth(target).getUser(user.uid).then(() => true, () => false);
    if (exists) {
      console.log(`  user ${user.email}: already in target, skipped`);
      continue;
    }
    toImport.push({
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoURL,
      disabled: user.disabled,
      metadata: { creationTime: user.metadata.creationTime, lastSignInTime: user.metadata.lastSignInTime },
      providerData: user.providerData.map((provider) => ({
        uid: provider.uid,
        providerId: provider.providerId,
        email: provider.email,
        displayName: provider.displayName,
        photoURL: provider.photoURL,
      })),
    });
    console.log(`  user ${user.email}: will import (providers: ${user.providerData.map((p) => p.providerId).join(", ")})`);
  }
  if (apply && toImport.length) {
    const result = await getAuth(target).importUsers(toImport);
    console.log(`  imported ${result.successCount}, failed ${result.failureCount}`);
    result.errors.forEach((error) => console.log(`  ! ${toImport[error.index]?.email}: ${error.error.message}`));
  }
  const tiers = (await sourceDb.collection("users").get()).docs.map((doc) => doc.get("tier"));
  console.log(`  old tier cache: ${tiers.join(", ") || "none"} (not migrated — users re-verify; grant members with set-member)`);
}

async function migrateGames() {
  const games = (await sourceDb.collection("games").orderBy("createdAt", "asc").get()).docs;
  const report = [];
  for (const game of games) {
    const data = game.data();
    const gameId = game.id;
    const label = `${data.title} (${gameId})`;
    if ((await targetDb.doc(`games/${gameId}`).get()).exists) {
      report.push(`  ${label}: already in target, skipped`);
      continue;
    }
    if ((data.source ?? "storage") !== "storage") {
      report.push(`  ${label}: external ${data.type} build (${data.fileUrl}) — not a ZIP, re-upload manually`);
      continue;
    }
    const [buildFiles] = await sourceBucket.getFiles({ prefix: `games/${gameId}/` });
    const zip = buildFiles.find((file) => file.name.endsWith(".zip"));
    if (!zip) {
      report.push(`  ${label}: no ZIP under games/${gameId}/ — skipped`);
      continue;
    }
    const cover = sourceBucket.file(`thumbnails/${gameId}`);
    const [hasCover] = await cover.exists();
    const accessLevel = data.earlyAccess ? "member" : String(args["default-access"] ?? "member");
    const versionId = randomUUID();
    report.push(`  ${label}: ${accessLevel}, build ${zip.name}${hasCover ? ", cover" : ", no cover"}`);
    if (!apply) continue;

    if (hasCover) {
      const [coverBytes] = await cover.download();
      const [coverMeta] = await cover.getMetadata();
      await targetBucket.file(`game-covers/${gameId}/cover`).save(coverBytes, { resumable: false, metadata: { contentType: coverMeta.contentType ?? "image/png" } });
    }
    await targetDb.doc(`games/${gameId}`).set({
      title: data.title,
      titleKey: normalizeTitle(data.title),
      description: data.description ?? "",
      genres: Array.isArray(data.tags) ? data.tags.slice(0, 8) : [],
      accessLevel,
      stage: "prototype",
      coverPath: `game-covers/${gameId}/cover`,
      buildVersionId: versionId,
      buildStatus: "processing",
      buildRoot: `game-builds/${gameId}/${versionId}`,
      likeCount: 0,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      migratedFrom: { project: sourceKey.project_id, type: data.type ?? "html" },
    });
    // Uploading here triggers processBuildZip in the target project, which publishes the game.
    const [zipBytes] = await zip.download();
    await targetBucket.file(`incoming-builds/migration/${gameId}/${versionId}.zip`).save(zipBytes, { resumable: false, metadata: { contentType: "application/zip" } });
  }
  report.forEach((line) => console.log(line));
}

console.log("[auth users]");
await migrateUsers();
console.log("\n[games]");
await migrateGames();
console.log(apply
  ? "\nDone. Check Admin → Manage games: each game should move from PROCESSING to PUBLISHED."
  : "\nNothing written. Re-run with --apply to migrate.");
