// Studio vidéo local des pubs Fitoumi (port 8792).
//   /www/…              → fichiers de l'appli (coach 3D), /www/studio.html et /www/studio.js → ce dossier
//   /pub/sortie/…       → voix off et minutages
//   POST /image?video=id&n=12 → enregistre une image JPEG ; POST /fin?video=id → assemble le MP4 (ffmpeg)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const ici = path.dirname(fileURLToPath(import.meta.url));
const www = path.join(ici, "..", "app", "www");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".bin": "application/octet-stream", ".wav": "audio/wav", ".glb": "model/gltf-binary" };
const idValide = (id) => /^[a-z0-9-]{1,40}$/.test(id || "");

function fichier(chemin) {
  if (/^\/www\/studio[a-z-]*\.(html|js)$/.test(chemin)) return path.join(ici, path.basename(chemin));
  if (chemin.startsWith("/www/")) return path.join(www, chemin.slice(5));
  if (chemin.startsWith("/pub/")) return path.join(ici, chemin.slice(5));
  return null;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const video = u.searchParams.get("video");
  if (req.method === "POST" && u.pathname === "/image" && idValide(video)) {
    const dossier = path.join(ici, "images", video);
    fs.mkdirSync(dossier, { recursive: true });
    const n = String(Number(u.searchParams.get("n")) || 0).padStart(5, "0");
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    fs.writeFileSync(path.join(dossier, `${n}.jpg`), Buffer.concat(morceaux));
    return res.end("ok");
  }
  // Musique composée dans la page (WAV) → sortie/<id>.wav
  if (req.method === "POST" && u.pathname === "/audio" && idValide(video)) {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    fs.writeFileSync(path.join(ici, "sortie", `${video}.wav`), Buffer.concat(morceaux));
    return res.end("ok");
  }
  if (req.method === "POST" && u.pathname === "/fin" && idValide(video)) {
    fs.mkdirSync(path.join(ici, "videos"), { recursive: true });
    const sortie = path.join(ici, "videos", `${video}.mp4`);
    const args = ["-y", "-framerate", "30", "-i", path.join(ici, "images", video, "%05d.jpg"), "-i", path.join(ici, "sortie", `${video}.wav`),
      "-af", "apad", "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", sortie];
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let journal = "";
    p.stderr.on("data", (d) => (journal = (journal + d).slice(-2000)));
    p.on("close", (code) => {
      if (code === 0) fs.rmSync(path.join(ici, "images", video), { recursive: true, force: true });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: code === 0, fichier: sortie, taille: code === 0 ? fs.statSync(sortie).size : 0, journal: code === 0 ? "" : journal }));
    });
    return;
  }
  const f = fichier(u.pathname);
  const racine = f && (f.startsWith(www) || f.startsWith(ici));
  if (!racine || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader("Content-Type", MIME[path.extname(f)] || "application/octet-stream");
  fs.createReadStream(f).pipe(res);
}).listen(8792, () => console.log("Studio : http://localhost:8792/www/studio.html"));
