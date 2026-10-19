// Maquette 3D réaliste construite à partir du plan (mêmes cotes que le plan 2D).
// Repère : x = largeur, z = profondeur (façade avant en z = 0, terrasse en z < 0), y = hauteur.
// Rendu : lumière physique (soleil + ciel + environnement), matières texturées générées, toiture 4 pans en tuiles,
// menuiseries détaillées, soubassement en pierre, jardin clos avec portail et végétation.
import * as THREE from "./vendor/three/three.module.min.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { RoomEnvironment } from "./vendor/three/RoomEnvironment.js";
import { Sky } from "./vendor/three/Sky.js";

const SOL = 0.45; // plancher surélevé (soubassement)

// ---------- Textures générées (aucune image à télécharger) ----------
const aleas = (graine) => () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
function texture(dessin, taille = 512) {
  const c = document.createElement("canvas"); c.width = c.height = taille;
  dessin(c.getContext("2d"), taille);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const bruit = (g, n, fond, teintes, r = aleas(7), tmin = 1, tmax = 3) => { g.fillStyle = fond; g.fillRect(0, 0, n, n); for (let i = 0; i < n * n * 0.02; i++) { g.fillStyle = teintes[Math.floor(r() * teintes.length)]; const t = tmin + r() * (tmax - tmin); g.fillRect(r() * n, r() * n, t, t); } };
const TEX = {
  enduit: () => texture((g, n) => bruit(g, n, "#EFE6D6", ["#E6DBC8", "#F6EFE3", "#E9DFCD", "#F2EADC"])),
  pierre: () => texture((g, n) => { const r = aleas(3); g.fillStyle = "#6B6259"; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 64) for (let x = -((y / 2) % 128); x < n; x += 128) { const v = 120 + Math.floor(r() * 50); g.fillStyle = `rgb(${v},${v - 8},${v - 18})`; g.fillRect(x + 3, y + 3, 122, 58); } }),
  carrelage: () => texture((g, n) => { bruit(g, n, "#E9E4DA", ["#E2DCD0", "#EFEBE3"]); g.strokeStyle = "#CFC8BB"; g.lineWidth = 3; for (let i = 0; i <= n; i += n / 2) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, n); g.moveTo(0, i); g.lineTo(n, i); g.stroke(); } }),
  parquet: () => texture((g, n) => { const r = aleas(11); for (let y = 0; y < n; y += 32) { let x = -r() * 200; while (x < n) { const l = 120 + r() * 140, v = 150 + Math.floor(r() * 40); g.fillStyle = `rgb(${v + 30},${v},${v - 45})`; g.fillRect(x, y, l, 31); g.fillStyle = "rgba(90,60,30,.35)"; g.fillRect(x + l - 2, y, 2, 31); x += l; } g.fillStyle = "rgba(90,60,30,.4)"; g.fillRect(0, y + 31, n, 1); } }),
  herbe: () => texture((g, n) => bruit(g, n, "#4D7230", ["#46692B", "#557D36", "#3F6127", "#5E8540", "#6B7A3A"], aleas(5), 1, 5)),
  paves: () => texture((g, n) => { const r = aleas(9); g.fillStyle = "#8C857B"; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 64) for (let x = (y / 64) % 2 ? -32 : 0; x < n; x += 64) { const v = 165 + Math.floor(r() * 35); g.fillStyle = `rgb(${v},${v - 6},${v - 14})`; g.fillRect(x + 3, y + 3, 58, 58); } }),
  tuiles: () => texture((g, n) => { const r = aleas(13); g.fillStyle = "#6E3420"; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < n; x += 64) { const v = Math.floor(r() * 30); const grad = g.createLinearGradient(0, y, 0, y + 32); grad.addColorStop(0, `rgb(${178 + v},${88 + v / 2},52)`); grad.addColorStop(1, `rgb(${138 + v},${62 + v / 2},38)`); g.fillStyle = grad; g.fillRect(x + 2, y + 1, 60, 30); g.fillStyle = "rgba(60,25,12,.35)"; g.fillRect(x + 2, y + 28, 60, 3); } }),
  bois: () => texture((g, n) => { g.fillStyle = "#8A5A35"; g.fillRect(0, 0, n, n); const r = aleas(17); for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${60 + r() * 40},${35 + r() * 20},15,.35)`; g.lineWidth = 1 + r() * 2; g.beginPath(); const x = r() * n; g.moveTo(x, 0); g.bezierCurveTo(x + 8, n / 3, x - 8, (2 * n) / 3, x + 4, n); g.stroke(); } }),
};

// Boîte dont les coordonnées de texture suivent les dimensions réelles (texture à l'échelle, sans étirement)
function boiteUV(sx, sy, sz, echelle) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, (uv.getX(i) * dims[f][0]) / echelle, (uv.getY(i) * dims[f][1]) / echelle); }
  return g;
}

// ---------- Aménagement intérieur (rendu seulement : le plan 2D ne change pas) ----------
function meubler(scene, M, boite, niveaux, H, film) {
  const m = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const A = {
    lin: m({ color: 0xD9CDB8, roughness: 0.95 }), velours: m({ color: 0x2F5D62, roughness: 0.9 }), coussin1: m({ color: 0xC8783E, roughness: 0.95 }), coussin2: m({ color: 0xE9D8A6, roughness: 0.95 }),
    couette: m({ color: 0x8FA9B8, roughness: 0.95 }), couette2: m({ color: 0xC9A27E, roughness: 0.95 }), drap: m({ color: 0xF7F4EE, roughness: 0.95 }), tapis: m({ color: 0xB9895E, roughness: 1 }), tapis2: m({ color: 0x6E7F8C, roughness: 1 }),
    chene: m({ color: 0xB08355, roughness: 0.55 }), noyer: m({ color: 0x6B4A33, roughness: 0.5 }), laque: m({ color: 0xF4F1EA, roughness: 0.35 }), facade: m({ color: 0x5B6B5D, roughness: 0.45 }),
    marbre: m({ color: 0xEDEBE6, roughness: 0.2 }), inox: m({ color: 0xC9CCCF, roughness: 0.25, metalness: 0.9 }), noir: m({ color: 0x151515, roughness: 0.3, metalness: 0.2 }), ecran: m({ color: 0x0B0D12, roughness: 0.1, metalness: 0.5 }),
    ceramique: m({ color: 0xFFFFFF, roughness: 0.15 }), miroir: m({ color: 0xDDE6EA, roughness: 0.02, metalness: 1 }), vitre: new THREE.MeshStandardMaterial({ color: 0xCFE3EA, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.25 }),
    terre: m({ color: 0xB4643C, roughness: 0.9 }), plante: m({ color: 0x2E6B34, roughness: 0.8 }), plante2: m({ color: 0x4F8F3A, roughness: 0.8 }),
    abatjour: new THREE.MeshStandardMaterial({ color: 0xFFF1D6, emissive: 0xFFD9A0, emissiveIntensity: 0.9, roughness: 0.9 }), spot: new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFF0D8, emissiveIntensity: 1.2 }),
  };
  const b = (sx, sy, sz, x, y, z, mat, ombre = false) => boite(sx, sy, sz, x, y, z, mat, scene, ombre);
  const plante = (x, y, z, t = 1) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * t, 0.13 * t, 0.36 * t, 14), A.terre); pot.position.set(x, y + 0.18 * t, z); scene.add(pot);
    for (const [dx, dy, dz, r] of [[0, 0.62, 0, 0.26], [0.12, 0.85, 0.05, 0.2], [-0.1, 0.8, -0.06, 0.22], [0.02, 1.05, -0.02, 0.17]]) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r * t, 1), dy > 0.8 ? A.plante2 : A.plante); f.position.set(x + dx * t, y + dy * t, z + dz * t); scene.add(f); }
  };
  const lampe = (x, y, z) => { b(0.05, 0.3, 0.05, x, y + 0.15, z, A.noyer); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.2, 16), A.abatjour); s.position.set(x, y + 0.38, z); scene.add(s); };
  let lumieres = 0;
  const toiles = [0xC8783E, 0x2F5D62, 0xE9D8A6, 0x8FA9B8, 0xB4643C].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  for (const [pl, base] of niveaux) {
    // Rideaux de part et d'autre des fenêtres et baies des murs extérieurs (côté intérieur)
    const Wn = Math.max(...pl.pieces.map((q) => q.x + q.w)), Dn = Math.max(...pl.pieces.map((q) => q.y + q.h));
    for (const o of pl.ouvertures.filter((x) => x.type === "fenetre" || x.type === "baie")) {
      const h = o.axe === "h", bord = h ? (Math.abs(o.fixe) < 0.02 ? 1 : Math.abs(o.fixe - Dn) < 0.02 ? -1 : 0) : (Math.abs(o.fixe) < 0.02 ? 1 : Math.abs(o.fixe - Wn) < 0.02 ? -1 : 0);
      if (!bord) continue;
      const haut = o.type === "baie" ? 2.45 : Math.min(H - 0.15, (o.allege || 1) + (o.hauteur || 1.2) + 0.25), dec = bord * 0.16;
      for (const s of [-1, 1]) {
        const c = o.centre + s * (o.largeur / 2 + 0.12);
        if (h) b(0.32, haut, 0.04, c, base + haut / 2 + 0.02, o.fixe + dec, A.lin); else b(0.04, haut, 0.32, o.fixe + dec, base + haut / 2 + 0.02, c, A.lin);
      }
      if (h) b(o.largeur + 0.9, 0.03, 0.03, o.centre, base + haut + 0.05, o.fixe + dec, A.noir); else b(0.03, 0.03, o.largeur + 0.9, o.fixe + dec, base + haut + 0.05, o.centre, A.noir);
    }
    const dans = (o) => pl.pieces.find((q) => q.type !== "couloir" && o.x + o.w / 2 >= q.x && o.x + o.w / 2 <= q.x + q.w && o.y + o.h / 2 >= q.y && o.y + o.h / 2 <= q.y + q.h);
    const contient = (q, x, z, marge = 0.05) => q && x >= q.x + marge && x <= q.x + q.w - marge && z >= q.y + marge && z <= q.y + q.h - marge;
    // Plafonniers : un point lumineux chaud par pièce de vie (sans ombre, pour rester fluide)
    for (const q of pl.pieces.filter((x) => ["salon", "cuisine", "chambre", "detente", "bureau"].includes(x.type))) {
      if (lumieres < 6 && !film) { const l = new THREE.PointLight(0xFFD7A3, q.type === "salon" ? 14 : 8, Math.max(q.w, q.h) * 1.6, 2); l.position.set(q.x + q.w / 2, base + H - 0.35, q.y + q.h / 2); scene.add(l); lumieres++; }
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20), A.spot); d.position.set(q.x + q.w / 2, base + H - 0.02, q.y + q.h / 2); scene.add(d);
    }
    for (const o of pl.meubles) {
      const q = dans(o), cx = o.x + o.w / 2, cz = o.y + o.h / 2, y = base;
      if (o.type === "canape") {
        // Canapé : assise, dossier, accoudoirs, coussins ; table basse, tapis, lampadaire, plante
        const dos = o.y + o.h - 0.12, avantZ = o.y;
        b(o.w + 0.8, 0.012, 2.3, cx, y + 0.006, avantZ - 0.25, A.tapis);
        b(o.w - 0.3, 0.22, o.h - 0.2, cx, y + 0.3, cz - 0.05, A.velours, true); b(o.w, 0.2, o.h, cx, y + 0.1, cz, A.noyer);
        b(o.w, 0.55, 0.24, cx, y + 0.65, dos, A.velours, true);
        for (const sx of [-1, 1]) b(0.2, 0.42, o.h, cx + sx * (o.w / 2 - 0.1), y + 0.41, cz, A.velours, true);
        [0.25, 0.5, 0.75].forEach((t, i) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.13), i === 1 ? A.coussin2 : A.coussin1); c.position.set(o.x + o.w * t, y + 0.62, dos - 0.18); c.rotation.x = -0.25; scene.add(c); });
        b(Math.min(1.2, o.w * 0.5), 0.05, 0.6, cx, y + 0.4, avantZ - 0.75, A.chene); b(Math.min(1.1, o.w * 0.46), 0.3, 0.5, cx, y + 0.2, avantZ - 0.75, A.noyer);
        if (contient(q, o.x - 0.35, dos)) { b(0.04, 1.55, 0.04, o.x - 0.35, y + 0.78, dos, A.noir); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 16), A.abatjour); s.position.set(o.x - 0.35, y + 1.6, dos); scene.add(s); }
        if (contient(q, o.x + o.w + 0.35, dos)) plante(o.x + o.w + 0.35, y, dos, 1.2);
        // Tableaux au mur derrière le canapé
        if (q) { const zm = Math.abs(q.y + q.h - dos) < Math.abs(q.y - dos) ? q.y + q.h - 0.03 : q.y + 0.03;
          [[-0.55, 0.9, 0.65, 0], [0.45, 0.6, 0.8, 1]].forEach(([dx, w, hh, k]) => { b(w + 0.06, hh + 0.06, 0.03, cx + dx, y + 1.65, zm, A.noyer); b(w, hh, 0.035, cx + dx, y + 1.65, zm, toiles[(k + Math.round(o.x)) % toiles.length]); }); }
        // Meuble télé contre le mur latéral le plus proche, si la place le permet
        if (q && q.w > 4) { const tx = q.x + q.w - 0.25, tz = avantZ - 0.75; if (contient(q, tx, tz, 0.1)) { b(0.45, 0.5, 1.6, tx, y + 0.25, tz, A.laque); b(0.05, 0.62, 1.15, tx - 0.05, y + 1.05, tz, A.ecran); } }
      } else if (o.type === "table") {
        b(o.w, 0.05, o.h, cx, y + 0.75, cz, A.chene, true); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.06, 0.73, 0.06, cx + dx * (o.w / 2 - 0.1), y + 0.37, cz + dz * (o.h / 2 - 0.1), A.noir);
        const n = Math.max(2, Math.floor(o.w / 0.62));
        for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
          const x = o.x + ((i + 0.5) * o.w) / n, z = cz + s * (o.h / 2 + 0.28);
          b(0.44, 0.05, 0.42, x, y + 0.46, z, A.lin); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.035, 0.45, 0.035, x + dx * 0.18, y + 0.225, z + dz * 0.17, A.noyer);
          b(0.44, 0.42, 0.04, x, y + 0.7, z + s * 0.2, A.noyer);
        }
        b(0.01, 0.9, 0.01, cx, y + H - 0.45, cz, A.noir); const s = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 20, 1, true), A.abatjour); s.position.set(cx, y + H - 1.0, cz); scene.add(s);
      } else if (o.type === "plan_travail") {
        // Cuisine : caissons bas, plan en quartz, évier, plaque, crédence, éléments hauts de part et d'autre de la fenêtre, réfrigérateur
        const frigo = o.w > 2.4, xd = frigo ? o.x + 0.75 : o.x, l = o.x + o.w - xd;
        if (frigo) { b(0.68, 1.85, 0.66, o.x + 0.36, y + 0.925, o.y + 0.33, A.inox, true); b(0.02, 0.5, 0.02, o.x + 0.62, y + 1.3, o.y + 0.67, A.noir); }
        b(l, 0.82, 0.6, xd + l / 2, y + 0.45, o.y + 0.3, A.facade, true); b(l, 0.1, 0.55, xd + l / 2, y + 0.05, o.y + 0.3, A.noir);
        for (let x = xd + 0.6; x < xd + l - 0.05; x += 0.6) b(0.01, 0.78, 0.01, x, y + 0.45, o.y + 0.605, A.noir);
        b(l, 0.04, 0.64, xd + l / 2, y + 0.88, o.y + 0.32, A.marbre);
        b(0.55, 0.02, 0.4, xd + l * 0.35, y + 0.9, o.y + 0.32, A.inox); b(0.03, 0.3, 0.03, xd + l * 0.35, y + 1.05, o.y + 0.1, A.inox);
        b(0.6, 0.012, 0.5, xd + l * 0.72, y + 0.906, o.y + 0.32, A.noir);
        b(l, 0.55, 0.015, xd + l / 2, y + 1.18, o.y + 0.012, A.ceramique);
        const fx = o.x + o.w / 2; // fenêtre centrée sur la cuisine
        for (const [a, c] of [[xd, Math.min(fx - 0.75, xd + l)], [Math.max(fx + 0.75, xd), xd + l]]) if (c - a > 0.5) b(c - a, 0.7, 0.35, (a + c) / 2, y + 1.85, o.y + 0.18, A.laque, true);
        plante(xd + l - 0.2, y + 0.9, o.y + 0.3, 0.55);
      } else if (o.type === "lit") {
        const tz = o.tete === "bas" ? o.y + o.h : o.y, sens = o.tete === "bas" ? -1 : 1; // sens : de la tête vers le pied
        b(o.w + 1.1, 0.012, 1.6, cx, y + 0.006, tz + sens * (o.h * 0.65), A.tapis2);
        b(o.w, 0.28, o.h, cx, y + 0.16, cz, A.chene, true); b(o.w - 0.06, 0.22, o.h - 0.06, cx, y + 0.41, cz, A.drap, true);
        b(o.w + 0.04, 0.07, o.h * 0.66, cx, y + 0.55, tz + sens * (o.h - (o.h * 0.66) / 2 - 0.02), Math.round(o.x * 10) % 2 ? A.couette : A.couette2, true);
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(o.w / 2 - 0.12, 0.13, 0.36), A.drap); p.position.set(cx + sx * (o.w / 4), y + 0.6, tz + sens * 0.3); p.rotation.x = sens * 0.15; scene.add(p); }
        b(o.w + 0.2, 1.15, 0.09, cx, y + 0.6, tz - sens * 0.02, A.lin, true);
        for (const sx of [-1, 1]) { const nx = cx + sx * (o.w / 2 + 0.33), nz = tz + sens * 0.28; if (contient(q, nx, nz, 0.25)) { b(0.45, 0.48, 0.4, nx, y + 0.24, nz, A.noyer, true); lampe(nx, y + 0.48, nz); } }
        // Plante dans l'angle au pied du lit
        if (q) { const px = cx < q.x + q.w / 2 ? q.x + 0.3 : q.x + q.w - 0.3, pz = sens > 0 ? q.y + q.h - 0.3 : q.y + 0.3; if (Math.abs(px - cx) > o.w / 2 + 0.3) plante(px, y, pz, 1.1); }
      } else if (o.type === "armoire") {
        if (o.cache) continue;
        b(o.w, 2.2, o.h, cx, y + 1.1, cz, A.laque, true);
        const nb = Math.max(2, Math.round(o.w / 0.6)), faceZ = q && Math.abs(o.y - q.y) < Math.abs(o.y + o.h - q.y - q.h) ? o.y + o.h + 0.005 : o.y - 0.005;
        for (let i = 1; i < nb; i++) b(0.01, 2.1, 0.01, o.x + (i * o.w) / nb, y + 1.1, faceZ, A.noir);
        for (let i = 0; i < nb; i++) b(0.02, 0.3, 0.02, o.x + ((i + 0.5) * o.w) / nb + (i % 2 ? -0.2 : 0.2) * (o.w / nb / 0.6), y + 1.1, faceZ, A.inox);
      } else if (o.type === "douche") {
        b(o.w, 0.06, o.h, cx, y + 0.03, cz, A.ceramique); b(o.w, 2.0, 0.01, cx, y + 1.06, o.y, A.vitre); b(0.01, 2.0, o.h, o.x, y + 1.06, cz, A.vitre);
        b(0.25, 0.02, 0.25, cx, y + 2.1, cz + o.h / 2 - 0.2, A.inox); b(0.02, 0.4, 0.02, cx, y + 1.95, cz + o.h / 2 - 0.05, A.inox);
      } else if (o.type === "wc") {
        // Réservoir contre le mur le plus proche (devant ou derrière)
        const mur = q && o.y - q.y > q.y + q.h - (o.y + o.h) ? o.y + o.h : o.y, s = mur === o.y ? 1 : -1;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 18), A.ceramique); c.position.set(cx, y + 0.2, mur + s * 0.4); scene.add(c);
        b(0.38, 0.03, 0.42, cx, y + 0.42, mur + s * 0.38, A.ceramique); b(0.38, 0.42, 0.16, cx, y + 0.62, mur + s * 0.08, A.ceramique);
      } else if (o.type === "lavabo") {
        // Meuble vasque contre le mur latéral (à 0,15 m à gauche du repère), miroir au-dessus
        const mx = o.x - 0.15;
        b(0.45, 0.5, 0.8, mx + 0.225, y + 0.55, cz, A.chene, true); b(0.47, 0.04, 0.82, mx + 0.235, y + 0.82, cz, A.ceramique);
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.12, 20), A.ceramique); v.position.set(mx + 0.24, y + 0.9, cz); scene.add(v);
        b(0.02, 0.8, 0.7, mx + 0.06, y + 1.5, cz, A.miroir);
      } else if (o.type === "bureau") {
        b(o.w, 0.04, o.h, cx, y + 0.74, cz, A.chene, true); for (const sx of [-1, 1]) b(0.04, 0.72, o.h - 0.1, cx + sx * (o.w / 2 - 0.05), y + 0.36, cz, A.noir);
        b(0.34, 0.02, 0.24, cx, y + 0.77, cz, A.noir); const e = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.01), A.ecran); e.position.set(cx, y + 0.88, cz - 0.12); e.rotation.x = -0.25; scene.add(e);
        b(0.48, 0.06, 0.46, cx, y + 0.47, cz + o.h / 2 + 0.3, A.noir); b(0.46, 0.5, 0.05, cx, y + 0.75, cz + o.h / 2 + 0.52, A.noir);
        lampe(cx + o.w / 2 - 0.15, y + 0.76, cz);
      } else b(o.w, 0.8, o.h, cx, y + 0.4, cz, A.laque);
    }
  }
}

// ---------- Mise en situation : vrai quartier (imagerie satellite Esri au sol), rue, trottoirs et maisons voisines ----------
// Les voisins sont des volumes illustratifs ; seule l'imagerie du sol est réelle.
function construireQuartier(scene, M, boite, { gauche, droite, avant, arriere, lat, lon }) {
  const r = aleas(Math.abs(Math.round((lat || 1) * 1000 + (lon || 1) * 7)) + 11);
  scene.fog = new THREE.Fog(0xC9D6E2, 140, 430);
  // Sol satellite : 5 × 5 tuiles au zoom 18 (≈ 750 m de côté), centrées sur le quartier
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const Z = 18, n = 2 ** Z, rad = (lat * Math.PI) / 180, xf = ((lon + 180) / 360) * n, yf = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
    const N = 5, x0 = Math.floor(xf) - 2, y0 = Math.floor(yf) - 2, mTuile = (156543.03 * Math.cos(rad)) / n * 256, cote = N * mTuile;
    const c = document.createElement("canvas"); c.width = c.height = N * 256;
    const g = c.getContext("2d"); g.fillStyle = "#7d7a68"; g.fillRect(0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(cote, cote), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    // Le centre exact du quartier tombe sous la parcelle
    const cx = (xf - x0) * mTuile, cy = (yf - y0) * mTuile;
    plaque.rotation.x = -Math.PI / 2; plaque.position.set((gauche + droite) / 2 + cote / 2 - cx, -0.03, (avant + arriere) / 2 + cote / 2 - cy); plaque.receiveShadow = true; scene.add(plaque);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const im = new Image(); im.crossOrigin = "anonymous";
      im.onload = () => { g.drawImage(im, i * 256, j * 256); tex.needsUpdate = true; };
      im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y0 + j}/${x0 + i}`;
    }
  }
  // Rue devant le portail : chaussée, trottoirs, marquage
  const zRue = avant - 1.6 - 3.5, asphalte = new THREE.MeshStandardMaterial({ color: 0x3E4044, roughness: 0.95 }), trottoir = new THREE.MeshStandardMaterial({ color: 0xB9B2A6, roughness: 0.9 });
  boite(260, 0.04, 7, (gauche + droite) / 2, 0.02, zRue, asphalte, scene, false);
  for (const dz of [-4.25, 4.25]) boite(260, 0.12, 1.5, (gauche + droite) / 2, 0.06, zRue + dz, trottoir, scene, false);
  for (let x = -120; x < 120; x += 6) boite(3, 0.01, 0.15, (gauche + droite) / 2 + x, 0.045, zRue, M.blanc, scene, false);
  // Maisons voisines : lots de même taille, de part et d'autre, en face et derrière
  const lotW = droite - gauche, lotP = arriere - avant;
  const teintes = [0xEFE6D6, 0xF3E3C3, 0xE8D3C4, 0xDCE6E4, 0xF4F2EC, 0xEAD9B8, 0xE3E8D9];
  const toits = [M.tuiles, new THREE.MeshStandardMaterial({ color: 0x5E6670, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: 0x37506B, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide })];
  const voisin = (xc, zc, face) => {
    const proche = Math.abs(xc - (gauche + droite) / 2) < lotW * 1.6 && Math.abs(zc - (avant + arriere) / 2) < lotP * 1.6;
    const mur = M.enduit.clone(); mur.color = new THREE.Color(teintes[Math.floor(r() * teintes.length)]);
    const w = Math.min(lotW - 5, 9 + r() * 6), d = Math.min(lotP - 9, 8 + r() * 5), etages = r() < 0.35 ? 2 : 1, h = 3.1 * etages;
    const hx = xc + (r() - 0.5) * 2, hz = zc + face * (lotP / 2 - d / 2 - 4.5 - r() * 2);
    boite(w, h + 0.4, d, hx, (h + 0.4) / 2, hz, mur, scene, proche, 2);
    // fenêtres sur la façade côté rue
    for (let e = 0; e < etages; e++) for (let k = -1; k <= 1; k++) boite(1.2, 1.2, 0.08, hx + k * (w / 3), 1.6 + e * 3.1, hz - face * (d / 2 + 0.02), M.verre, scene, false);
    if (r() < 0.3) { // toit-terrasse avec acrotère
      boite(w + 0.2, 0.7, d + 0.2, hx, h + 0.75, hz, mur, scene, proche, 2);
    } else {
      const toit = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1, true), toits[Math.floor(r() * toits.length)]);
      toit.rotation.y = Math.PI / 4; toit.scale.set((w + 1.2) / Math.SQRT2, 2.2 + r() * 0.8, (d + 1.2) / Math.SQRT2);
      toit.position.set(hx, h + 0.4 + toit.scale.y / 2, hz); toit.castShadow = proche; scene.add(toit);
    }
    // clôture du lot et portail
    const hC = 1.8, demi = lotW / 2 - 0.3, zA = zc - face * (lotP / 2 - 0.3), zB = zc + face * (lotP / 2 - 0.3);
    for (const [sx, sz, x, z] of [[lotW - 0.6, 0.2, xc, zB], [0.2, lotP - 0.6, xc - demi, zc], [0.2, lotP - 0.6, xc + demi, zc], [lotW / 2 - 2.2, 0.2, xc - demi / 2 - 1.1, zA], [lotW / 2 - 2.2, 0.2, xc + demi / 2 + 1.1, zA]])
      boite(sx, hC, sz, x, hC / 2, z, mur, scene, false, 2);
    boite(3.6, 1.7, 0.08, xc, 0.85, zA, M.sombre, scene, false);
    // arbre dans la cour
    if (r() < 0.7) { const ax = xc + (r() < 0.5 ? -1 : 1) * (demi - 1.8), az = zc - face * (lotP / 2 - 3); boite(0.25, 2.4, 0.25, ax, 1.2, az, M.tronc, scene, false);
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + r() * 0.8, 1), r() < 0.5 ? M.feuille : M.feuille2); f.position.set(ax, 3.4, az); f.castShadow = proche; scene.add(f); }
  };
  const xm = (gauche + droite) / 2, zm = (avant + arriere) / 2, pas = lotW + 1.2;
  for (const k of [-3, -2, -1, 1, 2, 3]) voisin(xm + k * pas, zm, 1); // même côté de la rue
  for (const k of [-3, -2, -1, 1, 2, 3]) voisin(xm + k * pas, zRue - 4.25 - 0.75 - lotP / 2, -1); // en face (lot du milieu laissé libre : il dégage la vue)
  for (const k of [-2, -1, 0, 1, 2]) voisin(xm + k * pas, arriere + 1.2 + lotP / 2, 1); // derrière
}

export { THREE };
export function afficher3D(conteneur, plan, options = {}) {
  const W = plan.largeur, D = plan.profondeur, H = plan.hauteur || 3, T = plan.terrasse, compact = Boolean(options.transparent);
  const toiture = options.toiture || plan.toiture || "4pans";
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: !options.film, alpha: compact, preserveDrawingBuffer: Boolean(options.film) }); // tournage : calcul processeur, on allège
  renderer.setPixelRatio(options.film ? 1 : Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  conteneur.innerHTML = ""; conteneur.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
  const quartier = !options.transparent && options.quartier;
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.enableDamping = true; controles.maxPolarAngle = Math.PI * 0.49;
  if (options.auto) { controles.autoRotate = true; controles.autoRotateSpeed = 0.7; controles.enableZoom = false; controles.enablePan = false; }

  // Environnement (reflets doux) + ciel physique + soleil de fin d'après-midi
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const soleilDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(115));
  if (!compact) {
    const ciel = new Sky(); ciel.scale.setScalar(1500); scene.add(ciel);
    const u = ciel.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8; u.sunPosition.value.copy(soleilDir);
  }
  scene.add(new THREE.HemisphereLight(0xDDEBFF, 0x4A5530, 0.45));
  const soleil = new THREE.DirectionalLight(0xFFE6C4, 2.6);
  soleil.position.copy(soleilDir).multiplyScalar(60).add(new THREE.Vector3(W / 2, 0, D / 2)); soleil.target.position.set(W / 2, 0, D / 2);
  soleil.castShadow = true; soleil.shadow.mapSize.set(options.film ? 1024 : 2048, options.film ? 1024 : 2048); soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.02;
  const portee = Math.max(W, D) + 14; Object.assign(soleil.shadow.camera, { left: -portee, right: portee, top: portee, bottom: -portee, near: 1, far: 160 });
  scene.add(soleil, soleil.target);

  // Matières
  const tex = Object.fromEntries(Object.entries(TEX).map(([k, f]) => [k, f()]));
  const mat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  const M = {
    enduit: mat({ map: tex.enduit }), interieur: mat({ color: 0xF2EADF }), pierre: mat({ map: tex.pierre, roughness: 0.95 }),
    carrelage: mat({ map: tex.carrelage, roughness: 0.35 }), parquet: mat({ map: tex.parquet, roughness: 0.55 }), dallage: mat({ map: tex.paves, roughness: 0.85 }),
    herbe: mat({ map: tex.herbe }), paves: mat({ map: tex.paves }), tuiles: mat({ map: tex.tuiles, roughness: 0.75, side: THREE.DoubleSide }),
    bois: mat({ map: tex.bois, roughness: 0.6 }), alu: mat({ color: 0x2F3437, roughness: 0.35, metalness: 0.7 }), blanc: mat({ color: 0xFAFAF7 }),
    verre: new THREE.MeshStandardMaterial({ color: 0x9FC6DA, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.45, envMapIntensity: 1.4 }),
    rive: mat({ color: 0xF4F1EA }), beton: mat({ color: 0xC9C3B8 }), sombre: mat({ color: 0x2B2B2B, roughness: 0.5, metalness: 0.6 }),
    feuille: mat({ color: 0x3F7A2A, roughness: 0.8 }), feuille2: mat({ color: 0x5C9A35, roughness: 0.8 }), tronc: mat({ color: 0x6E5034 }), fleur: mat({ color: 0xD9467A }), fleur2: mat({ color: 0xF2B233 }),
    tissu: mat({ color: 0x55606E }), drap: mat({ color: 0xF1F1EE }),
  };
  const groupeToit = new THREE.Group();
  const boite = (sx, sy, sz, x, y, z, m, parent = scene, ombre = true, echelle = 1) => {
    const [a, b, c] = [Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01)];
    const o = new THREE.Mesh(m.map ? boiteUV(a, b, c, echelle) : new THREE.BoxGeometry(a, b, c), m);
    o.position.set(x, y, z); o.castShadow = ombre; o.receiveShadow = true; parent.add(o); return o;
  };

  // ---------- Terrain, clôture et portail ----------
  const avant = -(T ? T.h : 0) - (compact ? 3 : 7), arriere = D + (compact ? 2.5 : 4), gauche = compact ? -2.5 : -4, droite = W + (compact ? 2.5 : 4);
  const lS = compact ? droite - gauche + 6 : quartier ? droite - gauche : 400, pS = compact ? arriere - avant + 6 : quartier ? arriere - avant : 400;
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(lS, pS), M.herbe);
  const uvS = sol.geometry.attributes.uv; for (let i = 0; i < uvS.count; i++) uvS.setXY(i, (uvS.getX(i) * lS) / 3, (uvS.getY(i) * pS) / 3);
  sol.rotation.x = -Math.PI / 2; sol.position.set(quartier ? (gauche + droite) / 2 : W / 2, quartier ? 0.02 : 0, (avant + arriere) / 2); sol.receiveShadow = true; scene.add(sol);
  const xm = (gauche + droite) / 2;
  if (quartier) construireQuartier(scene, M, boite, { gauche, droite, avant, arriere, lat: Number(quartier.lat), lon: Number(quartier.lon) });
  if (!compact) {
    const hC = 1.9, e = 0.2, porte = 3.6;
    for (const [sx, sz, x, z] of [[droite - gauche, e, xm, arriere], [e, arriere - avant, gauche, (avant + arriere) / 2], [e, arriere - avant, droite, (avant + arriere) / 2], [xm - porte / 2 - gauche, e, (gauche + xm - porte / 2) / 2, avant], [droite - xm - porte / 2, e, (droite + xm + porte / 2) / 2, avant]]) {
      boite(sx, hC, sz, x, hC / 2, z, M.enduit, scene, true, 2); boite(sx + 0.06, 0.08, sz + 0.06, x, hC + 0.04, z, M.beton);
    }
    for (let i = 0; i <= 18; i++) boite(0.04, 1.7, 0.04, xm - porte / 2 + 0.1 + (i * (porte - 0.2)) / 18, 0.9, avant, M.sombre); // portail à barreaux
    boite(porte, 0.08, 0.06, xm, 1.7, avant, M.sombre); boite(porte, 0.08, 0.06, xm, 0.15, avant, M.sombre);
    const zFin = T ? T.y : 0;
    boite(1.6, 0.03, zFin - avant, xm, 0.015, (avant + zFin) / 2, M.paves, scene, false, 1.2);
  }

  // ---------- Maison : soubassement en pierre, puis chaque niveau (sols, murs, menuiseries) ----------
  boite(W + 0.06, SOL, D + 0.06, W / 2, SOL / 2, D / 2, M.pierre, scene, true, 1.5);
  const construireNiveau = (pl, base) => {
  const SOLS = { douche: M.carrelage, sdb: M.carrelage, wc: M.carrelage, cuisine: M.carrelage, buanderie: M.carrelage, chambre: M.parquet, bureau: M.parquet };
  for (const q of pl.pieces) boite(q.w, 0.02, q.h, q.x + q.w / 2, base + 0.01, q.y + q.h / 2, SOLS[q.type] || M.carrelage, scene, false, 1.2);

  const exterieur = (w) => (w.ext ? (w.y1 === w.y2 ? (w.y1 === 0 ? -1 : 1) : (w.x1 === 0 ? -1 : 1)) : 0); // sens de la façade
  const trousDe = (w) => {
    const h = w.y1 === w.y2, fixe = h ? w.y1 : w.x1, a0 = Math.min(h ? w.x1 : w.y1, h ? w.x2 : w.y2), a1 = Math.max(h ? w.x1 : w.y1, h ? w.x2 : w.y2);
    return { h, fixe, a0, a1, trous: pl.ouvertures.filter((o) => o.axe === (h ? "h" : "v") && Math.abs(o.fixe - fixe) < 0.02 && o.centre > a0 && o.centre < a1).sort((u, v) => u.centre - v.centre) };
  };
  const morceau = (h, fixe, a, b, y0, y1, ep, m, decal = 0, ech = 2) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return null;
    const L = b - a, c = (a + b) / 2, y = (y0 + y1) / 2;
    return h ? boite(L, y1 - y0, ep, c, y, fixe + decal, m, scene, true, ech) : boite(ep, y1 - y0, L, fixe + decal, y, c, m, scene, true, ech);
  };
  const haut = base + H;
  for (const w of pl.murs) {
    if (w.ouvert) continue;
    const { h, fixe, a0, a1, trous } = trousDe(w), ext = exterieur(w), ep = w.ep;
    const m = ext ? M.enduit : M.interieur;
    let c = a0;
    for (const o of trous) {
      const a = o.centre - o.largeur / 2, b = o.centre + o.largeur / 2;
      morceau(h, fixe, c, a, base, haut, ep, m);
      const bas = o.type === "fenetre" ? base + (o.allege || 1) : base, hautO = o.type === "fenetre" ? bas + (o.hauteur || 1.2) : base + (o.type === "baie" ? 2.3 : 2.15);
      morceau(h, fixe, a, b, base, bas, ep, m); morceau(h, fixe, a, b, hautO, haut, ep, m);
      if (o.type === "fenetre" || o.type === "baie") {
        const cadre = 0.06, prof = 0.07;
        morceau(h, fixe, a, b, bas, bas + cadre, prof, M.alu); morceau(h, fixe, a, b, hautO - cadre, hautO, prof, M.alu);
        morceau(h, fixe, a, a + cadre, bas, hautO, prof, M.alu); morceau(h, fixe, b - cadre, b, bas, hautO, prof, M.alu);
        const nb = o.largeur > 1.5 ? 3 : o.largeur > 0.8 ? 2 : 1;
        for (let i = 1; i < nb; i++) { const x = a + (i * (b - a)) / nb; morceau(h, fixe, x - 0.025, x + 0.025, bas, hautO, prof, M.alu); }
        morceau(h, fixe, a + cadre, b - cadre, bas + cadre, hautO - cadre, 0.02, M.verre);
        if (ext && o.type === "fenetre") { morceau(h, fixe, a - 0.05, b + 0.05, bas - 0.06, bas, ep + 0.08, M.beton, ext * 0.04); morceau(h, fixe, a - 0.08, b + 0.08, hautO, hautO + 0.12, ep + 0.04, M.rive, ext * 0.02); }
      } else if (o.type === "entree" || (ext && o.type === "porte")) {
        morceau(h, fixe, a + 0.03, b - 0.03, base, hautO, 0.06, M.bois);
        morceau(h, fixe, b - 0.14, b - 0.08, base + 1.0, base + 1.05, 0.12, M.sombre);
      }
      c = b;
    }
    morceau(h, fixe, c, a1, base, haut, ep, m);
  }
    // Escalier en U (deux volées de marches, palier au fond)
    for (const q of base === SOL ? pl.pieces.filter((x) => x.type === "escalier") : []) {
      const v = (q.w - 0.2) / 2, n = 9, hm = H / 2 / n, pas = Math.min(0.28, (q.h - 1.2) / n);
      for (let k = 0; k < n; k++) { boite(v, hm * (k + 1), pas, q.x + 0.1 + v / 2, base + (hm * (k + 1)) / 2, q.y + 0.1 + k * pas + pas / 2, M.beton, scene, true); boite(v, hm * (k + 1), pas, q.x + 0.1 + v * 1.5, base + H / 2 + (hm * (k + 1)) / 2, q.y + 0.1 + (n - 1 - k) * pas + pas / 2, M.beton, scene, true); }
      boite(q.w - 0.2, 0.15, 1.1, q.x + q.w / 2, base + H / 2, q.y + q.h - 0.6, M.beton, scene, true);
    }
    return haut;
  };
  const hautRDC = construireNiveau(plan, SOL);
  let haut = hautRDC;
  if (plan.etage) {
    boite(W + 0.1, 0.25, D + 0.1, W / 2, hautRDC + 0.125, D / 2, M.blanc); // dalle entre les niveaux
    haut = construireNiveau({ ...plan.etage, pieces: plan.etage.pieces }, hautRDC + 0.25);
  }
  boite(W + 0.1, 0.25, D + 0.1, W / 2, haut + 0.125, D / 2, M.blanc, groupeToit); // dalle haute / chaînage

  // ---------- Toiture ----------
  const debord = 0.6, pente = THREE.MathUtils.degToRad(27), y0 = haut + 0.25;
  if (toiture === "terrasse") {
    for (const [sx, sz, x, z] of [[W + 0.3, 0.15, W / 2, -0.08], [W + 0.3, 0.15, W / 2, D + 0.08], [0.15, D + 0.3, -0.08, D / 2], [0.15, D + 0.3, W + 0.08, D / 2]]) boite(sx, 0.8, sz, x, y0 + 0.4, z, M.enduit, groupeToit, true, 2);
  } else {
    // Toiture 4 pans : faîtage dans le sens de la grande longueur
    const x0 = -debord, x1 = W + debord, z0 = -debord, z1 = D + debord, lx = x1 - x0, lz = z1 - z0;
    const long = lx >= lz, demi = (long ? lz : lx) / 2, yS = y0 + demi * Math.tan(pente);
    const a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y0, z1], d = [x0, y0, z1];
    const r1 = long ? [x0 + demi, yS, (z0 + z1) / 2] : [(x0 + x1) / 2, yS, z0 + demi], r2 = long ? [x1 - demi, yS, (z0 + z1) / 2] : [(x0 + x1) / 2, yS, z1 - demi];
    const faces = long ? [[a, b, r2, r1], [c, d, r1, r2], [d, a, r1], [b, c, r2]] : [[a, b, r1], [b, c, r2, r1], [c, d, r2], [d, a, r1, r2]];
    const pos = [], uv = [];
    for (const pts of faces) {
      // Coordonnées de texture : le long de l'égout (u) et suivant la pente (v)
      const [p0, p1] = pts, dir = new THREE.Vector3(p1[0] - p0[0], 0, p1[2] - p0[2]).normalize();
      for (const t of pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]]) for (const i of t) { const p = pts[i]; pos.push(...p); uv.push(new THREE.Vector3(p[0] - p0[0], 0, p[2] - p0[2]).dot(dir), (p[1] - y0) / Math.sin(pente)); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    const toit = new THREE.Mesh(geo, M.tuiles); toit.castShadow = true; toit.receiveShadow = true; groupeToit.add(toit);
    for (const [sx, sz, x, z] of [[lx, 0.04, W / 2, z0], [lx, 0.04, W / 2, z1], [0.04, lz, x0, D / 2], [0.04, lz, x1, D / 2]]) boite(sx, 0.22, sz, x, y0 - 0.06, z, M.rive, groupeToit);
    boite(lx, 0.03, lz, W / 2, y0 - 0.16, D / 2, M.rive, groupeToit, false);
  }
  // Terrasse couverte : dallage, poteaux enduits, auvent (appentis)
  if (T) {
    boite(T.w, SOL - 0.02, T.h, T.x + T.w / 2, (SOL - 0.02) / 2, T.y + T.h / 2, M.dallage, scene, true, 1);
    const hP = hautRDC - 0.15;
    for (const x of [T.x + 0.2, T.x + T.w - 0.2]) { boite(0.28, hP - SOL, 0.28, x, (SOL + hP) / 2, T.y + 0.2, M.enduit, scene, true, 2); boite(0.36, 0.12, 0.36, x, SOL + 0.06, T.y + 0.2, M.pierre); }
    if (plan.etage) {
      // Balcon de l'étage : dalle au-dessus de la terrasse, garde-corps
      boite(T.w + 0.3, 0.22, T.h + 0.3, T.x + T.w / 2, hautRDC + 0.11, T.y + T.h / 2 - 0.15, M.blanc);
      for (const [sx, sz, x, z] of [[T.w + 0.3, 0.08, T.x + T.w / 2, T.y - 0.25], [0.08, T.h + 0.3, T.x - 0.1, T.y + T.h / 2 - 0.15], [0.08, T.h + 0.3, T.x + T.w + 0.1, T.y + T.h / 2 - 0.15]]) boite(sx, 1.0, sz, x, hautRDC + 0.72, z, M.enduit, scene, true, 2);
    } else {
    const inc = toiture === "terrasse" ? 0 : THREE.MathUtils.degToRad(12), prof = T.h + 0.5, yHaut = haut + (toiture === "terrasse" ? 0 : 0.12), yBas = yHaut - prof * Math.tan(inc);
    const auvent = new THREE.Mesh(new THREE.PlaneGeometry(T.w + 0.6, prof / Math.cos(inc)), toiture === "terrasse" ? M.blanc : M.tuiles);
    const uvA = auvent.geometry.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * (T.w + 0.6), uvA.getY(i) * prof);
    auvent.position.set(T.x + T.w / 2, (yHaut + yBas) / 2, -prof / 2); auvent.rotation.x = -Math.PI / 2 - inc; auvent.castShadow = true; auvent.receiveShadow = true; groupeToit.add(auvent);
    boite(T.w + 0.6, 0.2, 0.05, T.x + T.w / 2, yBas - 0.08, -prof, M.rive, groupeToit);
    boite(T.w + 0.4, 0.14, 0.28, T.x + T.w / 2, hP + 0.07, T.y + 0.2, M.blanc, groupeToit);
    }
  }
  scene.add(groupeToit);

  // ---------- Végétation ----------
  const palmier = (x, z, t = 1) => {
    const g = new THREE.Group(); let px = 0, py = 0;
    for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * t, 0.17 * t, 0.9 * t, 8), M.tronc); px += 0.06 * t; py += 0.88 * t; s.position.set(px, py - 0.44 * t, 0); s.rotation.z = -0.07; s.castShadow = true; g.add(s); }
    for (let i = 0; i < 12; i++) {
      // Palme : ellipsoïde très aplati, pivoté vers l'extérieur et retombant
      const pivot = new THREE.Group(), ang = (i / 12) * Math.PI * 2 + (i % 2) * 0.15;
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), i % 2 ? M.feuille : M.feuille2);
      f.scale.set(1.5 * t, 0.05 * t, 0.32 * t); f.position.x = 1.35 * t; f.rotation.z = -0.35; f.castShadow = true;
      pivot.add(f); pivot.position.set(px, py, 0); pivot.rotation.set(0, ang, -0.25 - (i % 3) * 0.12); g.add(pivot);
    }
    g.position.set(x, 0, z); scene.add(g);
  };
  const arbre = (x, z, t = 1) => {
    boite(0.22 * t, 2.2 * t, 0.22 * t, x, 1.1 * t, z, M.tronc);
    for (const [dx, dy, dz, r, m] of [[0, 2.8, 0, 1.4, M.feuille], [0.7, 2.4, 0.3, 0.95, M.feuille2], [-0.6, 2.5, -0.4, 1, M.feuille2], [0.1, 3.4, 0.2, 0.9, M.feuille]]) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r * t, 1), m); f.position.set(x + dx * t, dy * t, z + dz * t); f.castShadow = true; scene.add(f);
    }
  };
  const massif = (x, z, l, p = 0.7) => {
    if (l <= 0.4) return;
    boite(l, 0.14, p, x, 0.07, z, M.pierre); const r = aleas(Math.abs(Math.round(x * 100 + z * 10)) + 99);
    for (let i = 0; i < l * 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.18 + r() * 0.12, 8, 6), r() > 0.35 ? M.feuille2 : r() > 0.5 ? M.fleur : M.fleur2); b.position.set(x - l / 2 + 0.2 + r() * (l - 0.4), 0.25, z - p / 2 + 0.15 + r() * (p - 0.3)); b.castShadow = true; scene.add(b); }
  };
  if (compact) { palmier(-1.8, D * 0.3, 0.9); arbre(W + 1.6, D * 0.75, 0.85); }
  else {
    palmier(droite - 1.4, avant + 1.6, 1.05); palmier(gauche + 1.3, arriere - 1.5, 1.05); palmier(droite - 1.2, D * 0.2, 0.95);
    arbre(droite - 1.6, arriere - 1.8, 1); arbre(droite - 1.5, D * 0.45, 0.9);
    if (T) { massif(T.x - 1.2, T.y + T.h / 2 - 0.2, Math.min(2.4, T.x + 1.5)); massif(T.x + T.w + 1.2, T.y + T.h / 2 - 0.2, Math.min(2.4, W - T.x - T.w + 1.5)); }
    massif(-1.2, D * 0.55, 1.6, 0.8);
  }

  // ---------- Aménagement intérieur : mobilier détaillé, textiles, luminaires, plantes ----------
  meubler(scene, M, boite, [[plan, SOL], ...(plan.etage ? [[plan.etage, hautRDC + 0.25]] : [])], H, Boolean(options.film));

  // ---------- Mode tournage (atelier vidéo) : caméra pilotée image par image ----------
  if (options.film) {
    renderer.setSize(options.largeur || 1920, options.hauteur || 1080, false);
    camera.aspect = (options.largeur || 1920) / (options.hauteur || 1080); camera.updateProjectionMatrix();
    controles.dispose();
    return {
      canvas: renderer.domElement, SOL, haut, limites: { avant, arriere, gauche, droite }, camera,
      toit(visible) { groupeToit.visible = visible; },
      image(position, cible, fov = 38) { camera.fov = fov; camera.updateProjectionMatrix(); camera.position.copy(position); camera.lookAt(cible); renderer.render(scene, camera); },
    };
  }

  // ---------- Caméra et rendu ----------
  const centre =new THREE.Vector3(W / 2, 1.6, D / 2 - (T ? T.h / 3 : 0));
  const recul = (options.recul || (compact ? 1 : 1.45)) * Math.max(W, D);
  const vueEnsemble = () => { camera.position.set(W / 2 - recul * 0.95, recul * 0.55 + 2, -recul * 1.15); controles.target.copy(centre); controles.minDistance = 4; controles.maxDistance = quartier ? 220 : 120; controles.update(); };
  vueEnsemble();
  const taille = () => { const w = conteneur.clientWidth || 600, h = conteneur.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const obs = new ResizeObserver(taille); obs.observe(conteneur); taille();
  let actif = true, iPiece = -1;
  renderer.setAnimationLoop(() => { if (!actif) return; controles.update(); renderer.render(scene, camera); });

  return {
    toit(visible) { groupeToit.visible = visible; },
    vueEnsemble() { groupeToit.visible = true; camera.fov = 38; camera.updateProjectionMatrix(); if (options.auto) { controles.autoRotate = true; controles.enableZoom = false; } vueEnsemble(); },
    // Visite : chaque appel passe à la pièce suivante (séjour, cuisine, chambres…) et renvoie son nom
    visite() {
      const ordre = ["salon", "cuisine", "chambre", "detente", "bureau", "sdb"], liste = plan.pieces.filter((q) => ordre.includes(q.type)).sort((a, c) => ordre.indexOf(a.type) - ordre.indexOf(c.type));
      iPiece = (iPiece + 1) % liste.length; const s = liste[iPiece];
      // Vue « maison de poupée » : toit retiré, caméra plongeante au-dessus de la pièce (on voit tout le mobilier)
      groupeToit.visible = false; controles.autoRotate = false; controles.enableZoom = true;
      camera.fov = 50; camera.updateProjectionMatrix();
      const cxp = s.x + s.w / 2, czp = s.y + s.h / 2, t = Math.max(s.w, s.h);
      camera.position.set(cxp - t * 0.18, SOL + H + 1.2 + t * 0.95, czp + t * 0.42); controles.target.set(cxp, SOL + 0.3, czp - t * 0.05);
      controles.minDistance = 0.1; controles.maxDistance = 30; controles.update();
      return s.nom;
    },
    detruire() { actif = false; obs.disconnect(); renderer.setAnimationLoop(null); pmrem.dispose(); renderer.dispose(); Object.values(tex).forEach((t) => t.dispose()); conteneur.innerHTML = ""; },
  };
}
