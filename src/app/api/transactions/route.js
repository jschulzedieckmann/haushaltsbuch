import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const VALID_SORT = {
    date: 'booking_date',
    counterparty: 'counterparty',
    memo: 'memo',
    amount: 'amount',
};

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const month = searchParams.get('month') || '';     // 'YYYY-MM' oder ''
    const sortKey = searchParams.get('sort') || 'date';
    const dir = searchParams.get('dir') === 'asc';  // true = asc, false = desc (default)

    const limit = 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const sortCol = VALID_SORT[sortKey] || 'booking_date';

    let query = supabase
        .from('transactions')
        .select('transaction_id, booking_date, amount, counterparty, memo, categories(label, color_hex)', { count: 'exact' })
        .order(sortCol, { ascending: dir })
        .range(from, to);

    if (search) {
        query = query.or(`counterparty.ilike.%${search}%,memo.ilike.%${search}%`);
    }

    if (month) {
        // month = 'YYYY-MM' → Bereich des Monats berechnen
        const [y, m] = month.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        query = query
            .gte('booking_date', `${month}-01`)
            .lte('booking_date', `${month}-${String(lastDay).padStart(2, '0')}`);
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
