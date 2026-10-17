// Langues de l'appli. Chaque texte affiché passe par t("cle"), avec repli sur le français.
// Le coach (IA) répond lui aussi dans la langue choisie : elle est envoyée au relais avec le profil.
import fr from "./langues/fr.js";

export const LANGUES = [
  { code: "fr", nom: "Français", locale: "fr-FR" },
  { code: "en", nom: "English", locale: "en-GB" },
  { code: "es", nom: "Español", locale: "es-ES" },
  { code: "pt", nom: "Português", locale: "pt-BR" },
  { code: "ar", nom: "العربية", locale: "ar", rtl: true },
];

let actuelle = "fr";
let dico = fr;

const CLE = "fitoumi-langue";
export function langueInitiale() {
  try { const l = localStorage.getItem(CLE); if (LANGUES.some((x) => x.code === l)) return l; } catch {}
  const nav = (navigator.language || "fr").slice(0, 2);
  return LANGUES.some((x) => x.code === nav) ? nav : "fr";
}

export async function changerLangue(code) {
  const l = LANGUES.find((x) => x.code === code) || LANGUES[0];
  dico = l.code === "fr" ? fr : (await import(`./langues/${l.code}.js`)).default;
  actuelle = l.code;
  try { localStorage.setItem(CLE, l.code); } catch {}
  document.documentElement.lang = l.code;
  document.documentElement.dir = l.rtl ? "rtl" : "ltr";
}

export const langue = () => actuelle;
export const locale = () => LANGUES.find((x) => x.code === actuelle)?.locale || "fr-FR";
export const nomLangue = () => LANGUES.find((x) => x.code === actuelle)?.nom || "Français";

// t("accueil.bonjour", { prenom: "Awa" }) → « Bonjour Awa »
export function t(cle, vars) {
  const brut = cle.split(".").reduce((o, k) => o?.[k], dico) ?? cle.split(".").reduce((o, k) => o?.[k], fr) ?? cle;
  if (typeof brut !== "string") return brut;
  return vars ? brut.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : brut;
}

// Dates et nombres dans la langue choisie
export const dateLongue = (d = new Date()) => d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
export const dateCourte = (d) => new Date(d).toLocaleDateString(locale(), { day: "numeric", month: "short" });
export const heureCourte = (d) => new Date(d).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
