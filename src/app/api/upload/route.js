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

/**
 * Inhaltsbasierte transaction_id:
 * Gleiche Buchung (=gleicher Inhalt) in unterschiedlichen Dateien
 * erhält dieselbe ID → Upsert ist automatisch idempotent.
 */
function makeTransactionId(bookingDate, amount, counterparty, memo) {
    return createHash('sha256')
        .update(`${bookingDate}|${amount}|${counterparty ?? ''}|${memo ?? ''}`)
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
    // Dedup-Set für Duplikate innerhalb derselben CSV-Datei
    const seenKeys = new Set();
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
        const counterparty = auftraggeber || '';
        const memo = verwendungszweck || buchungstext || '';

        if (!bookingDate || amount === null) continue;

        // Inhaltsbasierter Fingerprint — Duplikate innerhalb der Datei überspringen
        const contentKey = `${bookingDate}|${amount}|${counterparty}|${memo}`;
        if (seenKeys.has(contentKey)) continue;
        seenKeys.add(contentKey);

        const txId = makeTransactionId(bookingDate, amount, counterparty, memo);

        rawRows.push({
            source_file: filename,
            row_index: dataRowIdx,
            buchung: buchung || null,
            wertstellungsdatum: wertstellungsdatum || null,
            auftraggeber_empfaenger: counterparty,
            buchungstext: buchungstext || '',
            verwendungszweck: verwendungszweck || '',
            saldo: saldo || '',
            saldo_waehrung: saldoWaehrung || 'EUR',
            betrag: betrag || '',
            betrag_waehrung: betragWaehrung || 'EUR',
        });

        transactions.push({
            transaction_id: txId,
            booking_date: bookingDate,
            value_date: valueDate,
            amount: amount,
            currency: betragWaehrung || 'EUR',
            counterparty,
            memo,
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
        let txSkipped = 0;
        const errors = [];

        // raw_ing_exports: einfaches INSERT (Rohdaten, kein Inhalt-Dedup nötig)
        for (let i = 0; i < rawRows.length; i += BATCH) {
            const batch = rawRows.slice(i, i + BATCH);
            const { error } = await supabase.from('raw_ing_exports').insert(batch);
            if (error && !error.message.includes('duplicate') && !error.message.includes('conflict')) {
                errors.push(`raw_batch_${i}: ${error.message}`);
            } else {
                rawInserted += batch.length;
            }
        }

        // transactions: Upsert auf transaction_id (inhaltsbasiert).
        // ignoreDuplicates: true → vorhandene Zeilen bleiben unverändert.
        for (let i = 0; i < transactions.length; i += BATCH) {
            const batch = transactions.slice(i, i + BATCH);
            const { error, data } = await supabase
                .from('transactions')
                .upsert(batch, { onConflict: 'transaction_id', ignoreDuplicates: true })
                .select('transaction_id');
            if (error) {
                errors.push(`tx_batch_${i}: ${error.message}`);
            } else {
                const inserted = (data || []).length;
                txInserted += inserted;
                txSkipped += batch.length - inserted;
            }
        }

        return NextResponse.json({
            ok: true,
            filename,
            parsed: transactions.length,
            rawInserted,
            txInserted,
            txSkipped,
            errors,
            message: `${txInserted} neu importiert, ${txSkipped} bereits vorhanden, ${transactions.length} in der Datei.`,
        });
    } catch (err) {
        console.error('Upload error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
