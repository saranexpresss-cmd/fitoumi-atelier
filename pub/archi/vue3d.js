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
    enduit: mat({ map: tex.enduit }), interieur: mat({ color: 0xF7F5F0 }), pierre: mat({ map: tex.pierre, roughness: 0.95 }),
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
  const lS = compact ? droite - gauche + 6 : 400, pS = compact ? arriere - avant + 6 : 400;
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(lS, pS), M.herbe);
  const uvS = sol.geometry.attributes.uv; for (let i = 0; i < uvS.count; i++) uvS.setXY(i, (uvS.getX(i) * lS) / 3, (uvS.getY(i) * pS) / 3);
  sol.rotation.x = -Math.PI / 2; sol.position.set(W / 2, 0, (avant + arriere) / 2); sol.receiveShadow = true; scene.add(sol);
  const xm = (gauche + droite) / 2;
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

  // ---------- Maison : soubassement en pierre, sols, murs ----------
  boite(W + 0.06, SOL, D + 0.06, W / 2, SOL / 2, D / 2, M.pierre, scene, true, 1.5);
  const SOLS = { douche: M.carrelage, sdb: M.carrelage, wc: M.carrelage, cuisine: M.carrelage, buanderie: M.carrelage, chambre: M.parquet, bureau: M.parquet };
  for (const q of plan.pieces) boite(q.w, 0.02, q.h, q.x + q.w / 2, SOL + 0.01, q.y + q.h / 2, SOLS[q.type] || M.carrelage, scene, false, 1.2);

  const exterieur = (w) => (w.ext ? (w.y1 === w.y2 ? (w.y1 === 0 ? -1 : 1) : (w.x1 === 0 ? -1 : 1)) : 0); // sens de la façade
  const trousDe = (w) => {
    const h = w.y1 === w.y2, fixe = h ? w.y1 : w.x1, a0 = Math.min(h ? w.x1 : w.y1, h ? w.x2 : w.y2), a1 = Math.max(h ? w.x1 : w.y1, h ? w.x2 : w.y2);
    return { h, fixe, a0, a1, trous: plan.ouvertures.filter((o) => o.axe === (h ? "h" : "v") && Math.abs(o.fixe - fixe) < 0.02 && o.centre > a0 && o.centre < a1).sort((u, v) => u.centre - v.centre) };
  };
  const morceau = (h, fixe, a, b, y0, y1, ep, m, decal = 0, ech = 2) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return null;
    const L = b - a, c = (a + b) / 2, y = (y0 + y1) / 2;
    return h ? boite(L, y1 - y0, ep, c, y, fixe + decal, m, scene, true, ech) : boite(ep, y1 - y0, L, fixe + decal, y, c, m, scene, true, ech);
  };
  const haut = SOL + H;
  for (const w of plan.murs) {
    if (w.ouvert) continue;
    const { h, fixe, a0, a1, trous } = trousDe(w), ext = exterieur(w), ep = w.ep;
    const m = ext ? M.enduit : M.interieur;
    let c = a0;
    for (const o of trous) {
      const a = o.centre - o.largeur / 2, b = o.centre + o.largeur / 2;
      morceau(h, fixe, c, a, SOL, haut, ep, m);
      const bas = o.type === "fenetre" ? SOL + (o.allege || 1) : SOL, hautO = o.type === "fenetre" ? bas + (o.hauteur || 1.2) : SOL + (o.type === "baie" ? 2.3 : 2.15);
      morceau(h, fixe, a, b, SOL, bas, ep, m); morceau(h, fixe, a, b, hautO, haut, ep, m);
      if (o.type === "fenetre" || o.type === "baie") {
        const cadre = 0.06, prof = 0.07;
        morceau(h, fixe, a, b, bas, bas + cadre, prof, M.alu); morceau(h, fixe, a, b, hautO - cadre, hautO, prof, M.alu);
        morceau(h, fixe, a, a + cadre, bas, hautO, prof, M.alu); morceau(h, fixe, b - cadre, b, bas, hautO, prof, M.alu);
        const nb = o.largeur > 1.5 ? 3 : o.largeur > 0.8 ? 2 : 1;
        for (let i = 1; i < nb; i++) { const x = a + (i * (b - a)) / nb; morceau(h, fixe, x - 0.025, x + 0.025, bas, hautO, prof, M.alu); }
        morceau(h, fixe, a + cadre, b - cadre, bas + cadre, hautO - cadre, 0.02, M.verre);
        if (ext && o.type === "fenetre") { morceau(h, fixe, a - 0.05, b + 0.05, bas - 0.06, bas, ep + 0.08, M.beton, ext * 0.04); morceau(h, fixe, a - 0.08, b + 0.08, hautO, hautO + 0.12, ep + 0.04, M.rive, ext * 0.02); }
      } else if (o.type === "entree" || (ext && o.type === "porte")) {
        morceau(h, fixe, a + 0.03, b - 0.03, SOL, hautO, 0.06, M.bois);
        morceau(h, fixe, b - 0.14, b - 0.08, SOL + 1.0, SOL + 1.05, 0.12, M.sombre);
      }
      c = b;
    }
    morceau(h, fixe, c, a1, SOL, haut, ep, m);
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
    const hP = haut - 0.15;
    for (const x of [T.x + 0.2, T.x + T.w - 0.2]) { boite(0.28, hP - SOL, 0.28, x, (SOL + hP) / 2, T.y + 0.2, M.enduit, scene, true, 2); boite(0.36, 0.12, 0.36, x, SOL + 0.06, T.y + 0.2, M.pierre); }
    const inc = toiture === "terrasse" ? 0 : THREE.MathUtils.degToRad(12), prof = T.h + 0.5, yHaut = haut + (toiture === "terrasse" ? 0 : 0.12), yBas = yHaut - prof * Math.tan(inc);
    const auvent = new THREE.Mesh(new THREE.PlaneGeometry(T.w + 0.6, prof / Math.cos(inc)), toiture === "terrasse" ? M.blanc : M.tuiles);
    const uvA = auvent.geometry.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * (T.w + 0.6), uvA.getY(i) * prof);
    auvent.position.set(T.x + T.w / 2, (yHaut + yBas) / 2, -prof / 2); auvent.rotation.x = -Math.PI / 2 - inc; auvent.castShadow = true; auvent.receiveShadow = true; groupeToit.add(auvent);
    boite(T.w + 0.6, 0.2, 0.05, T.x + T.w / 2, yBas - 0.08, -prof, M.rive, groupeToit);
    boite(T.w + 0.4, 0.14, 0.28, T.x + T.w / 2, hP + 0.07, T.y + 0.2, M.blanc, groupeToit);
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

  // ---------- Mobilier ----------
  for (const m of plan.meubles) {
    const cx = m.x + m.w / 2, cz = m.y + m.h / 2;
    if (m.type === "lit") { boite(m.w, 0.35, m.h, cx, SOL + 0.2, cz, M.drap); boite(m.w + 0.06, 0.9, 0.08, cx, SOL + 0.45, m.tete === "bas" ? m.y + m.h : m.y, M.bois); }
    else if (m.type === "canape") { boite(m.w, 0.42, m.h, cx, SOL + 0.21, cz, M.tissu); boite(m.w, 0.42, 0.2, cx, SOL + 0.62, m.y + m.h - 0.1, M.tissu); }
    else if (m.type === "table") { boite(m.w, 0.05, m.h, cx, SOL + 0.75, cz, M.bois); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) boite(0.06, 0.73, 0.06, cx + dx * (m.w / 2 - 0.1), SOL + 0.37, cz + dz * (m.h / 2 - 0.1), M.sombre); }
    else if (m.type === "plan_travail") { boite(m.w, 0.88, m.h, cx, SOL + 0.44, cz, M.blanc); boite(m.w, 0.04, m.h + 0.02, cx, SOL + 0.9, cz, M.sombre); }
    else if (m.type === "douche") boite(m.w, 0.05, m.h, cx, SOL + 0.03, cz, M.blanc);
    else if (m.type === "wc") boite(0.38, 0.42, 0.6, cx, SOL + 0.21, cz, M.blanc);
    else if (m.type === "armoire") boite(m.w, 2.1, m.h, cx, SOL + 1.05, cz, M.bois);
    else boite(m.w, 0.8, m.h, cx, SOL + 0.4, cz, M.blanc);
  }

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
  const vueEnsemble = () => { camera.position.set(W / 2 - recul * 0.95, recul * 0.55 + 2, -recul * 1.15); controles.target.copy(centre); controles.minDistance = 4; controles.maxDistance = 120; controles.update(); };
  vueEnsemble();
  const taille = () => { const w = conteneur.clientWidth || 600, h = conteneur.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const obs = new ResizeObserver(taille); obs.observe(conteneur); taille();
  let actif = true;
  renderer.setAnimationLoop(() => { if (!actif) return; controles.update(); renderer.render(scene, camera); });

  return {
    toit(visible) { groupeToit.visible = visible; },
    vueEnsemble() { groupeToit.visible = true; vueEnsemble(); },
    visite() {
      const s = plan.pieces.find((q) => q.type === "salon") || plan.pieces[0];
      groupeToit.visible = true;
      camera.position.set(s.x + 0.8, SOL + 1.6, s.y + 0.7); controles.target.set(s.x + s.w * 0.7, SOL + 1.4, s.y + s.h);
      controles.minDistance = 0.1; controles.maxDistance = 30; controles.update();
    },
    detruire() { actif = false; obs.disconnect(); renderer.setAnimationLoop(null); pmrem.dispose(); renderer.dispose(); Object.values(tex).forEach((t) => t.dispose()); conteneur.innerHTML = ""; },
  };
}
