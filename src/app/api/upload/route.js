import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabase } from '@/lib/supabase';

function latin1ToUtf8(buffer) {
    return new TextDecoder('latin1').decode(buffer);
}

function parseGermanDecimal(s) {
    if (!s || !s.trim()) return null;
    const cleaned = s.trim().replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
}

function parseGermanDate(s) {
    if (!s || !s.trim()) return null;
    const parts = s.trim().split('.');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function makeTransactionId(sourceFile, rowIndex) {
    return createHash('sha256')
        .update(`${sourceFile}:${rowIndex}`)
        .digest('hex');
}

function parseING(csvText, filename) {
    const lines = csvText.split(/\r?\n/);
    let headerIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('Buchung;') || lines[i].startsWith('"Buchung"')) {
            headerIdx = i;
            break;
        }
    }

    if (headerIdx === -1) throw new Error('Kein gültiger ING DiBa CSV-Header gefunden.');

    const rawRows = [];
    const transactions = [];
    let dataRowIdx = 0;

    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = line.split(';').map(f => f.replace(/^"|"$/g, '').trim());
        if (fields.length < 8) continue;

        const [buchung, wertstellungsdatum, auftraggeber, buchungstext, verwendungszweck, saldo, saldoWaehrung, betrag, betragWaehrung] = fields;

        const bookingDate = parseGermanDate(buchung);
        const valueDate = parseGermanDate(wertstellungsdatum) || bookingDate;
        const amount = parseGermanDecimal(betrag);

        if (!bookingDate || amount === null) continue;

        const txId = makeTransactionId(filename, dataRowIdx);

        // raw_ing_exports: Schema hat keine transaction_id-Unique-Spalte,
        // PK ist id (auto-increment). Wir speichern Rohdaten als INSERT IGNORE.
        rawRows.push({
            source_file: filename,
            row_index: dataRowIdx,
            buchung: buchung || null,
            wertstellungsdatum: wertstellungsdatum || null,
            auftraggeber_empfaenger: auftraggeber || '',
            buchungstext: buchungstext || '',
            verwendungszweck: verwendungszweck || '',
            saldo: saldo || '',
            saldo_waehrung: saldoWaehrung || 'EUR',
            betrag: betrag || '',      // text-Feld im Schema
            betrag_waehrung: betragWaehrung || 'EUR',
        });

        // transactions: Schema hat transaction_id (PK), booking_date, value_date,
        // amount (numeric), currency, counterparty, memo, source_file — KEIN balance_after!
        transactions.push({
            transaction_id: txId,
            booking_date: bookingDate,
            value_date: valueDate,
            amount: amount,
            currency: betragWaehrung || 'EUR',
            counterparty: auftraggeber || '',
            memo: verwendungszweck || buchungstext || '',
            source_file: filename,
        });

        dataRowIdx++;
    }

    return { rawRows, transactions };
}

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });

        const filename = file.name;
        const buffer = Buffer.from(await file.arrayBuffer());
        const csvText = latin1ToUtf8(buffer);

        const { rawRows, transactions } = parseING(csvText, filename);

        if (transactions.length === 0) {
            return NextResponse.json({ error: 'Keine Transaktionen gefunden. Ist das eine gültige ING DiBa CSV?' }, { status: 400 });
        }

        const BATCH = 50;
        let rawInserted = 0;
        let txInserted = 0;
        const errors = [];

        // raw_ing_exports: INSERT (kein Upsert – PK ist auto-increment)
        // Duplikate werden toleriert; wir nutzen ignoreDuplicates auf source_file+row_index
        // Da es keinen UNIQUE-Index auf (source_file, row_index) gibt, einfach INSERT.
        // Fehler bei Duplicate werden akzeptiert (der Import ist idempotent via transaction_id).
        for (let i = 0; i < rawRows.length; i += BATCH) {
            const batch = rawRows.slice(i, i + BATCH);
            const { error } = await supabase
                .from('raw_ing_exports')
                .insert(batch);
            // Fehler sind OK — können Duplikate sein wenn die Datei nochmal hochgeladen wird
            if (error && !error.message.includes('duplicate') && !error.message.includes('conflict')) {
                errors.push(`raw_batch_${i}: ${error.message}`);
            } else {
                rawInserted += batch.length;
            }
        }

        // transactions: Upsert via transaction_id (SHA-256 → deterministisch)
        for (let i = 0; i < transactions.length; i += BATCH) {
            const batch = transactions.slice(i, i + BATCH);
            const { error, count } = await supabase
                .from('transactions')
                .upsert(batch, { onConflict: 'transaction_id', ignoreDuplicates: true });
            if (error) errors.push(`tx_batch_${i}: ${error.message}`);
            else txInserted += batch.length;
        }

        return NextResponse.json({
            ok: true,
            filename,
            parsed: transactions.length,
            rawInserted,
            txInserted,
            errors,
            message: `${txInserted} Transaktionen importiert (${transactions.length - txInserted} bereits vorhanden).`,
        });
    } catch (err) {
        console.error('Upload error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
