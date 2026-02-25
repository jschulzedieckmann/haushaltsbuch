import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/categories/[id]?year=2026
export async function GET(request, { params }) {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear());
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    const [catRes, txRes] = await Promise.all([
        supabase.from('categories').select('*').eq('category_id', id).single(),
        supabase.from('transactions')
            .select('transaction_id, booking_date, amount, counterparty, memo')
            .eq('category_id', id)
            .gte('booking_date', yearStart)
            .lte('booking_date', yearEnd)
            .order('booking_date', { ascending: false }),
    ]);

    if (catRes.error) return NextResponse.json({ error: catRes.error.message }, { status: 404 });

    const transactions = txRes.data || [];
    const totalAmount  = transactions.reduce((s, t) => s + Number(t.amount), 0);
    const count        = transactions.length;

    // Monatliche Aggregation für das gewählte Jahr
    const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const monthMap = {};
    months.forEach((m, i) => { monthMap[i] = { label: m, amount: 0 }; });
    transactions.forEach(t => {
        const m = new Date(t.booking_date).getMonth();
        monthMap[m].amount += Math.abs(Number(t.amount));
    });

    return NextResponse.json({
        category: catRes.data,
        year,
        summary: { totalAmount, count },
        monthlySeries: Object.values(monthMap),
        transactions: transactions.map(t => ({
            id:          t.transaction_id,
            date:        t.booking_date,
            amount:      Number(t.amount),
            counterparty: t.counterparty || '—',
            memo:        t.memo || '',
        })),
    });
}
