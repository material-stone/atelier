// Pulls the games that are live on the Atelier hub right now (Firestore + Storage covers),
// so the video always shows the current catalogue, access levels and cover art.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  (await readFile(path.join(root, "..", ".env"), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const projectId = env.VITE_FIREBASE_PROJECT_ID;
const bucket = env.VITE_FIREBASE_STORAGE_BUCKET;
const apiKey = env.VITE_FIREBASE_API_KEY;
if (!projectId || !bucket || !apiKey) throw new Error("../.env에 Firebase 프로젝트, 버킷, API 키가 필요합니다.");

const response = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "games" }],
        where: { fieldFilter: { field: { fieldPath: "buildStatus" }, op: "EQUAL", value: { stringValue: "published" } } },
      },
    }),
  },
);
if (!response.ok) throw new Error(`Firestore 조회 실패: ${response.status} ${await response.text()}`);

function plain(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(plain);
  return undefined;
}

const coversDir = path.join(root, "public", "covers");
await mkdir(coversDir, { recursive: true });
await mkdir(path.join(root, "public", "data"), { recursive: true });

const games = [];
for (const row of await response.json()) {
  if (!row.document) continue;
  const fields = row.document.fields;
  const id = row.document.name.split("/").pop();
  const coverPath = plain(fields.coverPath);
  let cover;
  if (coverPath) {
    const coverResponse = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(coverPath)}?alt=media`);
    if (coverResponse.ok) {
      const type = coverResponse.headers.get("content-type") ?? "";
      const ext = type.includes("webp") ? "webp" : type.includes("jpeg") ? "jpg" : "png";
      cover = `covers/${id}.${ext}`;
      await writeFile(path.join(root, "public", cover), Buffer.from(await coverResponse.arrayBuffer()));
    } else {
      console.warn(`표지를 받지 못했습니다: ${plain(fields.title)} (${coverResponse.status})`);
    }
  }
  games.push({
    id,
    title: plain(fields.title),
    accessLevel: plain(fields.accessLevel),
    genres: plain(fields.genres) ?? [],
    description: plain(fields.description) ?? "",
    createdAt: plain(fields.createdAt),
    cover,
  });
}

games.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
await writeFile(
  path.join(root, "public", "data", "games.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), games }, null, 2),
);
for (const game of games) console.log(`${game.accessLevel.padEnd(10)} ${game.title}`);
console.log(`게임 ${games.length}개를 저장했습니다.`);
