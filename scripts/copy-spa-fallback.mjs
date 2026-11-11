import { copyFile, mkdir } from "node:fs/promises";

// GitHub Pages serves 404.html for unknown paths, so deep links still load the app, but with a 404 status.
await copyFile("dist/index.html", "dist/404.html");

// Pages that outside crawlers must see as 200 (Google OAuth verification checks the homepage and privacy policy).
for (const route of ["about", "privacy"]) {
  await mkdir(`dist/${route}`, { recursive: true });
  await copyFile("dist/index.html", `dist/${route}/index.html`);
}
