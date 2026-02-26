import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/transactions/months — liefert alle YYYY-MM die tatsächlich Buchungen haben
export async function GET() {
    const { data, error } = await supabase
        .from('transactions')
        .select('booking_date')
        .order('booking_date', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Eindeutige YYYY-MM-Werte extrahieren (absteigend sortiert = neueste zuerst)
    const seen = new Set();
    const months = [];
    for (const row of data || []) {
        if (!row.booking_date) continue;
        const ym = row.booking_date.slice(0, 7); // 'YYYY-MM'
        if (!seen.has(ym)) {
            seen.add(ym);
            months.push(ym);
        }
    }

    return NextResponse.json({ months });
}
