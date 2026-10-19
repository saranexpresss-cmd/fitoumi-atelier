// Dossier payé d'un client Nina Architecture, sans écran : node dossier-maison.mjs scenarios/<id>.json
// Produit dans livraison/ : plan coté (PDF), fiche technique (PDF), jamais d'estimation du coût de construction ; pour les packs 3D : 4 images HD ; Premium : dossier de présentation complet.
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
  .plan svg { width: 100%; height: auto; max-height: 168mm; display: block; } .plan svg + svg { page-break-before: always; break-before: page; margin-top: 8mm; }
  .photo { width: 100%; border-radius: 4px; margin: 6px 0; } .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .planche svg { width: 100%; height: auto; max-height: 150mm; display: block; margin: 0 auto; } .legende { columns: 2; font-size: 9pt; margin: 6px 0; padding-left: 18px; } .legende li { margin: 2px 0; }
  .couverture { height: 260mm; display: flex; flex-direction: column; justify-content: center; } .couverture h1 { font-size: 34pt; }
</style>`;
const tete = (titre) => `<div class="tete"><b><img src="https://bureau.nina-services.com/marque/nina-services-icone-180.png" style="width:26px;height:26px;border-radius:6px;vertical-align:-6px;margin-right:8px" alt="">NINA ARCHITECTURE</b><span>${esc(titre)}<br>${esc(S.titre)} · ${esc(S.lieu)} · ${date}</span></div>`;
const blocPlan = `${tete(S.plan?.etage ? "Plans du rez-de-chaussée et de l'étage" : "Plan du rez-de-chaussée")}<div class="plan">${S.svg}</div>`;
// Fiche technique : tableau des surfaces, nomenclature des menuiseries, caractéristiques et points de vigilance
const P = S.plan || {}, f2 = (v) => Number(v || 0).toFixed(2).replace(".", ",");
const SOLS = { douche: "Carrelage antidérapant", sdb: "Carrelage antidérapant", wc: "Carrelage", cuisine: "Carrelage", buanderie: "Carrelage", chambre: "Parquet ou carrelage", bureau: "Parquet ou carrelage", salon: "Carrelage grand format", couloir: "Carrelage" };
const pieces = [...(P.pieces || []).map((q) => ({ ...q, nom: P.etage ? `RDC · ${q.nom}` : q.nom })), ...((P.etage?.pieces) || []).map((q) => ({ ...q, nom: `Étage · ${q.nom}` }))].filter((q) => q.type !== "escalier" || !q.nom.startsWith("Étage")).sort((a, b) => (a.type === "couloir") - (b.type === "couloir"));
const ouv = [...(P.ouvertures || []), ...((P.etage?.ouvertures) || [])], grouper = (l) => Object.values(l.reduce((m, o) => { const k = `${o.type}|${o.largeur}|${o.hauteur || ""}|${o.allege || ""}`; (m[k] = m[k] || { ...o, n: 0 }).n++; return m; }, {}));
const NOMS_OUV = { entree: "Porte d'entrée", porte: "Porte intérieure", passage: "Passage libre", fenetre: "Fenêtre", baie: "Baie vitrée coulissante" };
const blocTechnique = `${tete("Fiche technique")}<h1>Fiche technique du plan</h1>
  <p class="doux">${esc(S.titre)} · ${esc(S.lieu)} · surface des pièces ${f2(P.habitable)} m² · emprise au sol ${f2(P.emprise)} m²${P.terrasse ? ` · terrasse couverte ${f2(P.terrasse.surface)} m²` : ""}</p>
  <h2>1. Tableau des surfaces</h2>
  <table><thead><tr><th>Pièce</th><th class="m">Dimensions (m)</th><th class="m">Surface (m²)</th><th>Revêtement de sol conseillé</th></tr></thead><tbody>
  ${pieces.map((q) => `<tr><td>${esc(q.nom)}</td><td class="m">${f2(q.w)} × ${f2(q.h)}</td><td class="m">${f2(q.surface)}</td><td>${SOLS[q.type] || "Carrelage"}</td></tr>`).join("")}
  <tr class="total"><td>Total des pièces</td><td></td><td class="m">${f2(P.habitable)}</td><td></td></tr></tbody></table>
  <h2>2. Nomenclature des menuiseries</h2>
  <table><thead><tr><th>Type</th><th class="m">Quantité</th><th class="m">Largeur (m)</th><th class="m">Hauteur (m)</th><th class="m">Allège (m)</th></tr></thead><tbody>
  ${grouper(ouv).sort((a, b) => a.type.localeCompare(b.type)).map((o) => `<tr><td>${NOMS_OUV[o.type] || o.type}</td><td class="m">${o.n}</td><td class="m">${f2(o.largeur)}</td><td class="m">${o.type === "fenetre" ? f2(o.hauteur || 1.2) : o.type === "baie" ? "2,30" : o.type === "passage" ? "—" : "2,15"}</td><td class="m">${o.type === "fenetre" ? f2(o.allege || 1) : "—"}</td></tr>`).join("")}</tbody></table>
  <h2>3. Caractéristiques de construction (hypothèses de l'esquisse)</h2>
  <ul><li>Murs extérieurs : 20 cm (agglos ou briques, enduit deux faces) · cloisons intérieures : 15 cm</li>
  <li>Hauteur sous plafond : ${f2((P.hauteur || 3) - 0.2)} m · dalle ou charpente selon la toiture retenue</li>${P.etage ? `<li>Maison à étage (R+1) : structure en béton armé (poteaux, poutres, dalle pleine ou à corps creux) à dimensionner par un bureau d'études ; escalier en U de 2,40 m de large</li>` : ""}
  <li>Dimensions hors tout de la maison : ${f2(P.largeur)} m × ${f2(P.profondeur)} m${P.terrasse ? `, plus terrasse de ${f2(P.terrasse.w)} × ${f2(P.terrasse.h)} m en façade` : ""}</li>
  <li>Ventilation : ouvertures sur deux façades opposées dans les pièces de vie quand c'est possible</li></ul>
  <h2>4. À vérifier avant de construire</h2>
  <ul><li>Implantation exacte sur le terrain et limites de la parcelle : par un géomètre</li>
  <li>Nature du sol et fondations : étude de sol recommandée, dimensionnement par un bureau d'études</li>
  <li>Règles d'urbanisme locales (reculs, hauteur, emprise) et permis de construire : dossier à faire établir ou viser par un architecte agréé quand la loi l'exige</li>
  <li>Réseaux : eau, électricité, assainissement (fosse septique ou raccordement)</li></ul>
  <p class="note">Les cotes sont en mètres et à vérifier sur le terrain avant toute exécution. Document établi à partir de l'esquisse Nina Architecture.</p>`;
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
  <p class="note">Devis estimatif et non contractuel, établi à partir de prix de référence du pays du terrain. Les prix réels dépendent du sol, de la région, des entreprises et des matériaux : demandez plusieurs devis d'entreprises. ${esc(d.architecte || "")}</p>${mentions}` : "";
// Mentions légales (registre du commerce) en pied des devis et factures
const E = S.entreprise || {};
const mentions = `<p class="note" style="border-top:1px solid #E2E8F0;padding-top:6px">${esc(E.nom || "Nina Services")} · ${esc(E.titulaire || "")} · RCCM ${esc(E.rccm || "")}${E.ncc ? ` · NCC ${esc(E.ncc)}` : ""} · ${esc(E.adresse || "")} · ${esc(E.telephone || "")} · ${esc(E.email || "")} · ${esc(E.site || "")}</p>`;
// Concept et innovations de Yao
const C = S.concept || {}, COUT = { "économie": "💚 économie", neutre: "⚪ coût neutre", "léger surcoût": "🟡 léger surcoût", "surcoût": "🟠 surcoût" };
const blocConcept = C.innovations?.length ? `${tete("Concept et innovations")}<h1>${C.concept?.nom ? `Concept « ${esc(C.concept.nom)} »` : "Nos innovations pour votre maison"}</h1>
  ${C.concept?.idee ? `<p style="font-size:12.5pt;line-height:1.5">${esc(C.concept.idee)}</p>` : ""}
  ${C.innovations.map((i, n) => `<div style="border-left:4px solid #0EA5E9;padding:6px 12px;margin:12px 0;break-inside:avoid"><h2 style="margin:0 0 4px">${n + 1}. ${esc(i.titre)} <small class="doux" style="font-size:9pt;font-weight:500">${esc(COUT[i.cout] || i.cout)}</small></h2><p style="margin:2px 0">${esc(i.description)}</p><p style="margin:2px 0"><b>Pour vous :</b> ${esc(i.benefice)}</p></div>`).join("")}
  <p class="note">Propositions de Yao, architecte IA de Nina Architecture, à valider avec un architecte agréé et les entreprises selon le sol et les règles locales.</p>` : "";
const pdf = async (nom, corps, paysage = false) => {
  await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8">${STYLE}</head><body>${corps}</body></html>`, { waitUntil: "load" });
  await page.pdf({ path: path.join(sortie, nom), format: "A4", landscape: paysage, printBackground: true });
  console.log(`✅ ${nom}`);
};
await pdf("01-plan-cote.pdf", blocPlan, true);
await pdf("02-fiche-technique.pdf", blocTechnique + mentions);
// Planches du dossier (façades, coupe, toiture, structure, électricité, plomberie, plan de masse, menuiseries), calculées par le serveur
const tableau = (t) => t ? `<table><thead><tr>${t.tetes.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${t.lignes.map((l) => `<tr>${l.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
const legende = (l) => l ? `<ul class="legende">${l.map(([t, s]) => `<li><b>${esc(s)}</b> ${esc(t)}</li>`).join("")}</ul>` : "";
for (const P of S.planches || []) {
  const pages = P.pages.map((g, i) => `<div class="${i ? "saut" : ""}">${tete(P.titre)}${g.sous ? `<h2 style="margin-top:0">${esc(g.sous)}</h2>` : ""}<div class="planche">${g.svg}</div>${legende(g.legende)}</div>`).join("");
  await pdf(P.fichier, `${pages}${P.tableau ? `<div class="saut">${tete(P.titre)}<h2>Récapitulatif</h2>${tableau(P.tableau)}</div>` : ""}${P.note ? `<p class="note">${esc(P.note)}</p>` : ""}${mentions}`, true);
}
// Plan de situation : le terrain repéré par le client sur l'imagerie satellite
if (S.situation?.tuiles) {
  const t = S.situation;
  await pdf("12-plan-de-situation.pdf", `${tete("Plan de situation")}<div style="position:relative;width:768px;height:768px;margin:0 auto;overflow:hidden;border:1px solid #0F172A">${t.tuiles.map((u) => `<img src="${u.url}" style="position:absolute;left:${u.x}px;top:${u.y}px;width:256px;height:256px">`).join("")}<div style="position:absolute;left:${t.px - 14}px;top:${t.py - 34}px;font-size:34px">📍</div></div>
    <p class="doux" style="text-align:center">${esc(t.legende || S.lieu)} · imagerie satellite © Esri · position indiquée par le client</p>${mentions}`);
}
// Rendus 3D : les images de la maison (photos réalistes ou maquette)
const rendus = [...(S.perspectives || []), ...photos.map((p) => p.data)];
if (rendus.length) await pdf("13-rendus-3d.pdf", rendus.map((src, i) => `<div class="${i ? "saut" : ""}">${tete("Rendus 3D")}<img class="photo" src="${src}"></div>`).join("") + `<p class="note">Images d'illustration réalisées à partir de la maquette 3D du plan : matériaux, végétation et décoration sont des suggestions.</p>${mentions}`, true);
if (d) await pdf("devis-detaille.pdf", blocDevis);
if (blocConcept) await pdf("concept-innovations.pdf", blocConcept);
// Facture de chaque commande payée
for (const k of S.commandes || []) {
  const fcfa = (n) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} FCFA`;
  await pdf(`facture-${k.id.toLowerCase()}.pdf`, `<div class="tete"><b>${esc(E.nom || "NINA SERVICES")}</b><span>Nina Architecture<br>${esc(E.adresse || "")}</span></div>
    <h1>Facture n° ${esc(k.id)}</h1><p class="doux">Date : ${new Date(k.payee || Date.now()).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · Payée${k.moyen ? ` (${esc(k.moyen)})` : ""}</p>
    <p><b>Client :</b> ${esc(S.donnees?.nom || "Client")}<br><b>Projet :</b> ${esc(S.titre)} · ${esc(S.lieu)}</p>
    <table><thead><tr><th>Désignation</th><th class="m">Montant</th></tr></thead><tbody>
      <tr><td>${esc(k.nom || k.offre)} : conception d'esquisse architecturale et dossier numérique (plan coté, fiche technique${k.offre !== "plan" ? ", images 3D, film de visite" : ""})</td><td class="m">${fcfa(k.prix || k.montant)}</td></tr>
      ${k.remise ? `<tr><td>Remise commerciale (${k.remise} %)</td><td class="m">− ${fcfa((k.prix || k.montant) - k.montant)}</td></tr>` : ""}
      <tr class="total"><td>Net payé</td><td class="m">${fcfa(k.montant)}</td></tr></tbody></table>
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:18px;margin-top:26px"><div style="text-align:right;font-size:10pt">Fait à Daloa, le ${new Date(k.payee || Date.now()).toLocaleDateString("fr-FR")}<br>${E.signature ? `<img src="${E.signature}" style="width:150px;display:block;margin:4px 0 0 auto" alt="">` : ""}<b>Mohamed Bassirou Fofana</b><br>Fondateur, Nina Services</div><img src="https://bureau.nina-services.com/marque/cachet.png" style="width:118px;height:118px;opacity:.9" alt="Cachet Nina Services"></div>
    <p class="note">Esquisse indicative non contractuelle : le dossier de permis de construire doit être établi ou visé par un architecte agréé lorsque la loi l'exige.</p>${mentions}`);
}
if (S.pack === "premium") {
  const images = photos.map((p) => `<img class="photo" src="${p.data}">`);
  await pdf("dossier-complet.pdf", `<div class="couverture"><p class="doux">NINA ARCHITECTURE · DOSSIER DE PRÉSENTATION</p><h1>${esc(S.titre)}</h1><p style="font-size:14pt">${esc(S.lieu)}</p>${images[0] || ""}<p class="doux">${date} · esquisse non contractuelle, à faire valider et signer par un architecte agréé pour le permis de construire.</p></div>
    <div class="saut">${tete("Perspectives 3D")}<div class="grille">${images.slice(1).join("")}</div></div>
    ${blocConcept ? `<div class="saut">${blocConcept}</div>` : ""}<div class="saut">${blocPlan}</div><div class="saut">${blocTechnique}</div><div class="saut">${blocDevis}</div>`);
}
await navigateur.close();
process.exit(0);
