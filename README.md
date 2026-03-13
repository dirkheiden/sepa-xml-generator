# SEPA XML Generator

Kostenloser, browserbasierter SEPA XML Generator für Vereine und Organisationen.  
CSV oder Excel hochladen, Spalten zuordnen, SEPA-XML für Ihre Bank erzeugen.

## Features

- **SEPA-Lastschrift** — pain.008.001.02 für Beitragseinzug
- **SEPA-Überweisung** — pain.001.001.03 für Zahlungen
- **CSV & Excel-Import** mit automatischer Spaltenerkennung
- **IBAN-Validierung** mit Mod-97-Prüfsumme
- **BIC-Formatprüfung**
- **Vollständig clientseitig** — keine Daten verlassen den Browser
- Kompatibel mit allen SEPA-fähigen Banken

## Datenschutz

Alle Daten werden ausschließlich im Browser verarbeitet. Es werden keine Bankdaten, Namen oder andere personenbezogene Daten an einen Server übertragen. Die Anwendung verwendet keine Cookies und kein Tracking.

## Lokal entwickeln

```bash
npm install
npm run dev
```

## Bauen

```bash
npm run build
```

## Tech Stack

- React 18
- Vite
- SheetJS (xlsx) für Excel-Import

## Lizenz

MIT
