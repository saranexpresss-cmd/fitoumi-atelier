// Rendu d'une vidéo sans écran (GitHub Actions ou PC) : node rendu.mjs scenarios/<fichier>.json
// Lance le studio local, ouvre le moteur dans un Chrome invisible (3D calculée par le processeur), attend le MP4.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import "./studio-serveur.mjs"; // serveur du studio sur le port 8792

const fichier = process.argv[2];
if (!fichier || !fs.existsSync(fichier)) { console.error("Usage : node rendu.mjs scenarios/<fichier>.json"); process.exit(2); }
const scenario = `/pub/${path.relative(path.dirname(fileURLToPath(import.meta.url)), path.resolve(fichier)).replace(/\\/g, "/")}`;

const navigateur = await chromium.launch({
  channel: process.env.CHROME_CANAL || undefined, // « chrome » sur le PC ; Chromium de Playwright sur GitHub
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await navigateur.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error") console.error("page :", m.text()); });
let erreurPage = "";
page.on("pageerror", (e) => { console.error("erreur page :", e.message); erreurPage = e.message; });
const debut = Date.now();
await page.goto(`http://localhost:8792/www/studio-video.html?scenario=${encodeURIComponent(scenario)}&rendu=1`);
let dernier = "";
while (!(await page.evaluate(() => window.fini === true))) {
  const e = await page.evaluate(() => document.getElementById("etat")?.textContent || "");
  if (e !== dernier) { console.log(e); dernier = e; }
  if (erreurPage) { console.error("❌ Arrêt : " + erreurPage); await navigateur.close(); process.exit(1); }
  if (Date.now() - debut > 100 * 60000) { console.error("Délai dépassé"); process.exit(1); }
  await new Promise((ok) => setTimeout(ok, 5000));
}
const r = await page.evaluate(() => window.resultat);
await navigateur.close();
console.log(r.ok ? `✅ ${r.fichier} (${(r.taille / 1e6).toFixed(1)} Mo) en ${Math.round((Date.now() - debut) / 60000)} min` : `❌ ${r.journal}`);
process.exit(r.ok ? 0 : 1);
