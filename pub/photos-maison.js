// Photographe automatique : images HD cadrées sur la géométrie de la maison.
// Exécuté dans un navigateur invisible par l'atelier : les images sont rendues disponibles dans window.photos (JPEG en data URL).
import { afficher3D, cadragesMaison } from "./archi/vue3d.js";

const L = 1600, H = 900;
const params = new URLSearchParams(location.search);
const S = await (await fetch(params.get("scenario"))).json();
const plan = S.plan;
const voulues = params.get("prises")?.split(",");
const exterieurSeul = Boolean(voulues?.length && voulues.every((nom) => ["vue-ensemble", "facade", "perspective", "terrasse"].includes(nom)));
const vue = afficher3D(document.getElementById("scene"), plan, { film: true, photo: true, largeur: L, hauteur: H, exterieurSeul });
await vue.pret;
const PRISES = cadragesMaison(plan, vue.limites);
window.photos = [];
// ?prises=vue-ensemble,facade : seulement ces vues (aperçu avant achat : jamais l'intérieur)
for (const p of PRISES.filter((x) => !voulues || voulues.includes(x.nom))) {
  vue.toit(p.toit);
  if (p.niveau !== undefined) vue.niveau(p.niveau);
  vue.image(p.cam, p.cible, p.fov);
  window.photos.push({ nom: p.nom, data: vue.canvas.toDataURL("image/jpeg", 0.92) });
  await new Promise((ok) => setTimeout(ok, 50));
}
document.getElementById("etat").textContent = `${window.photos.length} images`;
vue.detruire();
window.fini = true;
