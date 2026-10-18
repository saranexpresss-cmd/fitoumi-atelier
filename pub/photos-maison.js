// Photographe automatique : 4 images 3D HD d'une maison Nina Architecture (vue d'ensemble, façade, terrasse, intérieur sans toit).
// Exécuté dans un navigateur invisible par l'atelier : les images sont rendues disponibles dans window.photos (JPEG en data URL).
import { afficher3D, THREE } from "./archi/vue3d.js";

const L = 1600, H = 900;
const params = new URLSearchParams(location.search);
const S = await (await fetch(params.get("scenario"))).json();
const plan = S.plan, W = plan.largeur, D = plan.profondeur, T = plan.terrasse, R = Math.max(W, D);
const vue = afficher3D(document.getElementById("scene"), plan, { film: true, largeur: L, hauteur: H });
const V = (x, y, z) => new THREE.Vector3(x, y, z), C = V(W / 2, 1.4, D / 2), lim = vue.limites, SOL = vue.SOL, deg = THREE.MathUtils.degToRad;
const orbite = (angle, rayon, h) => V(C.x + Math.sin(angle) * rayon, h, C.z - Math.cos(angle) * rayon);
const salon = plan.pieces.find((q) => q.type === "salon") || plan.pieces[0];

const PRISES = [
  { nom: "vue-ensemble", toit: true, cam: orbite(deg(-35), R * 1.6, R * 0.75 + 4), cible: C, fov: 40 },
  { nom: "facade", toit: true, cam: V(W / 2 - 2.5, 1.7, lim.avant - Math.max(7, R * 0.9)), cible: V(W / 2, 1.8, D / 3), fov: 42 },
  { nom: "terrasse", toit: true, cam: V(salon.x + salon.w / 2 - 1.8, SOL + 1.65, (T ? T.y : 0) - 3.4), cible: V(salon.x + salon.w / 2, SOL + 1.5, 1.2), fov: 50 },
  { nom: "interieur", toit: false, cam: orbite(deg(-25), R * 0.5, R * 1.3 + 3), cible: V(W / 2, 0, D / 2), fov: 42 },
];
window.photos = [];
for (const p of PRISES) {
  vue.toit(p.toit);
  vue.image(p.cam, p.cible, p.fov);
  window.photos.push({ nom: p.nom, data: vue.canvas.toDataURL("image/jpeg", 0.92) });
  await new Promise((ok) => setTimeout(ok, 50));
}
document.getElementById("etat").textContent = `${window.photos.length} images`;
window.fini = true;
