import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabase } from '@/lib/supabase';

// ING DiBa CSV latin-1 → UTF-8 Mapping für häufige Sonderzeichen
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

        // Einfaches Semikolon-Split (ING hat keine Anführungszeichen innerhalb von Feldern)
        const fields = line.split(';').map(f => f.replace(/^"|"$/g, '').trim());

        if (fields.length < 8) continue;

        const [buchung, wertstellungsdatum, auftraggeber, buchungstext, verwendungszweck, saldo, saldoWaehrung, betrag, betragWaehrung] = fields;

        const bookingDate = parseGermanDate(buchung);
        const amount = parseGermanDecimal(betrag);
        const balanceAfter = parseGermanDecimal(saldo);

        if (!bookingDate || amount === null) continue;

        const txId = makeTransactionId(filename, dataRowIdx);

        rawRows.push({
            transaction_id: txId,
            source_file: filename,
            row_index: dataRowIdx,
            buchung: buchung || null,
            wertstellungsdatum: wertstellungsdatum || null,
            auftraggeber_empfaenger: auftraggeber || null,
            buchungstext: buchungstext || null,
            verwendungszweck: verwendungszweck || null,
            saldo: balanceAfter,
            saldo_waehrung: saldoWaehrung || 'EUR',
            betrag: amount,
            betrag_waehrung: betragWaehrung || 'EUR',
        });

        transactions.push({
            transaction_id: txId,
            booking_date: bookingDate,
            amount: amount,
            currency: betragWaehrung || 'EUR',
            counterparty: auftraggeber || null,
            memo: verwendungszweck || buchungstext || null,
            balance_after: balanceAfter,
            source_file: filename,
            raw_row_index: dataRowIdx,
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

        // Batch-Upsert (50er Batches)
        const BATCH = 50;
        let rawInserted = 0;
        let txInserted = 0;
        let errors = [];

        for (let i = 0; i < rawRows.length; i += BATCH) {
            const batch = rawRows.slice(i, i + BATCH);
            const { error } = await supabase
                .from('raw_ing_exports')
                .upsert(batch, { onConflict: 'transaction_id', ignoreDuplicates: true });
            if (error) errors.push(`raw_batch_${i}: ${error.message}`);
            else rawInserted += batch.length;
        }

        for (let i = 0; i < transactions.length; i += BATCH) {
            const batch = transactions.slice(i, i + BATCH);
            const { error } = await supabase
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
        });
    } catch (err) {
        console.error('Upload error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
