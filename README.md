# Orbit

Appli d'organisation perso (PC + iPhone) : tâches avec rappels réguliers, tâches qui se répètent, devoirs et emploi du temps Pronote, Google Agenda, assistant IA, rappels en message privé Discord.

- **App** : `index.html`, `style.css`, `app.js`, hébergée sur GitHub Pages. Installable (PWA) : sur iPhone, Safari → Partager → « Sur l'écran d'accueil ».
- **Serveur** : Supabase (dossier `supabase/functions/`)
  - `orbit-api` : toutes les données de l'app (protégée par le code d'accès Orbit), IA Gemini, lecture de Google Agenda via l'adresse iCal secrète.
  - `orbit-pronote` : lit devoirs + emploi du temps Pronote toutes les 30 min (lecture seule).
  - `orbit-notify` : envoie les rappels dus en MP Discord avec un ping (toutes les 5 min).

Aucune clé ni donnée perso n'est stockée dans ce dépôt : le code d'accès reste sur tes appareils, les clés sur le serveur.
