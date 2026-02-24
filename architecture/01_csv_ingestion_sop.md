# SOP 01: ING DiBa CSV-Ingestion

**Version:** 1.0 — 2026-02-23  
**Tool:** `tools/ingest_csv.py`

## Ziel
Eine oder mehrere ING DiBa CSV-Exportdateien idempotent in Supabase laden:
1. Rohdaten append-only in `raw_ing_exports`
2. Normalisierte Transaktionen upsert-fähig in `transactions`

## Eingabe
- CSV-Datei(en) im Format: **latin-1**, **Semikolon-Delimiter**
- Metadaten-Kopf vor dem eigentlichen Tabellen-Header (variable Anzahl Zeilen)
- Erkennbarer Header: erste Zeile, die mit `Buchung;` beginnt

## CSV-Spalten (bestätigt)
```
Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung
```

## Verarbeitungsschritte

### Schritt 1: Header-Suche
- Datei zeilenweise lesen (latin-1)
- Erste Zeile, die mit `Buchung;` beginnt → das ist Index `header_row`
- Alle Zeilen davor = Datei-Metadaten (ignorieren oder loggen)

### Schritt 2: CSV-Parsing
- `csv.reader` mit `delimiter=';'`
- Felder: `buchung`, `wertstellungsdatum`, `auftraggeber_empfaenger`, `buchungstext`, `verwendungszweck`, `saldo`, `saldo_waehrung`, `betrag`, `betrag_waehrung`
- Leere Zeilen überspringen

### Schritt 3: Idempotenz-Key erzeugen
```python
transaction_id = hashlib.sha256(
    f"{source_file}:{row_index}".encode()
).hexdigest()
```

### Schritt 4: Betrag normalisieren
```python
def parse_german_decimal(s: str) -> Decimal:
    # "1.234,56" → Decimal("1234.56")
    return Decimal(s.replace(".", "").replace(",", "."))
```

### Schritt 5: Datum normalisieren
```python
from datetime import datetime
booking_date = datetime.strptime(buchung, "%d.%m.%Y").date().isoformat()
```

### Schritt 6: Supabase-Upsert via MCP
- `raw_ing_exports`: INSERT mit `ON CONFLICT (source_file, row_index) DO NOTHING`
- `transactions`: UPSERT mit `ON CONFLICT (transaction_id) DO UPDATE SET updated_at = NOW()`

## Edge Cases & Invarianten
| Situation | Verhalten |
|---|---|
| Gleiche Datei zweimal importiert | Idempotent — kein Duplikat |
| Leere Zeilen in CSV | Überspringen |
| Betrag mit Tausenderpunkt | Korrekt geparst via `replace(".", "")` |
| Fehlende Felder | Leer-String, kein Abbruch |
| Ungültiges Datum | Log-Eintrag + Zeile überspringen |

## Ausgabe
- Stdout: Zusammenfassung (X Zeilen gelesen, Y eingefügt, Z übersprungen)
- `.tmp/ingestion_log_DATUM.json`: Detailliertes Log für Audit
