// Réalisateur automatique : film de visite d'une maison Nina Architecture (1920×1080, 25 images/s, musique originale).
// Exécuté dans un navigateur invisible par l'atelier (GitHub Actions) : chaque image est calculée puis envoyée au serveur local (ffmpeg).
import { afficher3D, THREE } from "./archi/vue3d.js";
import { composer, versWav } from "./studio-musique.js";

// Rendu en 1280 × 720 (le navigateur de l'atelier calcule la 3D sur processeur) ; l'habillage est dessiné dans un repère 1920 × 1080 mis à l'échelle
const L = 1280, H = 720, FPS = 24, K = L / 1920;
const params = new URLSearchParams(location.search), rendu = params.get("rendu") === "1";
const S = await (await fetch(params.get("scenario"))).json();
const etat = (t) => { document.getElementById("etat").textContent = t; };
await Promise.all(["800 60px Jakarta", "600 30px Jakarta", "400 26px Jakarta"].map((f) => document.fonts.load(f).catch(() => {})));

const plan = S.plan, W = plan.largeur, D = plan.profondeur, T = plan.terrasse, R = Math.max(W, D);
const vue = afficher3D(document.getElementById("scene"), plan, { film: true, largeur: L, hauteur: H });
const LIMITE = Number(params.get("limite")) || Infinity; // essais : nombre d'images maximal
const V = (x, y, z) => new THREE.Vector3(x, y, z), C = V(W / 2, 1.4, D / 2), lim = vue.limites, SOL = vue.SOL;
const salon = plan.pieces.find((q) => q.type === "salon") || plan.pieces[0];
const chambres = plan.pieces.filter((q) => q.type === "chambre").length;
const doux = (t) => t * t * (3 - 2 * t), lerp = (a, b, t) => a.clone().lerp(b, t);
const orbite = (angle, rayon, h, centre = C) => V(centre.x + Math.sin(angle) * rayon, h, centre.z - Math.cos(angle) * rayon);
const deg = THREE.MathUtils.degToRad;

// Plans du film : durée, caméra, cible, toit visible, légende
const PLANS = [
  { d: 7, cam: (t) => orbite(deg(-60 + 70 * t), R * 1.75, R * 0.8 + 4), cible: () => C, legende: null },
  { d: 6, cam: (t) => lerp(V(W / 2 - 4, 6.5, lim.avant - 9), V(salon.x + salon.w / 2 - 1.5, SOL + 1.7, (T ? T.y : 0) - 3.2), t), cible: (t) => lerp(V(W / 2, 1.8, D / 3), V(salon.x + salon.w / 2, SOL + 1.6, 1.2), t), legende: T ? `Terrasse couverte · ${fr(T.surface)} m²` : "L'entrée" },
  { d: 6, cam: (t) => lerp(V(salon.x + salon.w / 2 - 0.8, SOL + 1.65, -0.6), V(salon.x + salon.w * 0.45, SOL + 1.6, salon.h * 0.55), t), cible: (t) => lerp(V(salon.x + salon.w * 0.6, SOL + 1.4, salon.h), V(salon.x + salon.w, SOL + 1.3, salon.h * 0.4), t), legende: `${salon.nom} · ${fr(salon.surface)} m²` },
  { d: 6, toit: false, cam: (t) => orbite(deg(-40 + 70 * t), R * 0.55, R * 1.35 + 3), cible: () => V(W / 2, 0, D / 2), legende: `${chambres} chambre${chambres > 1 ? "s" : ""} · ${fr(plan.habitable)} m² de pièces` },
  { d: 6, cam: (t) => orbite(deg(30 + 40 * t), R * (1.6 + 0.5 * t), R * (0.7 + 0.35 * t) + 3), cible: () => C, legende: S.budget ? `Budget estimatif : ${S.budget}` : null, fin: true },
];
const DUREE = PLANS.reduce((s, p) => s + p.d, 0), TOTAL = Math.min(LIMITE, Math.round(DUREE * FPS));
function fr(n) { return String(n).replace(".", ","); }

// Habillage graphique (titres, légendes, logo, carte de fin)
const toile = document.createElement("canvas"); toile.width = L; toile.height = H;
const g = toile.getContext("2d");
const POLICE = (p, t) => `${p} ${t}px Jakarta, "Noto Sans", Arial, sans-serif`;
function logo(x, y, s, alpha = 1) {
  g.save(); g.globalAlpha = alpha;
  const grad = g.createLinearGradient(x, y, x + s, y + s); grad.addColorStop(0, "#6366F1"); grad.addColorStop(1, "#22D3EE");
  g.fillStyle = grad; g.beginPath(); g.roundRect(x, y, s, s, s * 0.22); g.fill();
  g.strokeStyle = "#fff"; g.lineWidth = s * 0.1; g.lineCap = "round"; g.beginPath(); g.moveTo(x + s * 0.31, y + s * 0.75); g.lineTo(x + s * 0.31, y + s * 0.58); g.arc(x + s * 0.5, y + s * 0.58, s * 0.19, Math.PI, 0); g.lineTo(x + s * 0.69, y + s * 0.75); g.stroke();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(x + s * 0.69, y + s * 0.27, s * 0.065, 0, Math.PI * 2); g.fill();
  g.restore();
}
function texte(t, x, y, taille, poids = 600, couleur = "#fff", alpha = 1, align = "left") { g.save(); g.globalAlpha = alpha; g.font = POLICE(poids, taille); g.fillStyle = couleur; g.textAlign = align; g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 12; g.fillText(t, x, y); g.restore(); }
function bandeau(t, alpha) {
  if (!t || alpha <= 0) return;
  g.save(); g.globalAlpha = alpha; g.font = POLICE(600, 34); const l = g.measureText(t).width + 70;
  g.fillStyle = "rgba(11,16,35,.72)"; g.beginPath(); g.roundRect(80, 1080 - 170, l, 76, 16); g.fill();
  const grad = g.createLinearGradient(80, 0, 80 + 8, 0); grad.addColorStop(0, "#6366F1"); grad.addColorStop(1, "#22D3EE"); g.fillStyle = grad; g.fillRect(80, 1080 - 170, 8, 76);
  g.fillStyle = "#fff"; g.fillText(t, 115, 1080 - 120); g.restore();
}

function composerImage(n) {
  const temps = n / FPS; let debut = 0, i = 0;
  while (i < PLANS.length - 1 && temps >= debut + PLANS[i].d) { debut += PLANS[i].d; i++; }
  const p = PLANS[i], loc = Math.min(1, (temps - debut) / p.d), e = doux(loc);
  vue.toit(p.toit !== false);
  vue.image(p.cam(e), p.cible(e), p.fov || 40);
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(vue.canvas, 0, 0, L, H); g.setTransform(K, 0, 0, K, 0, 0);
  // Fondu au noir entre les plans
  const entree = Math.max(0, 1 - (temps - debut) / (i === 0 ? 0.6 : 0.3)), sortie = i === PLANS.length - 1 ? 0 : Math.max(0, 1 - (debut + p.d - temps) / 0.3);
  const fondu = Math.max(entree, sortie);
  if (fondu > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fondu)})`; g.fillRect(0, 0, 1920, 1080); }
  logo(1920 - 150, 50, 90, 0.92);
  const apparition = Math.min(1, (temps - debut - 0.6) / 0.5), disparition = Math.min(1, (debut + p.d - temps - 0.4) / 0.5);
  bandeau(p.legende, Math.max(0, Math.min(apparition, disparition)));
  // Titre d'ouverture
  if (i === 0) {
    const a = Math.max(0, Math.min(1, (temps - 0.6) / 0.8, (6.5 - temps) / 0.8));
    if (a > 0) { const grad = g.createLinearGradient(0, 0, 1920 * 0.7, 0); grad.addColorStop(0, "rgba(11,16,35,.75)"); grad.addColorStop(1, "rgba(11,16,35,0)"); g.save(); g.globalAlpha = a; g.fillStyle = grad; g.fillRect(0, 1080 * 0.32, 1920 * 0.7, 1080 * 0.38); g.restore();
      texte("NINA ARCHITECTURE PRÉSENTE", 110, 1080 * 0.42, 28, 700, "#A5F3FC", a); texte(S.titre || "Votre future maison", 110, 1080 * 0.52, 76, 800, "#fff", a); texte(S.lieu || "", 110, 1080 * 0.6, 34, 500, "#E2E8F0", a); }
  }
  // Carte de fin
  if (p.fin) {
    const a = Math.max(0, Math.min(1, (temps - (debut + p.d - 3.6)) / 0.8));
    if (a > 0) { g.save(); g.globalAlpha = a * 0.86; g.fillStyle = "#0B1023"; g.fillRect(0, 0, 1920, 1080); g.restore();
      logo(960 - 70, 1080 * 0.22, 140, a); texte("Nina Architecture", 960, 1080 * 0.5, 72, 800, "#fff", a, "center");
      texte("Votre maison, dessinée en quelques minutes", 960, 1080 * 0.58, 36, 500, "#C7D2FE", a, "center");
      texte("archi.nina-services.com", 960, 1080 * 0.68, 40, 700, "#22D3EE", a, "center");
      texte("Maquette et estimation indicatives · plans à valider par un architecte agréé", 960, 1080 * 0.88, 22, 400, "#94A3B8", a, "center"); }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return toile;
}

window.composerImage = composerImage; // aperçu manuel dans un navigateur
if (rendu) {
  etat(`Musique (${DUREE} s)…`);
  await fetch(`/audio?video=${S.id}`, { method: "POST", body: versWav(await composer(DUREE, { graine: S.graine || 1 })) });
  for (let n = 0; n < TOTAL; n++) {
    composerImage(n);
    const blob = await new Promise((ok) => toile.toBlob(ok, "image/jpeg", 0.9));
    await fetch(`/image?video=${S.id}&n=${n}`, { method: "POST", body: blob });
    if (n % 50 === 0) etat(`Image ${n} / ${TOTAL}`);
  }
  etat("Assemblage du MP4…");
  window.resultat = await (await fetch(`/fin?video=${S.id}`, { method: "POST" })).json();
  window.fini = true;
  etat(window.resultat.ok ? `Terminé : ${(window.resultat.taille / 1e6).toFixed(1)} Mo` : `Échec : ${window.resultat.journal}`);
} else { composerImage(Math.round(FPS * 3)); document.body.appendChild(toile); toile.style.width = "100%"; etat("Aperçu (image à 3 s)"); window.fini = true; }
