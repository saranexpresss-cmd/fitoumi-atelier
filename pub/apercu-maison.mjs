// Aperçu d'une esquisse AVANT achat (envoyé au client sur WhatsApp), sans écran : node apercu-maison.mjs scenarios/<id>.json
// Produit dans livraison/ : apercu-plan.png (plan flouté, sans cotes, avec filigrane : rien d'exploitable pour construire)
// et apercu-3d-1.jpg / apercu-3d-2.jpg (vues 3D extérieures de SA maison : vue d'ensemble et façade).
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import "./studio-serveur.mjs";

const fichier = process.argv[2];
if (!fichier || !fs.existsSync(fichier)) { console.error("Usage : node apercu-maison.mjs scenarios/<id>.json"); process.exit(2); }
const ici = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(fs.readFileSync(fichier, "utf8"));
const sortie = path.join(ici, "livraison"); fs.mkdirSync(sortie, { recursive: true });

const navigateur = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await navigateur.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("erreur page :", e.message));

// 1. Deux vues 3D extérieures (pas l'intérieur : il fait partie du dossier payé)
const scenario = `/pub/${path.relative(ici, path.resolve(fichier)).replace(/\\/g, "/")}`;
await page.goto(`http://localhost:8792/pub/photos-maison.html?scenario=${encodeURIComponent(scenario)}&prises=vue-ensemble,facade`);
await page.waitForFunction(() => window.fini === true, null, { timeout: 15 * 60000, polling: 1000 });
const photos = await page.evaluate(() => window.photos);
photos.forEach((p, i) => fs.writeFileSync(path.join(sortie, `apercu-3d-${i + 1}.jpg`), Buffer.from(p.data.split(",")[1], "base64")));
console.log(`✅ ${photos.length} vues 3D`);

// 2. Plan protégé : esquisse floutée sans cotes (rendue par le site) + filigrane répété
const filigrane = Array.from({ length: 60 }, (_, i) => `<span style="left:${(i % 6) * 18 - 8}%;top:${Math.floor(i / 6) * 11 - 4}%">APERÇU · NINA ARCHITECTURE</span>`).join("");
const plan = await navigateur.newPage({ viewport: { width: 1400, height: 1000 } });
await plan.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #fff; font-family: "Noto Sans", Arial, sans-serif; }
  .cadre { position: relative; overflow: hidden; }
  .cadre svg { display: block; width: 1400px; height: auto; }
  .f { position: absolute; inset: 0; pointer-events: none; }
  .f span { position: absolute; transform: rotate(-28deg); font-size: 26px; font-weight: 700; letter-spacing: 3px; color: rgba(79, 70, 229, .22); white-space: nowrap; }
  .bandeau { background: #0F172A; color: #fff; padding: 18px 28px; font-size: 22px; }
  .bandeau b { color: #a5b4fc; }
</style></head><body>
  <div class="bandeau"><b>Aperçu protégé</b> · ${String(S.titre || "Votre future maison").replace(/[<>&]/g, "")} — le plan coté complet est livré après l'achat</div>
  <div class="cadre">${S.svg}<div class="f">${filigrane}</div></div>
</body></html>`);
await plan.screenshot({ path: path.join(sortie, "apercu-plan.png"), fullPage: true });
console.log("✅ plan protégé");
await navigateur.close();
