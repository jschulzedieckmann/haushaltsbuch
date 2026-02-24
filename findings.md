# Findings & Research Log

## Discovery Responses (2026-02-23)
- North Star: Familien-Haushaltsbuch mit Echtzeit-Dashboard fuer Ausgabenuebersicht.
- Integrations: ING DiBa Kontoexporte (CSV), weitere Integrationen aktuell nicht geplant.
- Source of Truth: Zentrale Datenbank, die iterativ aufgebaut und mit den Exporten bestueckt wird.
- Delivery Payload: Moderne Website (spaeter im offiziellen Umfeld gehostet).
- Behavioral Rules: Keine speziellen Ton- oder Verbotsregeln bisher; harte Vorgabe ist Daten nicht zu ueberschreiben und Aggregationen konsistent zu halten.

## Stack Decisions (2026-02-23)
- Repositories & Storage: Nutzer legt ING-CSV-Exporte im GitHub-Repo unter Haushaltsbuch/ ab; Versionierung + Historie laufen somit ueber Git.
- Hosting: Frontend/Dashboard wird per Vercel bereitgestellt (GitHub → Vercel Pipeline erforderlich).
- Datenbank: Supabase (PostgreSQL + Auth) dient als persistente Datenbasis fuer normalisierte Transaktionen und Kategorien.
- User Roles: Ein einzelner Admin besitzt Vollzugriff; kein separates Rollen-/Rechtekonzept notwendig.
- Kategorieverwaltung: Aktuell kein dedizierter Workflow; Kategorien können direkt in der DB oder spaeter per UI editiert werden.

## ING CSV Sample Findings (2026-02-23)
- Beispiel-Datei: INGDIBA sample.csv (Semikolon-getrennt, UTF-8, deutsche Sonderzeichen, Dezimaltrennzeichen ",").
- Kopfzeilen/Metadaten: Mehrere Informationszeilen (IBAN, Zeitraum, Saldo) vor den Tabellendaten → Parser muss bis zur Kopfzeile `Buchung;Wertstellungsdatum;...` scrollen.
- Spalten laut Sample: `Buchung`, `Wertstellungsdatum`, `Auftraggeber/Empfaenger`, `Buchungstext`, `Verwendungszweck`, `Saldo`, `Waehrung` (Saldo), `Betrag`, `Waehrung` (Betrag).
- Betrags- und Saldo-Felder nutzen Komma als Dezimaltrennzeichen und Punkt als Tausendertrennzeichen; Werte sind bereits mit Vorzeichen versehen.
- Es existieren doppelte Waehrungs-Spalten; beide stehen in EUR im Sample, aber Schema muss beide Felder getrennt ablegen fuer eventuelle Abweichungen.
- Datenmenge: >900 Zeilen fuer 2025 → Ingestion-Skripte muessen Streaming oder Chunking zur Speicheroptimierung nutzen.

## Open Questions / Constraints
1. Supabase: Welche Policies/Row-Level-Security sollen gelten und wie erfolgt Auth (Supabase Auth vs. Vercel Middleware) solange nur ein Admin aktiv ist?
2. Supabase Credentials: Zugriffsdaten werden separat bereitgestellt → Link-Phase blockiert bis Secrets vorliegen.
3. Daten-Lifecycle: Wie lange werden Roh-CSV-Dateien in GitHub gehalten, und braucht es eine Archivierungsstrategie?
4. Design Translation: designinspo.png (Design/designinspo.png) muss in konkrete UI-Komponenten uebersetzt werden (Farben, Typografie, Layout-Abmessungen extrahieren).

## Supabase-Verbindung (2026-02-23)
- Projekt: `pvbnqtzolybmqagawdmr` -- Name: Haushaltsbuch
- Region: `eu-west-1` (Frankfurt/Irland) AKTIV
- Status: `ACTIVE_HEALTHY`
- Postgres Engine: Version 17
- Tabellen: aktuell leer -- DB-Schema muss per Migration angelegt werden
- MCP-Zugriff: funktioniert direkt

## Design-Analyse (2026-02-23)
- Referenz: "Solis" Dashboard -- Dark-Mode, Bento-Grid, gruen
- Hintergrund: `#0A0A0A`, Card: `#111111`, Border: `#2A2A2A`
- Akzentfarben: Gruen `#4ADE80`, Orange `#F97316`, Rot `#EF4444`
- Layout: 12-spaltig, Bento-Kacheln, Card-Radius 16-20px
- Font: Inter (400/600/700)
- Hauptkomponenten: Balkendiagramm (Einnahmen/Ausgaben), KPI-Karten, Area-Chart (Cashflow-Kurve), Kategorie-Liste, Feature-/KI-Karte
- Chart-Empfehlung: Chart.js oder Recharts
- Vollstaendige Analyse: `brain/design_analyse.md`

## Research Queue
- [ ] Beispiele fuer Haushaltsbuch-Dashboards (GitHub, open-source budgeting apps) analysieren.
- [ ] Best Practices fuer CSV-Ingestion + Idempotenz bei Bankexporten dokumentieren.
- [x] UI-Design-Muster fuer moderne Finanz-Dashboards sammeln -- abgeschlossen via designinspo.png.
- [ ] Vercel + Supabase Referenzarchitekturen fuer Finanz-Apps recherchieren.
- [x] Visuelle Attribute aus designinspo.png katalogisieren -- abgeschlossen (design_analyse.md).

Additional findings will be appended chronologisch mit Zeitstempel.
