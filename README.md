# Bus Rouen Live

Application Next.js non officielle pour consulter les vehicules, arrets, favoris et perturbations du reseau Astuce autour de Rouen.

Les donnees viennent de flux open data publics, notamment GTFS et GTFS-RT quand ils sont disponibles. L'application ne depend pas de fichiers locaux: les routes API recuperent les donnees depuis des URL publiques.

## Installation

```bash
npm install
```

## Developpement

```bash
npm run dev
```

Puis ouvrir:

```text
http://localhost:3000
```

## Build production

```bash
npm run build
```

Cette commande verifie que l'application compile comme sur Vercel.

Pour verifier TypeScript separement:

```bash
npm run typecheck
```

## Routes API

- `/api/vehicles`: positions temps reel GTFS-RT des vehicules Astuce.
- `/api/stops`: arrets et lignes issus du GTFS officiel Astuce.
- `/api/disruptions`: perturbations issues du flux Service Alerts.
- `/api/trip-details?tripId=...`: details d'un trajet depuis le GTFS.
- `/api/test`: route de test simple.

Les routes sont compatibles avec Vercel Serverless Functions. Les routes qui appellent les flux externes ont une duree maximale configuree a 30 secondes.

## Deploiement gratuit sur Vercel

1. Pousser le projet sur GitHub, GitLab ou Bitbucket.
2. Aller sur Vercel puis choisir `Add New Project`.
3. Importer le depot.
4. Garder les reglages par defaut:
   - Framework Preset: `Next.js`
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: laisse vide
5. Deployer.

Aucune cle API n'est necessaire pour les fonds de carte utilises ni pour les flux open data actuellement connectes.

## PWA

L'application inclut un `manifest.json`, une icone et un service worker minimal. Sur mobile, elle peut etre ajoutee a l'ecran d'accueil depuis le menu du navigateur.

## Confidentialite

La position est utilisee dans le navigateur pour calculer les arrets proches. Les favoris sont stockes localement dans le navigateur via `localStorage`.
