# Project Constitution (gemini)

This document captures canonical data schemas, behavioral rules, and architectural invariants for the Familien-Haushaltsbuch automation. Updates to logic MUST be reflected here before any code changes.

## Data Schemas

### RawIngExportRow (Input CSV -> JSON projection)
```
{
  "source_file": string,              // unique identifier for the uploaded CSV
  "row_index": integer,               // 0-based row number to preserve ordering
  "buchung": string,                  // booking date string (TT.MM.JJJJ)
  "wertstellungsdatum": string,       // value date string (TT.MM.JJJJ)
  "auftraggeber_empfaenger": string,  // counterparty column
  "buchungstext": string,             // ING booking text descriptor
  "verwendungszweck": string,         // purpose / memo
  "saldo": string,                    // balance after booking (comma decimal, dot thousands)
  "saldo_waehrung": string,
  "betrag": string,                   // signed amount (comma decimal, dot thousands)
  "betrag_waehrung": string
}
```
*Notes:*
- CSV files are semicolon-delimited UTF-8 with descriptive metadata rows preceding the header `Buchung;Wertstellungsdatum;...`; ingestion must skip non-table lines but persist them as file-level metadata if needed.
- Decimal parsing must convert European format ("1.234,56") to canonical decimals while retaining the original string copy in `ing_metadata` for audits.
- Raw rows are stored (append-only) in Supabase alongside normalized transactions for full traceability.

### NormalizedTransaction (Primary table)
```
{
  "transaction_id": string,           // deterministic UUID (source_file + row_index hash)
  "source_file": string,
  "booking_date": string,             // ISO 8601 date (YYYY-MM-DD)
  "value_date": string,
  "amount": number,                   // signed decimal (negative = expense)
  "currency": "EUR",
  "counterparty": string,
  "memo": string,
  "category_id": string | null,
  "category_label": string | null,
  "tags": string[],
  "ing_metadata": RawIngExportRow,    // embedded original row for audits
  "created_at": string (ISO datetime),
  "updated_at": string (ISO datetime)
}
```
*Storage:* Resides in Supabase Postgres (`transactions` table). All writes occur via deterministic tools with upsert-by-`transaction_id` semantics.

### Category
```
{
  "category_id": string,              // e.g., slug
  "label": string,
  "parent_id": string | null,
  "color_hex": string,
  "active": boolean,
  "created_at": string,
  "updated_at": string
}
```

### DashboardPayload (delivered to frontend)
```
{
  "generated_at": string,
  "summary": {
    "month_to_date_spend": number,
    "month_to_date_budget": number | null,
    "delta_to_budget": number | null,
    "top_category": { "category_id": string, "amount": number }
  },
  "category_breakdown": [
    { "category_id": string, "label": string, "amount": number, "share": number }
  ],
  "cashflow_series": [
    { "date": string, "income": number, "expenses": number }
  ],
  "recent_transactions": [
    {
      "transaction_id": string,
      "booking_date": string,
      "counterparty": string,
      "amount": number,
      "category_label": string | null
    }
  ]
}
```

## Behavioral Rules
1. Data-first: never overwrite or mutate raw ING export rows; append-only ingestion with idempotent transaction IDs.
2. Dashboard must reflect aggregated state; partial uploads should not surface until ingestion validates successfully.
3. User-facing tone: clear, modern, family-friendly German labels (can refine during Stylize phase).
4. Access model: single admin user with full capabilities; no multi-role branching required initially. The final website MUST be protected by a login — credentials are stored in `.env` (DASHBOARD_USER / DASHBOARD_PASS) and as Vercel Environment Variables. Credentials MUST NOT appear in source code or git history.

## Architectural Invariants
- Three-layer separation (Architecture SOPs → Navigation logic → Tools) is mandatory. Tools execute only deterministic steps defined in SOPs.
- All scripts read configuration from `.env`; no hard-coded credentials. Supabase URLs/keys and Vercel tokens live only in env vars.
- Raw ING CSV uploads stay versioned in GitHub; tools treat the repo as the immutable ingestion queue before persisting to Supabase.
- `.tmp/` is the sole location for transient artifacts; delete after use.
- Any ingestion or dashboard change requires concurrent updates to the relevant SOP markdown inside `architecture/`.
- Frontend delivery targets Vercel; Navigation layer must ensure payloads are serialized for a static/ISR site build.

## Maintenance Log
- 2026-02-23: Initialized constitution with baseline schemas (pending confirmation once ING export samples are available).
- 2026-02-23: Updated RawIngExportRow schema with confirmed ING headers, documented GitHub/Vercel/Supabase stack decisions.
- 2026-02-23: Documented single-admin access rule; awaiting Supabase credential handoff and auth policy decisions.
- 2026-02-23: DB-Schema in Supabase `pvbnqtzolybmqagawdmr` per Migration angelegt:
  - `categories`: Slug-PK, Self-Referenz fuer Hierarchie, updated_at-Trigger, 24 Standard-Kategorien als Seed.
  - `raw_ing_exports`: Append-only, Unique(source_file, row_index), Originalstrings fuer Audit-Traceability.
  - `transactions`: SHA-256-PK (Idempotenz), FKs auf beide Tabellen, 4 Indizes, updated_at-Trigger.
  - HINWEIS: RLS noch deaktiviert — vor Vercel-Deployment aktivieren (Single-Admin-Policy erforderlich).
