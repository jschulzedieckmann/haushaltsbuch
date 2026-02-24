"""
ingest_csv.py — ING DiBa CSV-Ingestion Tool
Layer 3: Deterministic Execution Tool

Verwendung:
    python tools/ingest_csv.py "INGDIBA sample.csv"
    python tools/ingest_csv.py path/to/export1.csv path/to/export2.csv

Umgebungsvariablen (.env):
    SUPABASE_URL   — Supabase-Projekt-URL
    SUPABASE_KEY   — Supabase anon/service-role Key
"""

import csv
import hashlib
import json
import os
import sys
import logging
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://pvbnqtzolybmqagawdmr.supabase.co")
SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2Ym5xdHpvbHlibXFhZ2F3ZG1yIiwicm9sZSI6"
    "ImFub24iLCJpYXQiOjE3NzE4NDUzODAsImV4cCI6MjA4NzQyMTM4MH0."
    "UfnLnJnxXgpsohsDUkiuRnTXxx4bKlEbQPpl1XilZIg",
)
CSV_ENCODING = "latin-1"
CSV_DELIMITER = ";"
HEADER_MARKER = "Buchung"          # Erste Spalte des eigentlichen Tabellen-Headers
TMP_DIR = Path(__file__).parent.parent / ".tmp"

# ---------------------------------------------------------------------------
# Logging-Setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ingest_csv")


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def parse_german_decimal(s: str) -> Optional[Decimal]:
    """Konvertiert '1.234,56' → Decimal('1234.56'). None bei Fehler."""
    try:
        cleaned = s.strip().replace(".", "").replace(",", ".")
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def parse_german_date(s: str) -> Optional[str]:
    """Konvertiert 'TT.MM.JJJJ' → 'YYYY-MM-DD'. None bei Fehler."""
    try:
        return datetime.strptime(s.strip(), "%d.%m.%Y").date().isoformat()
    except ValueError:
        return None


def make_transaction_id(source_file: str, row_index: int) -> str:
    """Deterministischer SHA-256-Hash für Idempotenz."""
    key = f"{source_file}:{row_index}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def find_header_row(lines: list[str]) -> int:
    """Sucht die Zeile, die mit HEADER_MARKER beginnt. Wirft ValueError wenn nicht gefunden."""
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(HEADER_MARKER):
            return i
    raise ValueError(
        f"Kein Tabellen-Header gefunden (erwartet Zeile, die mit '{HEADER_MARKER}' beginnt)."
    )


# ---------------------------------------------------------------------------
# Supabase REST-Helper (ohne externe Bibliotheken)
# ---------------------------------------------------------------------------

def supabase_post(endpoint: str, payload: list[dict], upsert_on_conflict: str = "") -> dict:
    """
    Sendet einen POST-Request an die Supabase REST API.
    upsert_on_conflict: Spaltenname(n) für ON CONFLICT, z.B. 'source_file,row_index'
    """
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    if upsert_on_conflict:
        headers["Prefer"] = f"resolution=ignore-duplicates,return=minimal"

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": resp.status, "ok": True}
    except urllib.error.HTTPError as e:
        body_err = e.read().decode("utf-8", errors="replace")
        return {"status": e.code, "ok": False, "error": body_err}


def supabase_upsert_transaction(payload: list[dict]) -> dict:
    """Upsert auf transactions-Tabelle (conflict = transaction_id)."""
    url = f"{SUPABASE_URL}/rest/v1/transactions"
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": resp.status, "ok": True}
    except urllib.error.HTTPError as e:
        body_err = e.read().decode("utf-8", errors="replace")
        return {"status": e.code, "ok": False, "error": body_err}


# ---------------------------------------------------------------------------
# CSV-Parser
# ---------------------------------------------------------------------------

def parse_csv(file_path: Path) -> list[dict]:
    """
    Liest eine ING DiBa CSV-Datei und gibt eine Liste von Rohdaten-Dicts zurück.
    Überspringt leere Zeilen und Metadaten-Kopfzeilen.
    """
    with open(file_path, encoding=CSV_ENCODING, errors="replace") as f:
        raw_lines = f.readlines()

    header_idx = find_header_row(raw_lines)
    log.info(f"  Header gefunden in Zeile {header_idx}: {raw_lines[header_idx].strip()[:80]}")

    # CSV ab Header-Zeile parsen
    data_lines = raw_lines[header_idx:]
    reader = csv.DictReader(data_lines, delimiter=CSV_DELIMITER)

    rows = []
    for row_index, record in enumerate(reader):
        # Leere Zeilen überspringen
        if not any(v.strip() for v in record.values()):
            continue
        rows.append({
            "row_index": row_index,
            "record": dict(record),
        })

    log.info(f"  {len(rows)} Daten-Zeilen geparst.")
    return rows


# ---------------------------------------------------------------------------
# Ingestion-Logik
# ---------------------------------------------------------------------------

CHUNK_SIZE = 50  # Zeilen pro API-Batch


def ingest_file(file_path: Path) -> dict:
    """
    Verarbeitet eine einzelne CSV-Datei:
    1. Parst CSV
    2. Schreibt raw_ing_exports (idempotent)
    3. Schreibt transactions (upsert)
    Gibt Zusammenfassung zurück.
    """
    source_file = file_path.name
    log.info(f"=== Starte Ingestion: {source_file} ===")

    rows = parse_csv(file_path)
    if not rows:
        log.warning("Keine Daten-Zeilen gefunden. Abbruch.")
        return {"source_file": source_file, "parsed": 0, "inserted_raw": 0, "upserted_tx": 0, "errors": []}

    errors = []
    raw_batch = []
    tx_batch = []

    for item in rows:
        row_index = item["row_index"]
        r = item["record"]

        # Spalten normalisieren (robuste Schlüsselzuordnung)
        buchung               = r.get("Buchung", "").strip()
        wertstellung          = r.get("Wertstellungsdatum", "").strip()
        auftraggeber          = r.get("Auftraggeber/Empfänger", r.get("Auftraggeber/Empf\xe4nger", "")).strip()
        buchungstext          = r.get("Buchungstext", "").strip()
        verwendungszweck      = r.get("Verwendungszweck", "").strip()
        saldo_str             = r.get("Saldo", "").strip()
        saldo_waehrung        = ""
        betrag_str            = r.get("Betrag", "").strip()
        betrag_waehrung       = ""

        # Währungsspalten: CSV hat zwei Spalten "Währung" → DictReader nummeriert sie
        # Suche nach Schlüsseln mit "hrung" (latin-1 Ä-Varianten)
        waehrung_vals = [v.strip() for k, v in r.items() if "hrung" in k or "Währung" in k or "W\xe4hrung" in k]
        if len(waehrung_vals) >= 1:
            saldo_waehrung = waehrung_vals[0]
        if len(waehrung_vals) >= 2:
            betrag_waehrung = waehrung_vals[1]

        # Datum parsen
        booking_date = parse_german_date(buchung)
        value_date = parse_german_date(wertstellung)

        if not booking_date:
            errors.append({"row_index": row_index, "error": f"Ungültiges Datum: '{buchung}'"})
            log.warning(f"  Zeile {row_index}: Ungültiges Datum '{buchung}' — übersprungen.")
            continue

        # Betrag parsen
        amount = parse_german_decimal(betrag_str)
        if amount is None:
            errors.append({"row_index": row_index, "error": f"Ungültiger Betrag: '{betrag_str}'"})
            log.warning(f"  Zeile {row_index}: Ungültiger Betrag '{betrag_str}' — übersprungen.")
            continue

        transaction_id = make_transaction_id(source_file, row_index)

        raw_batch.append({
            "source_file": source_file,
            "row_index": row_index,
            "buchung": buchung,
            "wertstellungsdatum": wertstellung,
            "auftraggeber_empfaenger": auftraggeber,
            "buchungstext": buchungstext,
            "verwendungszweck": verwendungszweck,
            "saldo": saldo_str,
            "saldo_waehrung": saldo_waehrung or "EUR",
            "betrag": betrag_str,
            "betrag_waehrung": betrag_waehrung or "EUR",
        })

        tx_batch.append({
            "transaction_id": transaction_id,
            "source_file": source_file,
            "booking_date": booking_date,
            "value_date": value_date or booking_date,
            "amount": float(amount),
            "currency": betrag_waehrung or "EUR",
            "counterparty": auftraggeber,
            "memo": verwendungszweck or buchungstext,
            "tags": [],
        })

    # --- Batch-Uploads ---
    inserted_raw = 0
    upserted_tx = 0

    # raw_ing_exports (ignoriere Duplikate)
    for i in range(0, len(raw_batch), CHUNK_SIZE):
        chunk = raw_batch[i:i + CHUNK_SIZE]
        result = supabase_post("raw_ing_exports", chunk, upsert_on_conflict="source_file,row_index")
        if result["ok"]:
            inserted_raw += len(chunk)
            log.info(f"  raw_ing_exports: Chunk {i//CHUNK_SIZE + 1} — {len(chunk)} Zeilen OK")
        else:
            log.error(f"  raw_ing_exports Fehler: {result.get('error', '')[:200]}")
            errors.append({"chunk": i, "table": "raw_ing_exports", "error": result.get("error", "")})

    # transactions (upsert bei bekannter transaction_id)
    for i in range(0, len(tx_batch), CHUNK_SIZE):
        chunk = tx_batch[i:i + CHUNK_SIZE]
        result = supabase_upsert_transaction(chunk)
        if result["ok"]:
            upserted_tx += len(chunk)
            log.info(f"  transactions: Chunk {i//CHUNK_SIZE + 1} — {len(chunk)} Zeilen OK")
        else:
            log.error(f"  transactions Fehler: {result.get('error', '')[:200]}")
            errors.append({"chunk": i, "table": "transactions", "error": result.get("error", "")})

    summary = {
        "source_file": source_file,
        "parsed": len(rows),
        "valid": len(raw_batch),
        "inserted_raw": inserted_raw,
        "upserted_tx": upserted_tx,
        "errors": errors,
    }
    log.info(f"=== Fertig: {summary} ===")
    return summary


# ---------------------------------------------------------------------------
# Haupt-Einstiegspunkt
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Verwendung: python tools/ingest_csv.py <csv_datei> [weitere_csv_dateien...]")
        sys.exit(1)

    TMP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = TMP_DIR / f"ingestion_log_{timestamp}.json"

    all_summaries = []
    for arg in sys.argv[1:]:
        path = Path(arg)
        if not path.exists():
            log.error(f"Datei nicht gefunden: {path}")
            continue
        summary = ingest_file(path)
        all_summaries.append(summary)

    # Log speichern
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(all_summaries, f, ensure_ascii=False, indent=2)
    log.info(f"Ingestion-Log gespeichert: {log_path}")

    # Abschluß-Report
    print("\n" + "=" * 60)
    print("INGESTION ABGESCHLOSSEN")
    print("=" * 60)
    for s in all_summaries:
        status = "✅" if not s["errors"] else "⚠️"
        print(f"{status}  {s['source_file']}")
        print(f"    Geparst:    {s['parsed']}")
        print(f"    Valide:     {s['valid']}")
        print(f"    Raw-Insert: {s['inserted_raw']}")
        print(f"    TX-Upsert:  {s['upserted_tx']}")
        if s["errors"]:
            print(f"    Fehler:     {len(s['errors'])}")
    print(f"\nLog: {log_path}")


if __name__ == "__main__":
    main()
