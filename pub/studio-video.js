// Moteur vidéo Fitoumi piloté par scénario (utilisé par l'agent Vidéaste, sur GitHub Actions ou sur le PC).
// ?scenario=<url d'un JSON> [&rendu=1 → musique + images + MP4] [&t=12.3 → une image]
// Scénario : { id, duree (20–60 s), graine, scenes: [{ type, de, a, ... }] } — types : accroche, coach, telephone_reps,
// cartes, chat, liste, montage, fin. Toujours vertical 1080×1920, 30 i/s, sans voix, musique originale calée à 120 BPM.
import { animer } from "./js/avatar.js";
import { MOUVEMENTS } from "./js/mouvements.js";
import { composer, versWav, TEMPS } from "./studio-musique.js";

const W = 1080, H = 1920, FPS = 30;
const VERT = "#22c55e", VERT_CLAIR = "#86efac", JAUNE = "#fbbf24", NUIT = "#050914";
const COULEURS = { blanc: "#ffffff", vert: VERT, jaune: JAUNE };
const couleur = (c, defaut) => COULEURS[c] || (/^#[0-9a-f]{6}$/i.test(c || "") ? c : defaut);
const NOMS = { squat: "SQUATS", pompes: "POMPES", jumping_jacks: "JUMPING JACKS", burpees: "BURPEES", fentes: "FENTES", gainage: "GAINAGE", mountain_climbers: "MOUNTAIN CLIMBERS",
  squat_saute: "SQUATS SAUTÉS", montees_genoux: "MONTÉES DE GENOUX", shadow_boxing: "BOXE", crunchs: "CRUNCHS", pont_fessier: "PONT FESSIER", chaise: "CHAISE",
  talons_fesses: "TALONS-FESSES", superman: "SUPERMAN", gainage_lateral: "GAINAGE LATÉRAL", chien_tete_bas: "CHIEN TÊTE EN BAS", etirement: "ÉTIREMENTS", marche: "MARCHE", bras: "BRAS", salut: "SALUT" };
const g = document.getElementById("ecran").getContext("2d");
const etat = (t) => (document.getElementById("etat").textContent = t);
const doux = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const rebond = (x) => { x = Math.min(1, Math.max(0, x)); const c = 2.70158; return 1 + c * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2; };
const POLICE = (taille, graisse = 900) => `${graisse} ${taille}px "Segoe UI", "Noto Sans", "DejaVu Sans", system-ui, sans-serif`;
const rect = (x, y, w, h, r, c) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = c; g.fill(); };
const charger = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
const mvtValide = (m) => (MOUVEMENTS[m] ? m : "squat");

// ---------- Scénario : contrôle et normalisation (le scénario vient d'une IA) ----------
function normaliser(s) {
  const duree = Math.min(60, Math.max(20, Number(s.duree) || 30));
  const scenes = (Array.isArray(s.scenes) ? s.scenes : []).filter((x) => x && typeof x.type === "string")
    .map((x) => ({ ...x, de: Math.max(0, Number(x.de) || 0), a: Math.min(duree, Number(x.a) || duree) }))
    .filter((x) => x.a > x.de).sort((a, b) => a.de - b.de);
  if (!scenes.some((x) => x.type === "fin")) scenes.push({ type: "fin", de: duree - 4, a: duree });
  return { id: String(s.id || "video").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "video", duree, graine: Number(s.graine) || 0, scenes };
}

// ---------- Rythme ----------
let V, SECTIONS = [];
const depuisTemps = (t) => (t >= 4 && t < V.duree - 4 ? t % TEMPS : 9);
const punch = (t) => 1 + 0.03 * Math.exp(-depuisTemps(t) * 12);
const flash = (t) => {
  let a = 0;
  for (const s of SECTIONS) if (t >= s) a = Math.max(a, 0.8 * Math.exp(-(t - s) * 7));
  const m = V.scenes.find((x) => x.type === "montage" && t >= x.de && t < x.a);
  if (m) a = Math.max(a, 0.35 * Math.exp(-((t - m.de) % TEMPS) * 14));
  return a;
};

// ---------- Coach 3D piloté ----------
const conteneur = document.getElementById("scene3d");
let actuel = { cle: null, arret: () => {}, p: null };
async function coach(mvt, sexe, cadre) {
  const cle = `${mvt}|${sexe}|${JSON.stringify(cadre || {})}`;
  if (actuel.cle === cle) return actuel.p;
  actuel.arret();
  const p = {}; const pret = new Promise((ok) => (p.pret = ok));
  const arret = animer(conteneur, mvtValide(mvt), { sexe: sexe === "f" ? "f" : "h", cadre, pilotage: p });
  await pret;
  actuel = { cle, arret, p };
  return p;
}
function plan3D(sc, t) {
  if (sc.type === "accroche" || sc.type === "chat") return null;
  if (sc.type === "montage") {
    const l = Array.isArray(sc.mouvements) && sc.mouvements.length ? sc.mouvements : [["squat", "h"], ["jumping_jacks", "f"]];
    const i = Math.floor((t - sc.de) / TEMPS); const [mvt, sexe] = l[i % l.length];
    return { mvt, sexe, debut: sc.de + i * TEMPS, angle: ((i * 37) % 60) - 30 };
  }
  if (sc.type === "fin") return { mvt: "salut", sexe: sc.sexe || "h", debut: sc.de, angle: 0, cadre: { distance: 3.8, hauteurVue: 1.2 } };
  if (sc.type === "telephone_reps") return { mvt: sc.mvt, sexe: sc.sexe, debut: sc.de, angle: 8, cadre: { distance: 3.9, hauteurVue: 0.85 } };
  const a = Array.isArray(sc.angle) ? sc.angle : [20, -5];
  return { mvt: sc.mvt || "etirement", sexe: sc.sexe, debut: sc.de, angle: a[0] + (a[1] - a[0]) * doux((t - sc.de) / Math.max(0.5, sc.a - sc.de)) };
}

// ---------- Grain ----------
const grain = document.createElement("canvas"); grain.width = grain.height = 256;
{ const gg = grain.getContext("2d"), d = gg.createImageData(256, 256); let x = 12345; for (let i = 0; i < d.data.length; i += 4) { x = (x * 1103515245 + 12345) & 0x7fffffff; const v = x % 256; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } gg.putImageData(d, 0, 0); }
function appliquerGrain(n) {
  g.save(); g.globalAlpha = 0.045; g.globalCompositeOperation = "overlay";
  const ox = (n * 73) % 256, oy = (n * 151) % 256;
  for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) g.drawImage(grain, x, y);
  g.restore();
}

// ---------- Éléments graphiques ----------
function decor(t, teinte = 0) {
  const f = g.createLinearGradient(0, 0, W, H);
  f.addColorStop(0, "#040812"); f.addColorStop(0.5, teinte ? "#071d14" : "#0a1528"); f.addColorStop(1, "#040812");
  g.fillStyle = f; g.fillRect(0, 0, W, H);
  const halo = (x, y, r, c) => { const h = g.createRadialGradient(x, y, 0, x, y, r); h.addColorStop(0, c); h.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = h; g.fillRect(0, 0, W, H); };
  const p = 1 + 0.25 * Math.exp(-depuisTemps(t) * 6);
  halo(540 + Math.sin(t * 0.7) * 160, 950, 640 * p, "rgba(34,197,94,0.22)");
  halo(260 + Math.cos(t * 0.5) * 120, 420, 480, "rgba(57,135,229,0.18)");
}
// Texte trop long → plus petit (jamais hors cadre)
function ajuster(texte, taille, max) { g.font = POLICE(taille); while (taille > 26 && g.measureText(texte).width > max) { taille -= 2; g.font = POLICE(taille); } return taille; }
function bloc(texte, x, y, { taille = 64, fond = "#ffffff", couleur = NUIT, rot = 0, de = 0, t = 0 } = {}) {
  if (!texte) return;
  const k = rebond((t - de) / 0.28); if (k <= 0) return;
  taille = ajuster(texte, taille, 900);
  g.save(); g.font = POLICE(taille); g.textBaseline = "middle";
  const w = g.measureText(texte).width + taille * 0.7, h = taille * 1.35;
  g.translate(x, y); g.rotate(rot); g.scale(k, k); g.globalAlpha = Math.min(1, k * 1.5);
  rect(-w / 2, -h / 2, w, h, taille * 0.22, fond);
  g.fillStyle = couleur; g.textAlign = "left"; g.fillText(texte, -w / 2 + taille * 0.35, 3);
  g.restore();
}
function geant(texte, x, y, { taille = 150, couleur = "#ffffff", de = 0, t = 0, sortie = 999 } = {}) {
  const k = rebond((t - de) / 0.22), s = 1 - doux((t - sortie) / 0.15);
  if (!texte || k <= 0 || s <= 0) return;
  taille = ajuster(texte, taille, 940);
  g.save(); g.translate(x, y - (1 - Math.min(1, k)) * 60); g.scale(k, k); g.globalAlpha = Math.min(1, k * 1.4) * s;
  g.font = POLICE(taille); g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = taille * 0.14; g.lineJoin = "round"; g.strokeStyle = "rgba(5,9,20,0.92)"; g.strokeText(texte, 0, 0);
  g.fillStyle = couleur; g.fillText(texte, 0, 0);
  g.restore();
}
function lignes(texte, max, police) { g.font = police; const mots = String(texte).split(" "), l = [""]; for (const m of mots) { const e = (l.at(-1) + " " + m).trim(); if (g.measureText(e).width > max && l.at(-1)) l.push(m); else l[l.length - 1] = e; } return l.slice(0, 3); }
function dessiner3D(p, x, y, w, h, alpha = 1, filtre = "none") { if (!p) return; g.save(); g.globalAlpha = alpha; g.filter = filtre; g.drawImage(p.canvas, x, y, w, h); g.restore(); }
function telephone(t, de, contenu) {
  const k = doux((t - de) / 0.45);
  const x = 230, w = 620, h = 1180, y = 520 + (1 - k) * 900;
  g.save(); g.translate(540, y + h / 2); g.rotate((1 - k) * 0.25); g.translate(-540, -(y + h / 2));
  g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 60; rect(x, y, w, h, 84, "#11161f"); g.shadowBlur = 0;
  rect(x + 4, y + 4, w - 8, h - 8, 80, "#2a3240");
  const ex = x + 18, ey = y + 18, ew = w - 36, eh = h - 36;
  g.save(); g.beginPath(); g.roundRect(ex, ey, ew, eh, 68); g.clip(); rect(ex, ey, ew, eh, 0, "#070d1a"); contenu(ex, ey, ew, eh); g.restore();
  rect(540 - 70, ey + 14, 140, 34, 17, "#000");
  g.restore();
}
function compteur(sc, t, x, y, { anneau = false } = {}) {
  const periode = MOUVEMENTS[mvtValide(sc.mvt)]?.periode || 2400;
  const n = 4 + Math.floor(((t - sc.de) * 1000) / periode + 0.5), fraction = (((t - sc.de) * 1000) % periode) / periode;
  const pop = 1 + 0.18 * Math.max(0, 1 - fraction * 5);
  g.save(); g.translate(x, y);
  if (anneau) {
    g.fillStyle = "rgba(7,13,26,0.7)"; g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.fill();
    g.lineWidth = 16; g.strokeStyle = "rgba(255,255,255,0.12)"; g.beginPath(); g.arc(0, 0, 92, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = VERT; g.lineCap = "round"; g.beginPath(); g.arc(0, 0, 92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, n / 15)); g.stroke();
    g.scale(pop, pop); g.font = POLICE(84); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 0, 4);
  } else {
    rect(0, 0, 400, 150, 28, "rgba(15,22,38,0.82)");
    g.font = POLICE(26, 700); g.fillStyle = VERT_CLAIR; g.textAlign = "left"; g.textBaseline = "top"; g.fillText(NOMS[mvtValide(sc.mvt)] || "", 26, 20);
    g.save(); g.translate(26, 62); g.scale(pop, pop); g.font = POLICE(68); g.fillStyle = "#fff"; g.fillText(String(n), 0, 0); g.restore();
    g.font = POLICE(22, 600); g.fillStyle = "#c3c9d8"; g.fillText("compté par la caméra", 140, 100);
  }
  g.restore();
}

// ---------- Scènes ----------
const SCENES = {
  accroche(sc, t) {
    const l = (sc.lignes || []).slice(0, 4), chute = (sc.chute || []).slice(0, 2), tChute = sc.a - 1.5;
    const y0 = 960 - ((l.length - 1) * 180) / 2;
    l.forEach((x, i) => geant(x.texte, 540, y0 + i * 180, { de: sc.de + i * TEMPS, t, taille: 150, couleur: couleur(x.couleur, "#fff"), sortie: chute.length ? tChute - 0.3 : 999 }));
    if (chute.length && t >= tChute - 0.3) {
      g.save(); g.globalAlpha = doux((t - tChute + 0.3) / 0.3) * 0.5; g.fillStyle = NUIT; g.fillRect(0, 0, W, H); g.restore();
      chute.forEach((x, i) => geant(x.texte, 540, 860 + i * 190, { de: tChute + i * TEMPS, t, taille: 160, couleur: couleur(x.couleur, VERT) }));
    }
  },
  coach(sc, t, p) {
    dessiner3D(p, 0, 300, 1080, 1300);
    bloc(sc.titre, 540, 300, { t, de: sc.de + 0.1, taille: 58, rot: -0.03 });
    bloc(sc.etiquette || NOMS[mvtValide(sc.mvt)], 540, 1480, { t, de: sc.de + 0.3, taille: 70, fond: VERT, rot: 0.02 });
    if (sc.compteur) compteur(sc, t, 60, 420);
  },
  telephone_reps(sc, t, p) {
    bloc(sc.titre1, 540, 250, { t, de: sc.de + 0.1, taille: 62, rot: -0.03 });
    bloc(sc.titre2, 540, 350, { t, de: sc.de + 0.4, taille: 70, fond: VERT, rot: 0.02 });
    telephone(t, sc.de, (x, y, w, h) => {
      const sw = p.canvas.width, sh = p.canvas.height, r = Math.max(w / sw, h / sh) * 1.05;
      g.drawImage(p.canvas, x + (w - sw * r) / 2, y + (h - sh * r) / 2, sw * r, sh * r);
      g.fillStyle = "rgba(7,13,26,0.75)"; g.fillRect(x, y, w, 120);
      g.font = POLICE(30, 800); g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText("Séance live", x + 40, y + 80);
      rect(x + w - 150, y + 60, 110, 40, 20, "rgba(239,68,68,0.9)"); g.font = POLICE(22, 800); g.fillStyle = "#fff"; g.fillText("● REC", x + w - 130, y + 81);
      compteur(sc, t, x + w - 140, y + h - 240, { anneau: true });
    });
  },
  cartes(sc, t, p) {
    dessiner3D(p, 0, 300, 1080, 1300, 0.35, "blur(10px)");
    bloc(sc.titre1, 540, 260, { t, de: sc.de + 0.1, taille: 66, rot: -0.03 });
    bloc(sc.titre2, 540, 365, { t, de: sc.de + 0.4, taille: 74, fond: VERT, rot: 0.02 });
    const cartes = (sc.cartes || []).slice(0, 8), pas = Math.max(0.6, Math.min(1.2, (sc.a - sc.de - 1.5) / Math.max(1, cartes.length)));
    cartes.forEach((c, i) => {
      const de = sc.de + 1 + i * pas; if (t < de) return;
      const groupe = Math.floor(i / 4), finGroupe = cartes.length > 4 && groupe === 0 ? sc.de + 1 + 4 * pas - 0.3 : 999;
      const vieux = t > finGroupe ? doux((t - finGroupe) / 0.3) : 0; if (vieux >= 1) return;
      const k = rebond((t - de) / 0.3), gauche = i % 2 === 0, y = 560 + (i % 4) * 250 + (groupe ? 60 : 0), x = gauche ? 300 : 780;
      g.save(); g.translate(x, y); g.rotate((gauche ? -1 : 1) * 0.05); g.scale(k, k); g.globalAlpha = Math.min(1, k * 1.5) * (1 - vieux);
      rect(-250, -100, 500, 200, 34, "rgba(255,255,255,0.96)");
      g.font = POLICE(96, 400); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(c.emoji || "✨", -165, 0);
      g.textAlign = "left"; const l = lignes(c.titre || "", 290, POLICE(32)); g.fillStyle = NUIT; l.slice(0, 2).forEach((s, j) => g.fillText(s, -95, (l.length > 1 ? -40 : -20) + j * 40));
      g.font = POLICE(26, 700); g.fillStyle = "#16a34a"; g.fillText(String(c.sous || "").slice(0, 26), -95, l.length > 1 ? 48 : 28);
      g.restore();
    });
  },
  chat(sc, t) {
    bloc(sc.titre1, 540, 260, { t, de: sc.de + 0.1, taille: 66, rot: -0.03 });
    bloc(sc.titre2, 540, 365, { t, de: sc.de + 0.4, taille: 74, fond: VERT, rot: 0.02 });
    const msgs = (sc.messages || []).slice(0, 6), pas = Math.max(0.8, (sc.a - sc.de - 1.5) / Math.max(1, msgs.length));
    telephone(t, sc.de, (x, y, w, h) => {
      g.fillStyle = "#0b1220"; g.fillRect(x, y, w, 150);
      g.save(); g.beginPath(); g.arc(x + 80, y + 95, 38, 0, Math.PI * 2); g.clip(); g.drawImage(portraits[sc.sexe === "h" ? "h" : "f"], x + 42, y + 50, 76, 100); g.restore();
      g.font = POLICE(30, 800); g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText("Ton coach", x + 136, y + 82);
      g.font = POLICE(22, 600); g.fillStyle = VERT_CLAIR; g.fillText("● en ligne", x + 136, y + 116);
      let yb = y + 200;
      msgs.forEach((m, i) => {
        const de = sc.de + 0.8 + i * pas; if (t < de) return;
        const k = rebond((t - de) / 0.3), police = POLICE(29, 700), l = lignes(m.texte || "", w - 130, police);
        g.font = police; const tw = Math.min(w - 60, Math.max(...l.map((s) => g.measureText(s).width)) + 50), bh = 30 + l.length * 38;
        const bx = m.moi ? x + w - 30 - tw : x + 30;
        g.save(); g.translate(m.moi ? bx + tw : bx, yb + bh); g.scale(k, k); g.translate(-(m.moi ? bx + tw : bx), -(yb + bh)); g.globalAlpha = Math.min(1, k * 1.5);
        rect(bx, yb, tw, bh, 30, m.moi ? VERT : "#1d283f");
        g.fillStyle = m.moi ? "#04120a" : "#fff"; l.forEach((s, j) => g.fillText(s, bx + 25, yb + 34 + j * 38));
        g.restore(); yb += bh + 20;
      });
    });
  },
  liste(sc, t, p) {
    dessiner3D(p, 0, 640, 1080, 1300, 0.9);
    bloc(sc.titre, 540, 280, { t, de: sc.de + 0.1, taille: 62, fond: VERT, rot: -0.02 });
    const pts = (sc.points || []).slice(0, 4), pas = Math.max(0.9, (sc.a - sc.de - 1) / Math.max(1, pts.length));
    pts.forEach((s, i) => {
      const de = sc.de + 0.8 + i * pas; if (t < de) return;
      const k = rebond((t - de) / 0.3), y = 420 + i * 130;
      g.save(); g.translate(90, y); g.scale(k, k); g.globalAlpha = Math.min(1, k * 1.5);
      g.fillStyle = VERT; g.beginPath(); g.arc(0, 0, 38, 0, Math.PI * 2); g.fill();
      g.font = POLICE(40); g.fillStyle = NUIT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), 0, 2);
      const taille = ajuster(s, 44, 860); g.font = POLICE(taille, 800); g.textAlign = "left"; g.lineWidth = 10; g.strokeStyle = "rgba(5,9,20,0.9)"; g.lineJoin = "round";
      g.strokeText(s, 64, 2); g.fillStyle = "#fff"; g.fillText(s, 64, 2);
      g.restore();
    });
  },
  montage(sc, t, p) {
    dessiner3D(p, 0, 330, 1080, 1300);
    const mots = sc.mots || [], i = Math.floor((t - sc.de) / TEMPS);
    if (mots.length) geant(mots[i % mots.length], 540, 380, { de: sc.de + i * TEMPS, t, taille: 140, couleur: i % 2 ? VERT : "#ffffff" });
  },
  fin(sc, t, p) {
    dessiner3D(p, 0, 520, 1080, 1300, 0.55);
    g.save(); g.globalAlpha = 0.55; g.fillStyle = NUIT; g.fillRect(0, 0, W, H); g.restore();
    geant(sc.appel || "REJOINS", 540, 520, { de: sc.de, t, taille: 150 });
    const k = rebond((t - sc.de - 0.35) / 0.4);
    if (k > 0) {
      g.save(); g.translate(540, 700); g.scale(k, k);
      g.font = POLICE(150); g.textBaseline = "middle"; g.textAlign = "left";
      const l = g.measureText("fit").width, l2 = g.measureText("oumi").width, x0 = -(150 + 24 + l + l2) / 2;
      g.drawImage(logo, x0, -75, 150, 150);
      g.lineWidth = 18; g.strokeStyle = "rgba(5,9,20,0.9)"; g.lineJoin = "round"; const xt = x0 + 174;
      g.strokeText("fit", xt, 8); g.fillStyle = "#fff"; g.fillText("fit", xt, 8); g.strokeText("oumi", xt + l, 8); g.fillStyle = VERT; g.fillText("oumi", xt + l, 8);
      g.restore();
    }
    bloc(sc.sous || "Ton coach sportif dans ta poche", 540, 900, { t, de: sc.de + 0.9, taille: 44, fond: "rgba(255,255,255,0.12)", couleur: "#fff" });
    bloc("100 % GRATUIT", 540, 1040, { t, de: sc.de + 1.3, taille: 64, fond: VERT, rot: -0.02 });
    bloc("Android & iPhone", 540, 1150, { t, de: sc.de + 1.6, taille: 44 });
    if (t > sc.de + 2) { const pulse = 1 + 0.05 * Math.sin(t * 9); g.save(); g.translate(540, 1330); g.scale(pulse, pulse); g.translate(-540, -1330); bloc("fitoumi.com 👉 lien en bio", 540, 1330, { t, de: sc.de + 2, taille: 56, fond: JAUNE, rot: 0.02 }); g.restore(); }
  },
};

// ---------- Une image ----------
let logo, portraits;
async function image(t, n) {
  const sc = V.scenes.find((x) => t >= x.de && t < x.a) || V.scenes.at(-1);
  const plan = plan3D(sc, t);
  const p = plan ? await coach(plan.mvt, plan.sexe, plan.cadre) : null;
  if (p) p.rendre((t - plan.debut) * 1000, plan.angle);
  g.save();
  const z = punch(t); g.translate(540, 960); g.scale(z, z); g.translate(-540, -960);
  decor(t, sc.type === "cartes" ? 1 : 0);
  (SCENES[sc.type] || SCENES.coach)(sc, t, p);
  g.restore();
  const f = flash(t); if (f > 0.01) { g.save(); g.globalAlpha = f; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.restore(); }
  if (!["accroche", "fin"].includes(sc.type)) { g.save(); g.globalAlpha = 0.9; g.drawImage(logo, 60, 140, 64, 64); g.font = POLICE(38, 800); g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText("fit", 136, 173); g.fillStyle = VERT; g.fillText("oumi", 136 + g.measureText("fit").width, 173); g.restore(); }
  appliquerGrain(n);
}

// ---------- Lancement ----------
const params = new URLSearchParams(location.search);
V = normaliser(window.SCENARIO || await (await fetch(params.get("scenario"))).json());
SECTIONS = V.scenes.map((x) => x.de).filter((d) => d >= 4);
logo = await charger("img/icone-512.png");
portraits = { f: await charger("img/coach-f.webp"), h: await charger("img/coach-h.webp") };
const ecran = document.getElementById("ecran");
window.capturer = async (instants, base = 70) => {
  for (const [i, t] of instants.entries()) { await image(t, i); const b = await new Promise((ok) => ecran.toBlob(ok, "image/jpeg", 0.8)); await fetch(`/image?video=apercu&n=${base + i}`, { method: "POST", body: b }); }
  return "ok";
};
if (params.get("rendu")) {
  etat("Composition de la musique…");
  await fetch(`/audio?video=${V.id}`, { method: "POST", body: versWav(await composer(V.duree, { graine: V.graine })) });
  const total = Math.round(V.duree * FPS), debut = performance.now();
  for (let n = 0; n < total; n++) {
    await image(n / FPS, n);
    const blob = await new Promise((ok) => ecran.toBlob(ok, "image/jpeg", 0.92));
    await fetch(`/image?video=${V.id}&n=${n}`, { method: "POST", body: blob });
    if (n % 30 === 0) etat(`image ${n + 1}/${total} · reste ~${Math.round(((total - n) * (performance.now() - debut)) / (n + 1) / 1000)} s`);
  }
  etat("Assemblage du MP4…");
  window.resultat = await (await fetch(`/fin?video=${V.id}`, { method: "POST" })).json();
  window.fini = true;
  etat(window.resultat.ok ? `Terminé : ${(window.resultat.taille / 1e6).toFixed(1)} Mo` : `Échec : ${window.resultat.journal}`);
} else {
  await image(Number(params.get("t") || 5), 0);
  etat("Prêt"); window.fini = true;
}
