// Musique originale des pubs Fitoumi, synthétisée note par note (aucun échantillon, aucun droit d'auteur tiers).
// 120 BPM (1 temps = 0,5 s, 1 mesure = 2 s), La mineur : Am – F – C – G.
//   0 → 4 s   : intro (accords filtrés + montée)          4 → 36 s : drop (grosse caisse, basse, accords pompés, arpège)
//   36 → 41 s : montage serré (roulement, plus d'énergie)  41 → 45 s : impact final + accord qui s'éteint
export const BPM = 120, TEMPS = 60 / BPM;
const FREQ = (n) => 440 * 2 ** ((n - 69) / 12); // numéro MIDI → Hz
// Grilles d'accords (une par « graine ») : la 1re est celle de la pub TikTok
const GRILLES = [
  { accords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]], basses: [33, 29, 36, 31] }, // Am F C G
  { accords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], basses: [28, 36, 31, 26] }, // Em C G D
  { accords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], basses: [26, 34, 29, 36] }, // Dm Bb F C
  { accords: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], basses: [33, 31, 29, 28] }, // Am G F E
];
const MOTIFS = [[0, 1, 2, 1, 0, 2, 1, 2], [0, 2, 1, 2, 0, 1, 2, 1], [2, 1, 0, 1, 2, 0, 1, 0], [0, 1, 2, 2, 1, 0, 2, 1]];

export async function composer(duree = 45, { graine = 0, frequence = 48000 } = {}) {
  const { accords: ACCORDS, basses: BASSES } = GRILLES[graine % GRILLES.length], MOTIF = MOTIFS[Math.floor(graine / GRILLES.length) % MOTIFS.length];
  const ctx = new OfflineAudioContext(2, Math.ceil(duree * frequence), frequence);
  // Chaîne de sortie : compresseur doux + volume général
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.12;
  const general = ctx.createGain(); general.gain.value = 0.9;
  comp.connect(general).connect(ctx.destination);
  // Réverbération (impulsion générée)
  const reverb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, frequence * 1.8, frequence);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3; }
  reverb.buffer = ir;
  const retour = ctx.createGain(); retour.gain.value = 0.28; reverb.connect(retour).connect(comp);
  // Bruit blanc réutilisable
  const bruit = ctx.createBuffer(1, frequence * 2, frequence);
  { const d = bruit.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const sourceBruit = (t, dureeN) => { const s = ctx.createBufferSource(); s.buffer = bruit; s.start(t); s.stop(t + dureeN); return s; };
  const env = (g, t, a, pic, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pic, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel); };

  // ---------- Instruments ----------
  function kick(t, force = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.003, 0.95 * force, 0.38);
    o.connect(g).connect(comp); o.start(t); o.stop(t + 0.45);
    const clic = sourceBruit(t, 0.02), f = ctx.createBiquadFilter(), gc = ctx.createGain();
    f.type = "highpass"; f.frequency.value = 3000; env(gc, t, 0.001, 0.25 * force, 0.015);
    clic.connect(f).connect(gc).connect(comp);
  }
  function clap(t, force = 1) {
    for (const d of [0, 0.012, 0.024]) {
      const n = sourceBruit(t + d, 0.25), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 0.9;
      env(g, t + d, 0.002, 0.42 * force, d === 0.024 ? 0.2 : 0.02);
      n.connect(f).connect(g); g.connect(comp); g.connect(reverb);
    }
  }
  function charley(t, ouvert = false, force = 1) {
    const n = sourceBruit(t, 0.3), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    f.type = "highpass"; f.frequency.value = 7500; p.pan.value = 0.25;
    env(g, t, 0.001, (ouvert ? 0.16 : 0.12) * force, ouvert ? 0.18 : 0.04);
    n.connect(f).connect(g).connect(p).connect(comp);
  }
  function basse(t, note, dureeN) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o2.type = "square"; o.frequency.value = FREQ(note); o2.frequency.value = FREQ(note - 12);
    f.type = "lowpass"; f.Q.value = 6; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + dureeN);
    // creux après chaque grosse caisse (effet « pompe »)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.06); g.gain.setValueAtTime(0.32, t + dureeN - 0.03); g.gain.linearRampToValueAtTime(0.0001, t + dureeN);
    o.connect(f); o2.connect(f); f.connect(g).connect(comp);
    o.start(t); o2.start(t); o.stop(t + dureeN); o2.stop(t + dureeN);
  }
  function nappe(t, notes, dureeN, { pompe = true, ouverture = 2400, volume = 0.07 } = {}) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.frequency.value = ouverture; f.Q.value = 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(volume, t + 0.03);
    if (pompe) for (let b = 0; b < dureeN / TEMPS; b++) { const tb = t + b * TEMPS; g.gain.setValueAtTime(volume * 0.15, tb + 0.005); g.gain.linearRampToValueAtTime(volume, tb + TEMPS * 0.7); }
    g.gain.setValueAtTime(volume, t + dureeN - 0.05); g.gain.linearRampToValueAtTime(0.0001, t + dureeN);
    f.connect(g); g.connect(comp); g.connect(reverb);
    for (const n of notes) for (const desaccord of [-9, 0, 9]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = FREQ(n); o.detune.value = desaccord;
      const p = ctx.createStereoPanner(); p.pan.value = desaccord / 14; o.connect(p).connect(f); o.start(t); o.stop(t + dureeN);
    }
  }
  function pluck(t, note, force = 1) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = "square"; o.frequency.value = FREQ(note);
    f.type = "lowpass"; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    p.pan.value = Math.sin(t * 3) * 0.4;
    env(g, t, 0.002, 0.075 * force, 0.17);
    o.connect(f).connect(g).connect(p); p.connect(comp); p.connect(reverb); o.start(t); o.stop(t + 0.22);
  }
  function montee(t0, t1) { // souffle qui monte avant le drop
    const n = ctx.createBufferSource(); n.buffer = bruit; n.loop = true;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.Q.value = 2; f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(9000, t1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t1 - 0.02); g.gain.linearRampToValueAtTime(0.0001, t1);
    n.connect(f).connect(g); g.connect(comp); g.connect(reverb); n.start(t0); n.stop(t1);
  }
  function impact(t) { // coup + souffle long (début du drop, fin)
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    env(g, t, 0.005, 0.7, 1.4); o.connect(g).connect(comp); o.start(t); o.stop(t + 1.5);
    const n = sourceBruit(t, 2), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    f.type = "highpass"; f.frequency.value = 4000; env(gn, t, 0.002, 0.2, 1.8);
    n.connect(f).connect(gn); gn.connect(comp); gn.connect(reverb);
  }

  // ---------- Partition ----------
  const mesure = 4 * TEMPS;
  // Intro 0 → 4 s : accords filtrés, sans batterie, puis roulement et montée
  for (let m = 0; m < 2; m++) nappe(m * mesure, ACCORDS[m], mesure, { pompe: false, ouverture: 700 + m * 500, volume: 0.06 });
  montee(1.5, 4);
  for (let i = 0; i < 8; i++) clap(2 + i * 0.25, 0.35 + i * 0.05); // roulement qui accélère
  for (let i = 0; i < 8; i++) clap(3 + i * 0.125, 0.6 + i * 0.04);
  impact(4);

  // Drop 4 s → (fin − 4 s)
  const finDrop = duree - 4;
  for (let t = 4, m = 0; t < finDrop - 0.01; t += mesure, m++) {
    const k = m % 4, serre = t >= finDrop - 5;
    nappe(t, ACCORDS[k], Math.min(mesure, finDrop - t), { ouverture: serre ? 3400 : 2400, volume: serre ? 0.08 : 0.07 });
    for (let b = 0; b < 4; b++) {
      const tb = t + b * TEMPS;
      if (tb >= finDrop) break;
      kick(tb);
      if (b % 2 === 1) clap(tb);
      charley(tb + TEMPS / 2, b === 3);
      if (serre || t >= 12) { charley(tb + TEMPS / 4, false, 0.6); charley(tb + (3 * TEMPS) / 4, false, 0.6); }
      // basse en croches, sur la fondamentale (octave au contretemps)
      basse(tb + TEMPS / 2 - 0.0, BASSES[k] + (b % 2 ? 12 : 0), TEMPS / 2);
      basse(tb, BASSES[k], TEMPS / 2 - 0.02);
    }
    // arpège à partir de 12 s
    if (t >= 12) {
      const motif = MOTIF;
      for (let i = 0; i < 16; i++) { const tn = t + i * (TEMPS / 2) / 2 * 1; if (tn < finDrop) pluck(tn, ACCORDS[k][motif[i % 8]] + 12, i % 4 === 0 ? 1 : 0.7); }
    }
  }
  // Petites montées avant chaque changement de partie
  for (let fin = 12; fin < finDrop - 2; fin += 8) montee(fin - 1, fin);
  montee(finDrop - 1.5, finDrop);
  for (let i = 0; i < 8; i++) clap(finDrop - 1 + i * 0.125, 0.5 + i * 0.06);

  // Fin : impact, accord tenu qui s'éteint
  impact(finDrop);
  kick(finDrop, 1.1);
  nappe(finDrop, [...ACCORDS[0], ACCORDS[0][0] + 12], 3.8, { pompe: false, ouverture: 2000, volume: 0.08 });
  basse(finDrop, BASSES[0], 1.5);

  return ctx.startRendering();
}

// AudioBuffer → fichier WAV 16 bits stéréo
export function versWav(buffer) {
  const n = buffer.length, canaux = buffer.numberOfChannels, f = buffer.sampleRate;
  const v = new DataView(new ArrayBuffer(44 + n * canaux * 2));
  const ecrire = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  ecrire(0, "RIFF"); v.setUint32(4, 36 + n * canaux * 2, true); ecrire(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, canaux, true); v.setUint32(24, f, true); v.setUint32(28, f * canaux * 2, true); v.setUint16(32, canaux * 2, true); v.setUint16(34, 16, true);
  ecrire(36, "data"); v.setUint32(40, n * canaux * 2, true);
  const donnees = [...Array(canaux)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < canaux; c++) { v.setInt16(o, Math.max(-1, Math.min(1, donnees[c][i])) * 32767, true); o += 2; }
  return new Blob([v], { type: "audio/wav" });
}
