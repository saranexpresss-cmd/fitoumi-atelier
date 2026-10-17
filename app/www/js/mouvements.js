// Mouvements du coach 3D (en mètres ; le coach regarde vers +Z, sa gauche est en +X, le sol est à y = 0).
// Chaque mouvement : cles(L) → [{ t (0 → 1), pose }], où L donne les repères du corps au repos (voir avatar.js).
// Pose : corps [rx, ry, rz]° (tout le corps, autour du bassin), bassin [dx, dy, dz] (déplacement),
//        buste / tete [rx, ry, rz]° (rx > 0 : vers l'avant ; rz > 0 : penché vers sa droite),
//        jambeL/R { pied [x,y,z] (cheville, IK), genou [direction], cheville [rx]° } ou { cuisse, tibia } (directions),
//        brasL/R { main [x,y,z] (poignet, IK), coude [direction] } ou { bras, avantBras } (directions).

const RAD = Math.PI / 180;

// Bras détendus le long du corps, jambes à largeur de hanches
function debout(L, { ecart = 0.12, bras = true } = {}) {
  const y = L.chevilleL.y;
  const pose = {
    jambeL: { pied: [ecart, y, 0.0], genou: [0.1, 0, 1] },
    jambeR: { pied: [-ecart, y, 0.0], genou: [-0.1, 0, 1] },
  };
  if (bras) {
    pose.brasL = { bras: [0.16, -1, -0.02], avantBras: [0.06, -1, 0.12] };
    pose.brasR = { bras: [-0.16, -1, -0.02], avantBras: [-0.06, -1, 0.12] };
  }
  return pose;
}

// Corps incliné d'un angle a (0 = debout, 90 = allongé face au sol), pivotant autour des chevilles posées
// au sol en (y = hCheville, z = zCheville). Renvoie le déplacement du bassin et la position des épaules.
function incline(L, a, { hCheville = 0.1, zCheville = -0.75 } = {}) {
  const r = a * RAD, c = Math.cos(r), s = Math.sin(r);
  const tourne = (p) => [p.x - L.bassin.x, (p.y - L.bassin.y) * c - (p.z - L.bassin.z) * s, (p.y - L.bassin.y) * s + (p.z - L.bassin.z) * c];
  const longueur = L.cuisse + L.tibia, hanche = tourne(L.hancheL);
  // la cheville est au bout de la jambe tendue dans l'axe du corps
  const jambe = [0, -c, -s];
  const rootY = hCheville - hanche[1] - jambe[1] * longueur, rootZ = zCheville - hanche[2] - jambe[2] * longueur;
  const epaule = tourne(L.epauleL);
  return {
    bassin: [0, rootY - L.bassin.y, rootZ - L.bassin.z],
    epaule: { y: rootY + epaule[1], z: rootZ + epaule[2], x: epaule[0] },
    jambe,
  };
}
// Trouve l'angle pour lequel les épaules sont à la hauteur voulue
function angleEpaules(L, hauteur, options) {
  let a = 45, b = 90;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; incline(L, m, options).epaule.y > hauteur ? (a = m) : (b = m); }
  return (a + b) / 2;
}

// Pompes / planche : corps droit sur la pointe des pieds
function corpsPlanche(L, a, options) {
  const p = incline(L, a, options);
  return {
    pose: {
      corps: [a, 0, 0],
      bassin: p.bassin,
      tete: [-12, 0, 0],
      jambeL: { cuisse: [0.03, p.jambe[1], p.jambe[2]], tibia: [0.03, p.jambe[1], p.jambe[2]], cheville: [a + 8] },
      jambeR: { cuisse: [-0.03, p.jambe[1], p.jambe[2]], tibia: [-0.03, p.jambe[1], p.jambe[2]], cheville: [a + 8] },
    },
    epaule: p.epaule,
  };
}

export const MOUVEMENTS = {
  debout: { periode: 4000, vue: 20, cles: (L) => [
    { t: 0, pose: debout(L) },
    { t: 0.5, pose: { ...debout(L), buste: [-2, 0, 0], bassin: [0, 0.004, 0] } },
    { t: 1, pose: debout(L) },
  ] },

  // Portrait : mains sur les hanches, posture de coach confiant
  portrait: { periode: 4000, vue: 22, cles: (L) => {
    const y = L.hancheL.y + 0.04;
    const pose = { ...debout(L, { ecart: 0.13 }), tete: [-4, -6, 0],
      brasL: { main: [L.hancheL.x + 0.1, y, 0.02], coude: [1, -0.1, -0.35] }, brasR: { main: [-L.hancheL.x - 0.1, y, 0.02], coude: [-1, -0.1, -0.35] } };
    return [{ t: 0, pose }, { t: 1, pose }];
  } },

  // Accueil : le coach salue de la main
  salut: { periode: 1500, vue: 18, cles: (L) => {
    const base = debout(L);
    const main = (dx) => ({ ...base, buste: [0, 0, -2], tete: [-3, 0, 3], brasR: { bras: [-1, 0.3, 0.25], avantBras: [dx, 1, 0.2], coude: [0, -1, 0] } });
    return [{ t: 0, pose: main(-0.5) }, { t: 0.5, pose: main(0.25) }, { t: 1, pose: main(-0.5) }];
  } },

  squat: { periode: 2600, vue: 40, cles: (L) => {
    const y = L.chevilleL.y;
    const haut = { ...debout(L, { ecart: 0.17 }), brasL: { bras: [0.25, -1, 0.35], avantBras: [0.15, -1, 0.5] }, brasR: { bras: [-0.25, -1, 0.35], avantBras: [-0.15, -1, 0.5] } };
    haut.jambeL = { pied: [0.17, y, 0.02], genou: [0.35, 0, 1] };
    haut.jambeR = { pied: [-0.17, y, 0.02], genou: [-0.35, 0, 1] };
    const bas = {
      ...haut, bassin: [0, -0.43, -0.2], buste: [32, 0, 0], tete: [-22, 0, 0],
      brasL: { bras: [0.12, 0.05, 1], avantBras: [0.08, 0.05, 1] }, brasR: { bras: [-0.12, 0.05, 1], avantBras: [-0.08, 0.05, 1] },
    };
    return [{ t: 0, pose: haut }, { t: 0.45, pose: bas }, { t: 0.55, pose: bas }, { t: 1, pose: haut }];
  } },

  jumping_jacks: { periode: 1100, vue: 15, distance: 5, hauteurVue: 1.02, cles: (L) => {
    const y = L.chevilleL.y;
    const ferme = { ...debout(L, { ecart: 0.09 }) };
    const ouvert = {
      bassin: [0, -0.03, 0],
      jambeL: { pied: [0.36, y, 0.02], genou: [0.4, 0, 1] }, jambeR: { pied: [-0.36, y, 0.02], genou: [-0.4, 0, 1] },
      brasL: { bras: [0.55, 1, 0.05], avantBras: [0.25, 1, 0.05] }, brasR: { bras: [-0.55, 1, 0.05], avantBras: [-0.25, 1, 0.05] },
    };
    const saut = (p, f) => ({ ...p, bassin: [0, 0.09, 0], jambeL: { ...p.jambeL, pied: [p.jambeL.pied[0] * f, y + 0.08, 0.03] }, jambeR: { ...p.jambeR, pied: [p.jambeR.pied[0] * f, y + 0.08, 0.03] },
      brasL: { bras: [1, 0.15, 0], avantBras: [1, 0.3, 0] }, brasR: { bras: [-1, 0.15, 0], avantBras: [-1, 0.3, 0] } });
    const milieu = { ...saut(ferme, 2.4) };
    return [{ t: 0, pose: ferme }, { t: 0.25, pose: milieu }, { t: 0.5, pose: ouvert }, { t: 0.75, pose: milieu }, { t: 1, pose: ferme }];
  } },

  montees_genoux: { periode: 900, vue: 35, cles: (L) => {
    const y = L.chevilleL.y, yHanche = L.hancheL.y;
    // genou à hauteur de hanche : cheville sous le genou, devant
    const genou = (s) => ({ pied: [0.11 * s, yHanche - L.tibia * 0.95 + 0.02, L.cuisse * 0.85], genou: [0.05 * s, 0.6, 1], cheville: [25] });
    const appui = (s) => ({ pied: [0.11 * s, y + 0.03, 0], genou: [0.1 * s, 0, 1], cheville: [-12] });
    const pose = (s) => ({ bassin: [0, 0.02, 0], buste: [6, 0, 0], tete: [-4, 0, 0] });
    const brasAvant = (s) => ({ bras: [0.12 * s, -0.55, 0.85], avantBras: [0.02 * s, 0.75, 0.65] });
    const brasArriere = (s) => ({ bras: [0.12 * s, -0.75, -0.65], avantBras: [0.06 * s, -0.3, 1] });
    const brasMilieu = (s) => ({ bras: [0.12 * s, -1, 0.05], avantBras: [0.05 * s, 0.1, 1] });
    const gauche = { ...pose(), jambeL: genou(1), jambeR: appui(-1), brasL: brasArriere(1), brasR: brasAvant(-1) };
    const droite = { ...pose(), jambeL: appui(1), jambeR: genou(-1), brasL: brasAvant(1), brasR: brasArriere(-1) };
    const vol = { ...pose(), bassin: [0, 0.05, 0], jambeL: appui(1), jambeR: appui(-1), brasL: brasMilieu(1), brasR: brasMilieu(-1) };
    return [{ t: 0, pose: gauche }, { t: 0.25, pose: vol }, { t: 0.5, pose: droite }, { t: 0.75, pose: vol }, { t: 1, pose: gauche }];
  } },

  marche: { periode: 1300, vue: 35, cles: (L) => {
    const y = L.chevilleL.y;
    const leve = (s) => ({ pied: [0.11 * s, y + 0.2, 0.1], genou: [0.08 * s, 0.3, 1], cheville: [15] });
    const appui = (s) => ({ pied: [0.11 * s, y, 0], genou: [0.1 * s, 0, 1], cheville: [0] });
    const av = (s) => ({ bras: [0.14 * s, -1, 0.35], avantBras: [0.06 * s, -0.4, 1] });
    const ar = (s) => ({ bras: [0.14 * s, -1, -0.3], avantBras: [0.06 * s, -1, 0.3] });
    const mi = (s) => ({ bras: [0.15 * s, -1, 0.02], avantBras: [0.06 * s, -1, 0.3] });
    const g = { jambeL: leve(1), jambeR: appui(-1), brasL: ar(1), brasR: av(-1) };
    const d = { jambeL: appui(1), jambeR: leve(-1), brasL: av(1), brasR: ar(-1) };
    const pose = { bassin: [0, -0.01, 0], jambeL: appui(1), jambeR: appui(-1), brasL: mi(1), brasR: mi(-1) };
    return [{ t: 0, pose: g }, { t: 0.25, pose }, { t: 0.5, pose: d }, { t: 0.75, pose }, { t: 1, pose: g }];
  } },

  pompes: { periode: 2400, vue: 58, distance: 5.2, hauteurVue: 0.3, centreZ: 0.05, cles: (L) => {
    const options = { hCheville: 0.11, zCheville: -0.8 };
    const aHaut = angleEpaules(L, L.bras + L.avantBras + 0.06, options);
    const aBas = angleEpaules(L, 0.22, options);
    const haut = corpsPlanche(L, aHaut, options), bas = corpsPlanche(L, aBas, options);
    const zMains = haut.epaule.z + 0.02;
    const mains = (s) => ({ main: [0.27 * s, 0.06, zMains], coude: [0.7 * s, 0.6, -0.4], doigts: [0.25 * s, -0.12, 1] });
    const ph = { ...haut.pose, brasL: mains(1), brasR: mains(-1) };
    const pb = { ...bas.pose, tete: [-20, 0, 0], brasL: mains(1), brasR: mains(-1) };
    return [{ t: 0, pose: ph }, { t: 0.45, pose: pb }, { t: 0.55, pose: pb }, { t: 1, pose: ph }];
  } },

  gainage: { periode: 3500, vue: 58, distance: 5.2, hauteurVue: 0.25, centreZ: 0.05, cles: (L) => {
    const options = { hCheville: 0.11, zCheville: -0.8 };
    const a = angleEpaules(L, L.bras + 0.06, options);
    const p = corpsPlanche(L, a, options);
    const avantBras = (s) => ({ main: [0.11 * s, 0.05, p.epaule.z + L.avantBras * 0.95], coude: [0.2 * s, -1, -0.2], doigts: [-0.3 * s, -0.1, 1] });
    const pose = { ...p.pose, tete: [-8, 0, 0], brasL: avantBras(1), brasR: avantBras(-1) };
    const respire = { ...pose, bassin: [pose.bassin[0], pose.bassin[1] + 0.006, pose.bassin[2]] };
    return [{ t: 0, pose }, { t: 0.5, pose: respire }, { t: 1, pose }];
  } },

  fentes: { periode: 4400, vue: 65, cles: (L) => {
    const y = L.chevilleL.y;
    const base = debout(L);
    const fente = (s) => ({
      bassin: [0, -0.4, -0.02], buste: [-3, 0, 0],
      ["jambe" + (s > 0 ? "L" : "R")]: { pied: [0.12 * s, y, 0.5], genou: [0.1 * s, 0, 1] },
      ["jambe" + (s > 0 ? "R" : "L")]: { pied: [-0.12 * s, y + 0.08, -0.48], genou: [-0.1 * s, -0.4, 1], cheville: [-38] },
      brasL: { bras: [0.18, -1, 0], avantBras: [0.1, -1, 0.1] }, brasR: { bras: [-0.18, -1, 0], avantBras: [-0.1, -1, 0.1] },
    });
    const g = fente(1), d = fente(-1);
    return [{ t: 0, pose: base }, { t: 0.2, pose: g }, { t: 0.3, pose: g }, { t: 0.5, pose: base }, { t: 0.7, pose: d }, { t: 0.8, pose: d }, { t: 1, pose: base }];
  } },

  chaise: { periode: 3600, vue: 62, mur: -0.42, cles: (L) => {
    const y = L.chevilleL.y, zPied = 0.14;
    const hanche = L.chevilleL.y + L.tibia * 0.98; // cuisses parallèles au sol
    const pose = {
      bassin: [0, hanche - L.hancheL.y, zPied - L.cuisse - L.bassin.z + 0.02], buste: [-4, 0, 0],
      jambeL: { pied: [0.15, y, zPied], genou: [0.15, 0.4, 1] }, jambeR: { pied: [-0.15, y, zPied], genou: [-0.15, 0.4, 1] },
      brasL: { bras: [0.2, -0.85, 0.5], avantBras: [0.05, -0.2, 1] }, brasR: { bras: [-0.2, -0.85, 0.5], avantBras: [-0.05, -0.2, 1] },
    };
    const respire = { ...pose, buste: [-6, 0, 0] };
    return [{ t: 0, pose }, { t: 0.5, pose: respire }, { t: 1, pose }];
  } },

  bras: { periode: 1600, vue: 20, distance: 5.6, hauteurVue: 1.0, cles: (L) => {
    const cles = [];
    for (let i = 0; i <= 8; i++) {
      const th = (i / 8) * 2 * Math.PI, dy = 0.28 * Math.sin(th), dz = 0.28 * Math.cos(th);
      cles.push({ t: i / 8, pose: { ...debout(L, { bras: false }), brasL: { bras: [1, 0.05 + dy, dz], avantBras: [1, 0.08 + dy, dz] }, brasR: { bras: [-1, 0.05 + dy, dz], avantBras: [-1, 0.08 + dy, dz] } } });
    }
    return cles;
  } },

  etirement: { periode: 7000, vue: 10, cles: (L) => {
    const haut = { ...debout(L, { bras: false }), brasL: { bras: [0.18, 1, 0], avantBras: [-0.05, 1, 0] }, brasR: { bras: [-0.18, 1, 0], avantBras: [0.05, 1, 0] } };
    const penche = (s) => ({ ...haut, buste: [0, 0, -24 * s], tete: [0, 0, -8 * s],
      brasL: { bras: [0.18 - 0.5 * s, 1, 0], avantBras: [-0.05 - 0.6 * s, 1, 0] }, brasR: { bras: [-0.18 - 0.5 * s, 1, 0], avantBras: [0.05 - 0.6 * s, 1, 0] } });
    const g = penche(1), d = penche(-1);
    return [{ t: 0, pose: haut }, { t: 0.2, pose: g }, { t: 0.32, pose: g }, { t: 0.5, pose: haut }, { t: 0.7, pose: d }, { t: 0.82, pose: d }, { t: 1, pose: haut }];
  } },
};

// ---------- Outils pour les exercices au sol ----------
// Rotation d'un vecteur comme dans avatar.js (Euler « YXZ » : Rz, puis Rx, puis Ry)
function tourner([x, y, z], [rx = 0, ry = 0, rz = 0]) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx * RAD), Math.sin(rx * RAD), Math.cos(ry * RAD), Math.sin(ry * RAD), Math.cos(rz * RAD), Math.sin(rz * RAD)];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y, z];
}
// Position (monde) d'un repère du corps quand tout le corps est tourné de « corps » et le bassin déplacé de « bassin »
const monde = (L, p, corps, bassin = [0, 0, 0]) => {
  const r = tourner([p.x - L.bassin.x, p.y - L.bassin.y, p.z - L.bassin.z], corps);
  return [L.bassin.x + bassin[0] + r[0], L.bassin.y + bassin[1] + r[1], L.bassin.z + bassin[2] + r[2]];
};
// Déplacement du bassin pour que le repère p arrive en « cible »
const caler = (L, p, corps, cible) => { const m = monde(L, p, corps); return [cible[0] - m[0], cible[1] - m[1], cible[2] - m[2]]; };
const sur = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

// Allongé sur le dos (tête vers −Z), genoux pliés, pieds posés : crunchs, pont fessier
function surLeDos(L, { releve = 0, buste = 0 } = {}) {
  const corps = [-90 - releve, 0, 0];
  const bassin = [0, 0.11 + releve * 0.0085 - L.bassin.y, 0.06];
  const zPieds = L.bassin.z + 0.06 + L.cuisse * 0.95;
  return {
    corps, bassin, buste: [buste, 0, 0], tete: [buste * 0.4, 0, 0],
    jambeL: { pied: [0.13, L.chevilleL.y, zPieds], genou: [0.1, 1, 0.2] },
    jambeR: { pied: [-0.13, L.chevilleL.y, zPieds], genou: [-0.1, 1, 0.2] },
  };
}

Object.assign(MOUVEMENTS, {
  crunchs: { periode: 2200, vue: 70, distance: 4.2, hauteurVue: 0.3, cles: (L) => {
    const bras = (b) => ({ ...b, brasL: { bras: [0.25, 0.25, 1], avantBras: [0.2, 0.2, 1] }, brasR: { bras: [-0.25, 0.25, 1], avantBras: [-0.2, 0.2, 1] } });
    const bas = bras(surLeDos(L)), haut = bras(surLeDos(L, { buste: 40 }));
    return [{ t: 0, pose: bas }, { t: 0.4, pose: haut }, { t: 0.55, pose: haut }, { t: 1, pose: bas }];
  } },

  pont_fessier: { periode: 2600, vue: 75, distance: 4.2, hauteurVue: 0.3, cles: (L) => {
    const bras = (b) => ({ ...b, brasL: { bras: [0.25, -0.15, 1], avantBras: [0.2, -0.05, 1] }, brasR: { bras: [-0.25, -0.15, 1], avantBras: [-0.2, -0.05, 1] } });
    const bas = bras(surLeDos(L)), haut = bras(surLeDos(L, { releve: 28 }));
    return [{ t: 0, pose: bas }, { t: 0.4, pose: haut }, { t: 0.6, pose: haut }, { t: 1, pose: bas }];
  } },

  superman: { periode: 2600, vue: 62, distance: 5.4, hauteurVue: 0.3, cles: (L) => {
    const corps = [90, 0, 0];
    const bassin = [0, 0.11 - L.bassin.y, -0.06 - L.bassin.z];
    const pose = (h) => ({
      corps, bassin, buste: [-14 * h, 0, 0], tete: [-12 * h, 0, 0],
      brasL: { bras: [0.25, 0.45 * h - 0.05, 1], avantBras: [0.18, 0.45 * h - 0.05, 1] }, brasR: { bras: [-0.25, 0.45 * h - 0.05, 1], avantBras: [-0.18, 0.45 * h - 0.05, 1] },
      jambeL: { cuisse: [0.06, 0.28 * h - 0.04, -1], tibia: [0.05, 0.3 * h - 0.04, -1], cheville: [170] },
      jambeR: { cuisse: [-0.06, 0.28 * h - 0.04, -1], tibia: [-0.05, 0.3 * h - 0.04, -1], cheville: [170] },
    });
    return [{ t: 0, pose: pose(0) }, { t: 0.4, pose: pose(1) }, { t: 0.6, pose: pose(1) }, { t: 1, pose: pose(0) }];
  } },

  mountain_climbers: { periode: 800, vue: 62, distance: 5.0, hauteurVue: 0.35, centreZ: 0.05, cles: (L) => {
    const options = { hCheville: 0.11, zCheville: -0.8 };
    const a = angleEpaules(L, L.bras + L.avantBras + 0.06, options);
    const p = corpsPlanche(L, a, options);
    const mains = (s) => ({ main: [0.25 * s, 0.06, p.epaule.z + 0.02], coude: [0.7 * s, 0.6, -0.4], doigts: [0.25 * s, -0.12, 1] });
    const genou = (s) => ({ cuisse: [0.06 * s, -0.62, 0.78], tibia: [0.03 * s, -0.12, -1], cheville: [a + 8] });
    const g = { ...p.pose, brasL: mains(1), brasR: mains(-1), jambeL: genou(1) };
    const d = { ...p.pose, brasL: mains(1), brasR: mains(-1), jambeR: genou(-1) };
    return [{ t: 0, pose: g }, { t: 0.5, pose: d }, { t: 1, pose: g }];
  } },

  burpees: { periode: 3200, vue: 55, distance: 5.2, hauteurVue: 0.7, cles: (L) => {
    const y = L.chevilleL.y, zMains = 0.36;
    const a = angleEpaules(L, L.bras + L.avantBras + 0.06, { hCheville: 0.11, zCheville: -0.8 });
    // planche placée pour que les épaules tombent au-dessus des mains
    const essai = incline(L, a, { hCheville: 0.11, zCheville: 0 });
    const zCheville = zMains - 0.02 - essai.epaule.z;
    const p = incline(L, a, { hCheville: 0.11, zCheville });
    const pieds = (h, z, ch = 0) => ({ jambeL: { pied: [0.12, h, z], genou: [0.1, 0, 1], cheville: [ch] }, jambeR: { pied: [-0.12, h, z], genou: [-0.1, 0, 1], cheville: [ch] } });
    const mains = (yM, zM, pole = [0, -0.3, -1]) => ({ brasL: { main: [0.24, yM, zM], coude: [pole[0] + 0.3, pole[1], pole[2]] }, brasR: { main: [-0.24, yM, zM], coude: [pole[0] - 0.3, pole[1], pole[2]] } });
    const debout_ = { ...pieds(y, 0), ...mains(0.86, 0.05) };
    const accroupi = { bassin: [0, -0.52, -0.12], buste: [55, 0, 0], tete: [-30, 0, 0], ...pieds(y, 0.02, 0), ...mains(0.06, zMains) };
    const planche = { corps: [a, 0, 0], bassin: p.bassin, tete: [-12, 0, 0], ...pieds(0.11, zCheville, a + 8), ...mains(0.06, zMains, [0.4, 0.6, -0.4]) };
    const saut = { bassin: [0, 0.14, 0], ...pieds(y + 0.14, 0, -25), ...mains(2.3, 0.05, [1, 0, 0]) };
    return [{ t: 0, pose: debout_ }, { t: 0.18, pose: accroupi }, { t: 0.36, pose: planche }, { t: 0.5, pose: planche }, { t: 0.66, pose: accroupi }, { t: 0.82, pose: saut }, { t: 1, pose: debout_ }];
  } },

  squat_saute: { periode: 1800, vue: 40, distance: 5.0, hauteurVue: 1.0, cles: (L) => {
    const y = L.chevilleL.y;
    const pieds = (h, ch = 0) => ({ jambeL: { pied: [0.17, h, 0.02], genou: [0.35, 0, 1], cheville: [ch] }, jambeR: { pied: [-0.17, h, 0.02], genou: [-0.35, 0, 1], cheville: [ch] } });
    const haut = { ...pieds(y), brasL: { bras: [0.2, -1, 0.1], avantBras: [0.1, -1, 0.3] }, brasR: { bras: [-0.2, -1, 0.1], avantBras: [-0.1, -1, 0.3] } };
    const bas = { ...pieds(y), bassin: [0, -0.4, -0.18], buste: [30, 0, 0], tete: [-20, 0, 0], brasL: { bras: [0.15, -0.6, -0.8], avantBras: [0.1, -0.5, -0.6] }, brasR: { bras: [-0.15, -0.6, -0.8], avantBras: [-0.1, -0.5, -0.6] } };
    const saut = { ...pieds(y + 0.2, -30), bassin: [0, 0.2, 0], brasL: { bras: [0.3, 1, 0.2], avantBras: [0.2, 1, 0.2] }, brasR: { bras: [-0.3, 1, 0.2], avantBras: [-0.2, 1, 0.2] } };
    return [{ t: 0, pose: haut }, { t: 0.35, pose: bas }, { t: 0.55, pose: saut }, { t: 0.75, pose: bas }, { t: 1, pose: haut }];
  } },

  talons_fesses: { periode: 700, vue: 70, cles: (L) => {
    const y = L.chevilleL.y, yH = L.hancheL.y;
    const leve = (s) => ({ pied: [0.11 * s, yH - 0.42, -0.36], genou: [0.05 * s, -0.4, 1], cheville: [70] });
    const appui = (s) => ({ pied: [0.11 * s, y + 0.03, 0], genou: [0.1 * s, 0, 1], cheville: [-10] });
    const av = (s) => ({ bras: [0.14 * s, -0.8, 0.5], avantBras: [0.05 * s, 0.4, 1] });
    const ar = (s) => ({ bras: [0.14 * s, -0.9, -0.4], avantBras: [0.06 * s, -0.4, 1] });
    const g = { bassin: [0, 0.03, 0], buste: [5, 0, 0], jambeL: leve(1), jambeR: appui(-1), brasL: av(1), brasR: ar(-1) };
    const d = { bassin: [0, 0.03, 0], buste: [5, 0, 0], jambeL: appui(1), jambeR: leve(-1), brasL: ar(1), brasR: av(-1) };
    return [{ t: 0, pose: g }, { t: 0.5, pose: d }, { t: 1, pose: g }];
  } },

  shadow_boxing: { periode: 2000, vue: 35, cles: (L) => {
    const y = L.chevilleL.y, hE = L.epauleL.y;
    const jambes = { jambeL: { pied: [0.14, y, 0.2], genou: [0.2, 0, 1] }, jambeR: { pied: [-0.16, y + 0.02, -0.2], genou: [-0.2, 0, 1], cheville: [-10] } };
    const garde = (s) => ({ main: [0.11 * s, hE + 0.05, 0.24], coude: [0.3 * s, -1, 0.1] });
    const frappe = (s) => ({ main: [0.04 * s, hE, 0.72], coude: [0.6 * s, -0.4, 0] });
    const base = { ...jambes, bassin: [0, -0.06, 0], buste: [6, 15, 0], tete: [0, -12, 0], brasL: garde(1), brasR: garde(-1) };
    const jab = { ...base, buste: [6, 5, 0], brasL: frappe(1) };
    const direct = { ...base, buste: [8, 40, 0], brasR: frappe(-1) };
    return [{ t: 0, pose: base }, { t: 0.15, pose: jab }, { t: 0.3, pose: base }, { t: 0.5, pose: direct }, { t: 0.68, pose: base }, { t: 0.82, pose: jab }, { t: 1, pose: base }];
  } },

  gainage_lateral: { periode: 3500, vue: 8, distance: 5.0, hauteurVue: 0.35, centreX: -0.35, cles: (L) => {
    // Sur l'avant-bras gauche, corps de profil, tête vers la gauche de l'écran : on cherche l'inclinaison où les chevilles touchent le sol
    const pose = (decal) => {
      let a = -60, b = -89;
      let corps, bassin;
      for (let i = 0; i < 25; i++) {
        const m = (a + b) / 2;
        corps = [0, 0, m];
        bassin = caler(L, L.epauleL, corps, [0, L.bras + 0.05 + decal, 0]);
        const axe = tourner([0, -1, 0], corps);
        const cheville = monde(L, L.hancheL, corps, bassin)[1] + axe[1] * (L.cuisse + L.tibia);
        cheville > 0.07 ? (a = m) : (b = m);
      }
      const axe = tourner([0, -1, 0], corps);
      const epaule = monde(L, L.epauleL, corps, bassin), hancheD = monde(L, L.hancheR, corps, bassin);
      return {
        corps, bassin, tete: [0, 0, 0],
        brasL: { main: [epaule[0] + 0.02, 0.05, epaule[2] + L.avantBras * 0.95], coude: [0, -1, -0.2], doigts: [0, -0.1, 1] },
        brasR: { main: [hancheD[0], hancheD[1] + 0.06, hancheD[2] + 0.05], coude: [0, 1, -0.3] },
        jambeL: { cuisse: sur(axe, 1), tibia: sur(axe, 1), cheville: [0] },
        jambeR: { cuisse: [axe[0], axe[1], axe[2] + 0.04], tibia: [axe[0], axe[1], axe[2] + 0.04], cheville: [0] },
      };
    };
    return [{ t: 0, pose: pose(0) }, { t: 0.5, pose: pose(0.012) }, { t: 1, pose: pose(0) }];
  } },

  chien_tete_bas: { periode: 4500, vue: 80, distance: 5.2, hauteurVue: 0.55, cles: (L) => {
    const pose = (h) => {
      const corps = [128 + h * 4, 0, 0];
      const bassin = caler(L, L.hancheL, corps, [L.hancheL.x, 1.0 + h * 0.03, -0.2]);
      const epaule = monde(L, L.epauleL, corps, bassin);
      const zMains = epaule[2] + epaule[1] * 0.75;
      return {
        corps, bassin, tete: [-25, 0, 0],
        brasL: { main: [0.24, 0.05, zMains], coude: [0.4, 0.4, -0.3], doigts: [0.15, -0.1, 1] },
        brasR: { main: [-0.24, 0.05, zMains], coude: [-0.4, 0.4, -0.3], doigts: [-0.15, -0.1, 1] },
        jambeL: { pied: [0.13, 0.1, -0.78], genou: [0.1, 0, 1], cheville: [35] },
        jambeR: { pied: [-0.13, 0.1, -0.78], genou: [-0.1, 0, 1], cheville: [35] },
      };
    };
    return [{ t: 0, pose: pose(0) }, { t: 0.5, pose: pose(1) }, { t: 1, pose: pose(0) }];
  } },
});
