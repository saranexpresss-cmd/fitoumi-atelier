// Coach 3D : un vrai corps humain (MakeHuman, CC0) animé en temps réel avec three.js.
// Les mouvements sont décrits dans mouvements.js (positions des mains, pieds, bassin…) ;
// ici on charge le modèle, on l'habille, on l'éclaire et on résout les articulations (IK).
import * as THREE from "../vendor/three/three.module.min.js";
import { MOUVEMENTS } from "./mouvements.js";
import { t } from "./i18n.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const modeles = {};

// ---------- Chargement (une seule fois par coach : « h » homme, « f » femme) ----------
function chargerModele(sexe = "h") {
  const nom = sexe === "f" ? "coach-f" : "coach";
  modeles[nom] ??= Promise.all([
    fetch(`avatar/${nom}.json`).then((r) => { if (!r.ok) throw new Error(nom); return r.json(); }),
    fetch(`avatar/${nom}.bin`).then((r) => r.arrayBuffer()),
  ]).catch((e) => { delete modeles[nom]; if (sexe === "f") return chargerModele("h"); throw e; });
  return modeles[nom];
}

// Tenue dessinée dans le rendu, d'après la position de repos du sommet (mètres, pieds à y = sol).
// Couleurs en sRGB → converties en linéaire dans le shader.
const TENUE = {
  peau: "#a8714d", haut: "#1fb556", liseré: "#dcfce7", short: "#273142", bande: "#22c55e",
  chaussette: "#f1f5f9", chaussure: "#3b4252", semelle: "#f8fafc", cheveux: "#1b1410",
};
const vec3 = (hex) => { const c = new THREE.Color(hex).convertSRGBToLinear(); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

function matiereCorps(L, sol, legging = false) {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.3, sheenRoughness: 0.55, sheenColor: 0xffc4a0 });
  const f = (x) => x.toFixed(4);
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRepos;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvRepos = position * 0.1 - vec3(0.0, ${f(sol)}, 0.0);`);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRepos;\nfloat zoneTenue;")
      .replace("#include <color_fragment>", `#include <color_fragment>
      {
        vec3 p = vRepos; float ax = abs(p.x); float e = 0.004;
        vec3 S = vec3(${f(L.epauleL.x)}, ${f(L.epauleL.y)}, ${f(L.epauleL.z)});
        vec3 C = vec3(${f(L.coudeL.x)}, ${f(L.coudeL.y)}, ${f(L.coudeL.z)});
        vec3 q = vec3(ax, p.y, p.z);
        float s = dot(q - S, C - S) / dot(C - S, C - S);
        // T-shirt : du nombril au col rond, manches jusqu'à mi-bras
        float col = ${f(L.cou.y - (legging ? 0.035 : 0.015))} + 2.5 * p.x * p.x - ${legging ? "0.05" : "0.075"} * smoothstep(0.0, 0.07, p.z - ${f(L.cou.z)});
        float tronc = step(ax, ${f(L.epauleL.x - 0.02)});
        float manche = (1.0 - tronc) * (1.0 - smoothstep(0.5 - e * 4.0, 0.5, s));
        float haut = smoothstep(${f(L.hancheL.y + 0.07)} - e, ${f(L.hancheL.y + 0.07)}, p.y) * (1.0 - smoothstep(col - e, col, p.y)) * max(tronc, manche);
        float lisere = haut * smoothstep(col - 0.018, col - 0.012, p.y);
        // Short : de la taille à mi-cuisse, bande verte sur le côté
        float yGenou = ${f(L.genouL.y)};
        float basShort = ${legging ? f(L.chevilleL.y + 0.1) : "yGenou + 0.17"}; // coach femme : legging jusqu'aux chevilles
        float shortZ = smoothstep(basShort - e, basShort, p.y) * (1.0 - smoothstep(${f(L.hancheL.y + 0.09)} - e, ${f(L.hancheL.y + 0.09)}, p.y)) * step(ax, ${f(L.hancheL.x + 0.14)});
        // Pieds : baskets, semelle, chaussette
        float yCh = ${f(L.chevilleL.y)};
        float chaussure = 1.0 - smoothstep(yCh + 0.035 - e, yCh + 0.035, p.y);
        float semelle = 1.0 - smoothstep(${f(L.solPied + 0.025)} - e, ${f(L.solPied + 0.025)}, p.y);
        float chaussette = (1.0 - smoothstep(yCh + 0.09 - e, yCh + 0.09, p.y)) * (1.0 - chaussure);
        // Cheveux courts (coupe dégradée) : dessus, côtés et arrière du crâne ; sourcils
        float yO = ${f(L.oeil.y)}, zO = ${f(L.oeil.z)};
        float ligne = yO + 0.072 - 0.95 * max(0.0, zO - 0.02 - p.z) + 0.5 * max(0.0, ax - 0.062) * step(zO - 0.06, p.z);
        float cheveux = smoothstep(ligne - 0.006, ligne + 0.004, p.y) * step(${f(L.cou.y)}, p.y);
        float arc = yO + 0.021 + 0.005 * (1.0 - pow((ax - 0.034) / 0.022, 2.0));
        float sourcils = step(0.011, ax) * step(ax, 0.058) * smoothstep(zO - 0.012, zO - 0.004, p.z)
                       * smoothstep(arc - 0.0045, arc - 0.0025, p.y) * (1.0 - smoothstep(arc + 0.002, arc + 0.004, p.y));
        cheveux = max(cheveux, sourcils * 0.9);
        vec3 c = ${vec3(TENUE.peau)};
        c = mix(c, ${vec3(TENUE.cheveux)}, cheveux);
        c = mix(c, ${vec3(TENUE.haut)}, haut);
        c = mix(c, ${vec3(TENUE.liseré)}, lisere);
        c = mix(c, ${vec3(TENUE.short)}, shortZ);
        c = mix(c, ${vec3(TENUE.chaussette)}, chaussette);
        c = mix(c, ${vec3(TENUE.chaussure)}, chaussure);
        c = mix(c, ${vec3(TENUE.semelle)}, semelle);
        diffuseColor.rgb = c;
        zoneTenue = max(max(haut, shortZ), max(chaussure, cheveux));
      }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, zoneTenue);");
  };
  return m;
}
const MATIERE_YEUX = { vertexColors: true, roughness: 0.15, clearcoat: 1 };

function construireCorps(json, bin) {
  const geo = new THREE.BufferGeometry();
  const v = json.vues;
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bin, v.positions.debut, json.sommets * 3), 3));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint8Array(bin, v.os.debut, json.sommets * 4), 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(new Uint8Array(bin, v.poids.debut, json.sommets * 4), 4, true));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, v.indices.debut, v.indices.longueur / 2), 1));
  geo.computeVertexNormals();

  // Couleur des yeux : iris sombre à l'avant du globe, blanc ailleurs
  const pos = geo.attributes.position, couleurs = new Float32Array(json.sommets * 3).fill(1);
  const idx = geo.index.array, gYeux = json.groupes.find((g) => g.nom === "yeux");
  if (gYeux) {
    const sommetsYeux = new Set(idx.slice(gYeux.debut, gYeux.debut + gYeux.nombre));
    const parOeil = [[], []];
    for (const s of sommetsYeux) parOeil[pos.getX(s) > 0 ? 0 : 1].push(s);
    for (const oeil of parOeil) {
      if (!oeil.length) continue;
      const zMax = Math.max(...oeil.map((s) => pos.getZ(s))), zMin = Math.min(...oeil.map((s) => pos.getZ(s)));
      for (const s of oeil) {
        const t = (pos.getZ(s) - zMin) / (zMax - zMin || 1);
        const c = t > 0.93 ? [0.02, 0.015, 0.01] : t > 0.8 ? [0.23, 0.13, 0.07] : [0.93, 0.9, 0.86];
        couleurs.set(c, s * 3);
      }
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(couleurs, 3));

  // Matières : « corps » est remplacée par matiereCorps() une fois les repères mesurés
  const materiaux = json.groupes.map((g, i) => {
    geo.addGroup(g.debut, g.nombre, i);
    return new THREE.MeshPhysicalMaterial(g.nom === "yeux" ? MATIERE_YEUX : {});
  });

  // Squelette : position de repos = inverse des matrices de liaison
  const os = json.os.map((o) => { const b = new THREE.Bone(); b.name = o.nom; return b; });
  const mondes = json.os.map((o) => new THREE.Matrix4().set(...o.invBind).invert());
  const inverses = json.os.map((o) => new THREE.Matrix4().set(...o.invBind));
  json.os.forEach((o, i) => {
    const local = o.parent >= 0 ? mondes[o.parent].clone().invert().multiply(mondes[i]) : mondes[i].clone();
    local.decompose(os[i].position, os[i].quaternion, os[i].scale);
    if (o.parent >= 0) os[o.parent].add(os[i]);
  });
  const racine = os[json.os.findIndex((o) => o.parent < 0)];
  const corps = new THREE.SkinnedMesh(geo, materiaux);
  corps.add(racine);
  corps.bind(new THREE.Skeleton(os, inverses), new THREE.Matrix4());
  corps.castShadow = true;
  corps.frustumCulled = false;
  return { corps, os, racine };
}

// ---------- Squelette « pilotable » ----------
class Pilote {
  constructor(os, groupe) {
    this.groupe = groupe;
    this.os = Object.fromEntries(os.map((b) => [b.name, b]));
    this.repos = new Map(os.map((b) => [b, { p: b.position.clone(), q: b.quaternion.clone() }]));
    groupe.updateMatrixWorld(true);
    // Repères du corps au repos (en mètres, monde)
    const w = (n) => this.os[n].getWorldPosition(V());
    const L = {};
    for (const c of ["L", "R"]) {
      L["hanche" + c] = w("upperleg01_" + c); L["genou" + c] = w("lowerleg01_" + c); L["cheville" + c] = w("foot_" + c);
      L["epaule" + c] = w("upperarm01_" + c); L["coude" + c] = w("lowerarm01_" + c); L["poignet" + c] = w("wrist_" + c);
      L["orteil" + c] = w("toe3-1_" + c);
    }
    L.bassin = w("root"); L.cou = w("neck01"); L.tete = w("head"); L.oeil = w("eye_L");
    L.cuisse = L.hancheL.distanceTo(L.genouL); L.tibia = L.genouL.distanceTo(L.chevilleL);
    L.bras = L.epauleL.distanceTo(L.coudeL); L.avantBras = L.coudeL.distanceTo(L.poignetL);
    L.solPied = 0; // le groupe est décalé pour que les pieds touchent y = 0
    this.L = L;
    this.qRepos = new Map(os.map((b) => [b, b.getWorldQuaternion(new THREE.Quaternion())]));
  }
  reinitialiser() {
    for (const [b, r] of this.repos) { b.position.copy(r.p); b.quaternion.copy(r.q); }
  }
  // Oriente l'os « nom » pour que la direction os → « bout » pointe vers « cible » (monde)
  viser(nom, bout, cible, poids = 1) {
    const b = this.os[nom], t = this.os[bout];
    b.parent.updateMatrixWorld(true); b.updateMatrixWorld(true);
    const a = b.getWorldPosition(V()), actuel = t.getWorldPosition(V()).sub(a).normalize();
    const voulu = cible.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(actuel, voulu);
    if (poids < 1) q.slerp(new THREE.Quaternion(), 1 - poids);
    const qMonde = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
    const qParent = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(qParent.invert().multiply(qMonde));
    b.updateMatrixWorld(true);
  }
  // IK à deux segments : place l'extrémité en « cible », le coude/genou orienté vers « pole »
  ik(base, milieu, bout, cible, pole) {
    const A = this.os[base].getWorldPosition(V());
    const l1 = this.L[base.startsWith("upperleg") ? "cuisse" : "bras"], l2 = this.L[base.startsWith("upperleg") ? "tibia" : "avantBras"];
    const d = cible.clone().sub(A), dist = Math.min(d.length(), (l1 + l2) * 0.999);
    const dir = d.normalize();
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const versMilieu = dir.clone().multiplyScalar(Math.cos(angle)).add(p.multiplyScalar(Math.sin(angle)));
    this.viser(base, milieu, versMilieu);
    const M = this.os[milieu].getWorldPosition(V());
    this.viser(milieu, bout, A.clone().add(dir.multiplyScalar(dist)).sub(M));
  }
  // Donne à un os une orientation monde = repos tourné de « q »
  orienter(nom, q) {
    const b = this.os[nom];
    const qMonde = this.qRepos.get(b).clone().premultiply(q);
    b.parent.updateMatrixWorld(true);
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qMonde));
    b.updateMatrixWorld(true);
  }
}

// ---------- Application d'une pose (voir mouvements.js pour le format) ----------
const qEuler = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]).map((d) => (d * Math.PI) / 180), "YXZ"));

function appliquerPose(pilote, pose) {
  const { os, L } = pilote;
  pilote.reinitialiser();
  // 1. Bassin : rotation du corps entier et déplacement
  const racine = os.root;
  const qCorps = qEuler(pose.corps);
  racine.quaternion.premultiply(qCorps);
  if (pose.bassin) racine.position.add(V(...pose.bassin).divideScalar(pilote.groupe.scale.x));
  pilote.groupe.updateMatrixWorld(true);
  // 2. Colonne : inclinaison progressive, puis tête
  if (pose.buste) {
    const q = qEuler(pose.buste);
    for (const [n, part] of [["spine05", 0.2], ["spine04", 0.2], ["spine03", 0.2], ["spine02", 0.2], ["spine01", 0.2]]) {
      const b = os[n];
      b.updateMatrixWorld(true);
      const qMonde = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().slerp(q, part));
      b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qMonde));
    }
  }
  if (pose.tete) {
    const b = os.neck01; b.updateMatrixWorld(true);
    const qMonde = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(qEuler(pose.tete));
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qMonde));
  }
  pilote.groupe.updateMatrixWorld(true);
  // 3. Jambes et bras : cibles (IK) ou directions
  for (const c of ["L", "R"]) {
    const j = pose["jambe" + c];
    if (j?.pied) {
      pilote.ik("upperleg01_" + c, "lowerleg01_" + c, "foot_" + c, V(...j.pied), V(...(j.genou || [0, 0, 1])));
    } else if (j?.cuisse) {
      pilote.viser("upperleg01_" + c, "lowerleg01_" + c, V(...j.cuisse));
      pilote.viser("lowerleg01_" + c, "foot_" + c, V(...j.tibia));
    }
    pilote.orienter("foot_" + c, qEuler(j?.cheville ? [j.cheville[0], j.cheville[1] || 0, 0] : pose.corps ? [0, pose.corps[1] || 0, 0] : null));
    const b = pose["bras" + c];
    // L'épaule accompagne le bras (30 % de la rotation) : évite les déformations anguleuses
    const dirBras = b?.main ? V(...b.main).sub(os["upperarm01_" + c].getWorldPosition(V())) : b?.bras ? V(...b.bras) : null;
    if (dirBras) {
      const S = os["upperarm01_" + c], E = os["lowerarm01_" + c];
      S.updateMatrixWorld(true);
      const actuel = E.getWorldPosition(V()).sub(S.getWorldPosition(V())).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(actuel, dirBras.normalize()).slerp(new THREE.Quaternion(), 0.7);
      const ep = os["shoulder01_" + c];
      const qMonde = ep.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
      ep.quaternion.copy(ep.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qMonde));
      ep.updateMatrixWorld(true);
    }
    if (b?.main) {
      pilote.ik("upperarm01_" + c, "lowerarm01_" + c, "wrist_" + c, V(...b.main), V(...(b.coude || [0, 0, -1])));
    } else if (b?.bras) {
      pilote.viser("upperarm01_" + c, "lowerarm01_" + c, V(...b.bras));
      pilote.viser("lowerarm01_" + c, "wrist_" + c, V(...(b.avantBras || b.bras)));
    }
    if (b?.doigts) pilote.viser("wrist_" + c, "finger3-1_" + c, V(...b.doigts)); // main à plat
  }
}

// Mélange de deux poses (nombres interpolés, directions renormalisées par l'IK/visée).
// Une rotation ou un déplacement absent d'un côté vaut « neutre » : [0, 0, 0].
// Un membre doit garder la même méthode (pied/main ou directions) dans toutes les images clés.
const NEUTRES = new Set(["corps", "bassin", "buste", "tete", "cheville"]);
function melanger(a, b, t) {
  if (typeof a === "number") return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((x, i) => melanger(x, b[i], t));
  if (a && typeof a === "object") {
    return Object.fromEntries(Object.keys({ ...a, ...b }).map((k) => {
      let x = a[k], y = b[k];
      if (NEUTRES.has(k) && x === undefined && Array.isArray(y)) x = y.map(() => 0);
      if (NEUTRES.has(k) && y === undefined && Array.isArray(x)) y = x.map(() => 0);
      return [k, x === undefined ? y : y === undefined ? x : melanger(x, y, t)];
    }));
  }
  return t < 0.5 ? a : b;
}
const doux = (t) => t * t * (3 - 2 * t);

// Pose à l'instant « phase » (0 → 1) d'un mouvement défini par des images clés [{t, pose}]
function poseA(cles, phase) {
  for (let i = 0; i < cles.length - 1; i++) {
    const a = cles[i], b = cles[i + 1];
    if (phase >= a.t && phase <= b.t) return melanger(a.pose, b.pose, doux((phase - a.t) / (b.t - a.t || 1)));
  }
  return cles[cles.length - 1].pose;
}

// ---------- Scène ----------
function creerScene(conteneur, { photo = false } = {}) {
  const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: photo });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.outputColorSpace = THREE.SRGBColorSpace;
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  rendu.toneMappingExposure = 1.35;
  rendu.shadowMap.enabled = true;
  rendu.shadowMap.type = THREE.PCFSoftShadowMap;
  rendu.domElement.className = "avatar-3d";
  conteneur.appendChild(rendu.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x334155, 1.6));
  const cle = new THREE.DirectionalLight(0xfff4e6, 3.2);
  cle.position.set(2.5, 4, 3);
  cle.castShadow = true;
  cle.shadow.mapSize.set(1024, 1024);
  Object.assign(cle.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 12 });
  cle.shadow.bias = -0.0005;
  cle.shadow.radius = 4;
  scene.add(cle);
  const contre = new THREE.DirectionalLight(0x86efac, 1.6); // liseré vert (couleur Fitoumi)
  contre.position.set(-2.5, 2.5, -3);
  scene.add(contre);
  const appoint = new THREE.DirectionalLight(0xc7d2fe, 0.6);
  appoint.position.set(-3, 1.5, 2);
  scene.add(appoint);

  // Sol : disque discret qui reçoit l'ombre
  const sol = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
  sol.rotation.x = -Math.PI / 2;
  sol.receiveShadow = true;
  if (!photo) scene.add(sol);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.07 }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.001;
  if (!photo) scene.add(halo);
  return { rendu, scene, camera, cle };
}

// ---------- API publique : même usage que l'ancienne démo ----------
// animer(conteneur, idExercice, { periode }) → fonction d'arrêt
// pilotage (outil vidéo du PC seulement) : pas de boucle ; pilotage.rendre(ms, angleDeg) dessine l'image voulue
export function animer(conteneur, id, { periode, fige, cadre, sexe, photo, pilotage } = {}) {
  conteneur.innerHTML = `<div class="avatar-chargement" aria-hidden="true"></div>`;
  conteneur.setAttribute("role", "img");
  conteneur.setAttribute("aria-label", t("seance.demo"));
  let actif = true, nettoyer = () => {};
  chargerModele(sexe).then(([json, bin]) => {
    if (!actif) return;
    conteneur.innerHTML = "";
    const { rendu, scene, camera } = creerScene(conteneur, { photo });
    const { corps, os } = construireCorps(json, bin);
    const groupe = new THREE.Group();
    groupe.scale.setScalar(json.unite);
    groupe.position.y = -json.sol; // pieds posés sur le sol
    groupe.add(corps);
    scene.add(groupe);
    const pilote = new Pilote(os, groupe);
    const iCorps = json.groupes.findIndex((g) => g.nom === "corps");
    corps.material[iCorps].dispose();
    corps.material[iCorps] = matiereCorps(pilote.L, json.sol, json.sexe === "f");
    if (json.sexe === "f") { // coach femme : chignon, attaché à l'os de la tête
      const tete = pilote.os.head;
      const chignon = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(TENUE.cheveux), roughness: 0.85, sheen: 0.5, sheenColor: 0x6b4f3a }));
      chignon.scale.set(1, 0.85, 0.9);
      chignon.position.copy(tete.worldToLocal(V(0, pilote.L.oeil.y + 0.085, pilote.L.tete.z - 0.075)));
      chignon.castShadow = true;
      tete.add(chignon);
    }
    const mvt = MOUVEMENTS[id] || MOUVEMENTS.debout;
    if (mvt.mur != null) { // mur d'appui (exercice de la chaise)
      const mur = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), new THREE.MeshStandardMaterial({ color: 0x293548, roughness: 0.95 }));
      mur.position.set(0, 0.85, mvt.mur);
      mur.receiveShadow = true;
      scene.add(mur);
    }
    const cles = mvt.cles(pilote.L);
    const duree = mvt.periode || periode || 2400;

    // Cadrage : vue choisie par le mouvement, l'utilisateur peut tourner autour du coach
    const vue = { vue: 25, hauteurVue: 0.95, distance: 4.6, centreZ: 0, centreX: 0, ...mvt, ...cadre };
    let angle = (vue.vue * Math.PI) / 180, glisse = null;
    const cible = V(vue.centreX, vue.relatifTete != null ? pilote.L.tete.y + vue.relatifTete : vue.hauteurVue, vue.centreZ);
    const distance = vue.distance;
    const placerCamera = () => {
      camera.position.set(cible.x + Math.sin(angle) * distance, cible.y + distance * 0.055, cible.z + Math.cos(angle) * distance);
      camera.lookAt(cible);
    };
    const el = rendu.domElement;
    el.onpointerdown = (e) => { glisse = e.clientX; el.setPointerCapture(e.pointerId); };
    el.onpointermove = (e) => { if (glisse != null) { angle -= (e.clientX - glisse) * 0.01; glisse = e.clientX; } };
    el.onpointerup = el.onpointercancel = () => { glisse = null; };

    const taille = () => {
      const w = conteneur.clientWidth || 300, h = conteneur.clientHeight || 300;
      rendu.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(taille);
    obs.observe(conteneur);
    taille();

    // 30 images/s suffisent (économise la batterie et laisse de la place à la caméra) ; pause si l'appli est cachée
    if (pilotage) {
      pilotage.canvas = el;
      pilotage.rendre = (ms, angleDeg) => {
        if (angleDeg != null) angle = (angleDeg * Math.PI) / 180;
        appliquerPose(pilote, poseA(cles, (ms % duree) / duree));
        placerCamera();
        rendu.render(scene, camera);
      };
      pilotage.pret?.();
      nettoyer = () => { obs.disconnect(); rendu.dispose(); corps.geometry.dispose(); corps.material.forEach((m) => m.dispose()); rendu.forceContextLoss?.(); };
      return;
    }
    const debut = performance.now(), intervalle = 1000 / (conteneur.clientWidth < 150 ? 20 : 30);
    let derniere = 0;
    const image = (t) => {
      if (!actif) return;
      requestAnimationFrame(image);
      if (document.hidden || t - derniere < intervalle - 2) return;
      derniere = t;
      const phase = fige ?? (((t - debut) % duree) + duree) % duree / duree;
      appliquerPose(pilote, poseA(cles, phase));
      placerCamera();
      rendu.render(scene, camera);
    };
    requestAnimationFrame(image);
    nettoyer = () => {
      obs.disconnect();
      rendu.dispose();
      corps.geometry.dispose();
      corps.material.forEach((m) => m.dispose());
      rendu.forceContextLoss?.();
    };
  }).catch((e) => {
    console.warn("Coach 3D indisponible", e);
    if (actif) conteneur.innerHTML = `<p class="doux">${t("seance.demoIndispo")}</p>`;
  });
  return () => { actif = false; nettoyer(); };
}

// Pour l'outil de test : accès au pilote
export const _interne = { chargerModele, construireCorps, Pilote, appliquerPose, poseA };
