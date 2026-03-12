# SEPA XML Generator für Vereine

Kostenloser, browserbasierter SEPA XML Generator für Vereinskassierer.  
CSV oder Excel hochladen → Spalten zuordnen → XML für die Bank erzeugen.

- **SEPA-Lastschrift** (pain.008.001.02) — Mitgliedsbeiträge einziehen
- **SEPA-Überweisung** (pain.001.001.03) — Zahlungen senden
- Kompatibel mit VR-Banken, Sparkassen und allen SEPA-fähigen Instituten
- **Alle Daten bleiben im Browser** — kein Server, kein Backend

---

## Deployment auf Cloudflare Pages

### Voraussetzungen

- Ein [GitHub](https://github.com)-Account
- Ein [Cloudflare](https://dash.cloudflare.com)-Account (kostenlos)

### Schritt 1: GitHub Repository erstellen

```bash
# Repository auf GitHub erstellen (z.B. "sepa-xml-generator")
# Dann lokal:

cd sepa-generator
git init
git add .
git commit -m "Initial commit: SEPA XML Generator"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/sepa-xml-generator.git
git push -u origin main
```

### Schritt 2: Cloudflare Pages verbinden

1. Gehe zu [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. Wähle **Pages** → **Connect to Git**
3. Autorisiere GitHub und wähle dein Repository `sepa-xml-generator`
4. Konfiguriere den Build:

   | Einstellung | Wert |
   |---|---|
   | **Framework preset** | `Vite` |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | **Node.js version** | `18` (oder höher) |

5. Klicke **Save and Deploy**

Cloudflare baut und deployed die Seite automatisch. Nach 1–2 Minuten ist sie live unter:
```
https://sepa-xml-generator.pages.dev
```

### Schritt 3: Eigene Domain verbinden (optional)

Da du Cloudflare bereits für `bluemlingspfad.de` nutzt:

1. Gehe zu **Workers & Pages** → dein Projekt → **Custom domains**
2. Klicke **Set up a custom domain**
3. Trage ein: `sepa.bluemlingspfad.de`
4. Cloudflare erstellt automatisch den CNAME-Eintrag

Die Seite ist dann unter `https://sepa.bluemlingspfad.de` erreichbar.

### Automatische Updates

Bei jedem `git push` auf `main` baut Cloudflare automatisch neu:

```bash
# Änderung machen, committen, pushen:
git add .
git commit -m "Feature: XYZ hinzugefügt"
git push
# → Cloudflare deployed automatisch in ~60 Sekunden
```

---

## Lokal entwickeln

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Lokal bauen

```bash
npm run build
npm run preview
# → http://localhost:4173
```

---

## Projektstruktur

```
sepa-generator/
├── index.html          # HTML-Entry mit SEO Meta-Tags
├── package.json        # Dependencies (React, Vite, xlsx)
├── vite.config.js      # Vite Build-Konfiguration
├── public/
│   └── favicon.svg     # Favicon
└── src/
    ├── main.jsx        # React Entry Point
    └── App.jsx         # Komplette SEPA Generator App
```

## Lizenz

MIT
