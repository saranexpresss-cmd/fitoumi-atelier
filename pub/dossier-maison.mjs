// Dossier payé d'un client Nina Architecture, sans écran : node dossier-maison.mjs scenarios/<id>.json
// Produit dans livraison/ : plan coté (PDF), devis détaillé (PDF) ; pour les packs 3D : 4 images HD ; Premium : dossier de présentation complet.
// (Le film est tourné ensuite par rendu-maison.mjs pour les packs 3D.)
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import "./studio-serveur.mjs";

const fichier = process.argv[2];
if (!fichier || !fs.existsSync(fichier)) { console.error("Usage : node dossier-maison.mjs scenarios/<id>.json"); process.exit(2); }
const ici = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(fs.readFileSync(fichier, "utf8"));
const sortie = path.join(ici, "livraison"); fs.mkdirSync(sortie, { recursive: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const montant = (n) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} ${S.devis?.devise === "EUR" ? "€" : S.devis?.devise || "FCFA"}`;
const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const avecImages = ["visuel", "premium"].includes(S.pack);

const navigateur = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await navigateur.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("erreur page :", e.message));

// 1. Images 3D (packs 3D et Premium)
let photos = [];
if (avecImages) {
  const scenario = `/pub/${path.relative(ici, path.resolve(fichier)).replace(/\\/g, "/")}`;
  await page.goto(`http://localhost:8792/pub/photos-maison.html?scenario=${encodeURIComponent(scenario)}`);
  await page.waitForFunction(() => window.fini === true, null, { timeout: 30 * 60000, polling: 2000 });
  photos = await page.evaluate(() => window.photos);
  photos.forEach((p, i) => fs.writeFileSync(path.join(sortie, `image-${i + 1}.jpg`), Buffer.from(p.data.split(",")[1], "base64")));
  console.log(`✅ ${photos.length} images 3D`);
}

// 2. PDF
const STYLE = `<style>
  @page { margin: 12mm; } * { box-sizing: border-box; }
  body { font-family: "Noto Sans", Arial, sans-serif; color: #0F172A; margin: 0; font-size: 11pt; }
  .tete { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0F172A; padding-bottom: 6px; margin-bottom: 10px; }
  .tete b { font-size: 16pt; letter-spacing: 2px; } .tete span { color: #475569; font-size: 9pt; text-align: right; }
  h1 { font-size: 20pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 16px 0 6px; } .doux { color: #475569; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; } td, th { border-bottom: 1px solid #E2E8F0; padding: 5px 6px; text-align: left; }
  th { background: #F1F5F9; } .m { text-align: right; white-space: nowrap; } .total td { font-weight: 800; border-top: 2px solid #0F172A; background: #F8FAFC; }
  .note { font-size: 8.5pt; color: #64748B; margin-top: 12px; line-height: 1.4; } .saut { page-break-before: always; break-before: page; }
  .plan svg { width: 100%; height: auto; max-height: 168mm; display: block; }
  .photo { width: 100%; border-radius: 4px; margin: 6px 0; } .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .couverture { height: 260mm; display: flex; flex-direction: column; justify-content: center; } .couverture h1 { font-size: 34pt; }
</style>`;
const tete = (titre) => `<div class="tete"><b>NINA ARCHITECTURE</b><span>${esc(titre)}<br>${esc(S.titre)} · ${esc(S.lieu)} · ${date}</span></div>`;
const blocPlan = `${tete("Plan du rez-de-chaussée")}<div class="plan">${S.svg}</div>`;
const d = S.devis;
const blocDevis = d ? `${tete("Devis estimatif détaillé")}<h1>Devis estimatif · ${esc(d.standing_nom)}</h1>
  <p class="doux">${esc(S.lieu)} · ${esc(d.description)} · montants en ${esc(d.devise)}</p>
  <table><thead><tr><th>Poste</th><th class="m">Montant estimé</th></tr></thead><tbody>
  ${d.lignes.map((l) => `<tr><td>${esc(l.poste)}</td><td class="m">${montant(l.montant)}</td></tr>`).join("")}
  <tr class="total"><td>Total estimatif (hors terrain)</td><td class="m">${montant(d.total)}</td></tr></tbody></table>
  <p><b>Fourchette réaliste :</b> ${montant(d.fourchette[0])} à ${montant(d.fourchette[1])}</p>
  ${d.options?.length ? `<h2>Options (non comprises dans le total)</h2><table><tbody>${d.options.map((l) => `<tr><td>${esc(l.poste)}</td><td class="m">${montant(l.montant)}</td></tr>`).join("")}</tbody></table>` : ""}
  <h2>Quantités repères</h2><table><tbody>${Object.entries(d.quantites || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="m">${esc(v)}</td></tr>`).join("")}</tbody></table>
  <h2>Hypothèses de calcul</h2><ul>${(d.hypotheses || []).map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
  <p class="note">Devis estimatif et non contractuel, établi à partir de prix de référence du pays du terrain. Les prix réels dépendent du sol, de la région, des entreprises et des matériaux : demandez plusieurs devis d'entreprises. ${esc(d.architecte || "")}</p>` : "";
const pdf = async (nom, corps, paysage = false) => {
  await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8">${STYLE}</head><body>${corps}</body></html>`, { waitUntil: "load" });
  await page.pdf({ path: path.join(sortie, nom), format: "A4", landscape: paysage, printBackground: true });
  console.log(`✅ ${nom}`);
};
await pdf("plan-cote.pdf", blocPlan, true);
if (d) await pdf("devis-detaille.pdf", blocDevis);
if (S.pack === "premium") {
  const images = photos.map((p) => `<img class="photo" src="${p.data}">`);
  await pdf("dossier-complet.pdf", `<div class="couverture"><p class="doux">NINA ARCHITECTURE · DOSSIER DE PRÉSENTATION</p><h1>${esc(S.titre)}</h1><p style="font-size:14pt">${esc(S.lieu)}</p>${images[0] || ""}<p class="doux">${date} · esquisse non contractuelle, à faire valider et signer par un architecte agréé pour le permis de construire.</p></div>
    <div class="saut">${tete("Perspectives 3D")}<div class="grille">${images.slice(1).join("")}</div></div>
    <div class="saut">${blocPlan}</div><div class="saut">${blocDevis}</div>`);
}
await navigateur.close();
process.exit(0);
