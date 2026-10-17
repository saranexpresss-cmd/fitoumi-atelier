# Atelier vidéo Fitoumi

Ce dépôt fabrique automatiquement les vidéos courtes de [Fitoumi](https://fitoumi.com), le coach sportif IA gratuit.

- L'agent **Vidéaste** (Cloudflare) écrit un scénario et déclenche le rendu ici (`.github/workflows/video.yml`).
- Le moteur (`pub/studio-video.js`) calcule chaque image : coach 3D (three.js), textes animés, musique originale composée par code.
- Le MP4 est publié en « release », puis l'agent le diffuse sur la Page Facebook de Fitoumi.

Aucun secret n'est stocké dans ce dépôt. Avatars 3D : MakeHuman (CC0). three.js : licence MIT.
