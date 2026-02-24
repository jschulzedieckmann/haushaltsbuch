import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PATCH /api/transactions/bulk — Kategorie für mehrere Transaktionen gleichzeitig setzen
export async function PATCH(request) {
    const { ids, category_id } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'Keine IDs angegeben.' }, { status: 400 });
    }

    const { error, count } = await supabase
        .from('transactions')
        .update({ category_id: category_id || null })
        .in('transaction_id', ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: count ?? ids.length });
}
