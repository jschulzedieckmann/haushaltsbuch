import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('transactions')
        .select('transaction_id, booking_date, amount, counterparty, memo, categories(label, color_hex)', { count: 'exact' })
        .order('booking_date', { ascending: false })
        .range(from, to);

    if (search) {
        query = query.or(`counterparty.ilike.%${search}%,memo.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        transactions: (data || []).map(t => ({
            id: t.transaction_id,
            date: t.booking_date,
            amount: Number(t.amount),
            counterparty: t.counterparty || '—',
            memo: t.memo || '',
            categoryLabel: t.categories?.label || null,
            categoryColor: t.categories?.color_hex || '#6B7280',
        })),
        total: count || 0,
        page,
        pages: Math.ceil((count || 0) / limit),
    });
}
