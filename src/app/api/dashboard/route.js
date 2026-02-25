import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        // Jahr aus Query-Param, Standard: aktuelles Jahr
        const year = parseInt(searchParams.get('year') || new Date().getFullYear());
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        // 1. Ausgaben nach Kategorie/Gegenpartei
        const { data: ausgabenTx } = await supabase
            .from('transactions')
            .select('category_id, counterparty, amount, categories(label, color_hex)')
            .lt('amount', 0)
            .gte('booking_date', yearStart)
            .lte('booking_date', yearEnd);

        const catMap = {};
        const COLORS = ['#4ade80', '#60a5fa', '#f97316', '#a78bfa', '#fb7185', '#fbbf24', '#34d399', '#f472b6'];
        let colorIdx = 0;

        (ausgabenTx || []).forEach(t => {
            const key = t.category_id || (t.counterparty || 'Sonstiges').trim().substring(0, 22);
            const label = t.categories?.label || (t.counterparty || 'Sonstiges').trim().substring(0, 22);
            const color = t.categories?.color_hex || (catMap[key]?.color ?? COLORS[colorIdx++ % COLORS.length]);
            if (!catMap[key]) catMap[key] = { category_id: key, label, color, amount: 0 };
            catMap[key].amount += Math.abs(Number(t.amount));
        });

        const totalAusgabenAbs = Object.values(catMap).reduce((s, c) => s + c.amount, 0);
        const topCategories = Object.values(catMap)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10)
            .map(c => ({ ...c, share: totalAusgabenAbs > 0 ? (c.amount / totalAusgabenAbs) * 100 : 0 }));

        // 2. Letzte 10 Buchungen (jahresübergreifend)
        const { data: recent } = await supabase
            .from('transactions')
            .select('transaction_id, booking_date, amount, counterparty, memo, category_id, categories(label, color_hex)')
            .order('booking_date', { ascending: false })
            .limit(10);

        // 3. Gesamtsummen für gewähltes Jahr
        const { data: totals } = await supabase
            .from('transactions')
            .select('amount')
            .gte('booking_date', yearStart)
            .lte('booking_date', yearEnd);

        const einnahmen = (totals || []).filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
        const ausgaben = (totals || []).filter(t => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
        const netto = einnahmen + ausgaben;

        // 4. Monatlicher Cashflow für gewähltes Jahr
        const { data: allTx } = await supabase
            .from('transactions')
            .select('booking_date, amount')
            .gte('booking_date', yearStart)
            .lte('booking_date', yearEnd);

        const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        const monthlyMap = {};
        months.forEach((m, i) => { monthlyMap[i + 1] = { label: m, einnahmen: 0, ausgaben: 0 }; });

        (allTx || []).forEach(t => {
            const month = new Date(t.booking_date).getMonth() + 1;
            const amt = Number(t.amount);
            if (amt > 0) monthlyMap[month].einnahmen += amt;
            else monthlyMap[month].ausgaben += Math.abs(amt);
        });

        const cashflowSeries = Object.values(monthlyMap);

        // 5. Verfügbare Jahre aus der Datenbank ermitteln
        const { data: yearRows } = await supabase
            .from('transactions')
            .select('booking_date')
            .order('booking_date', { ascending: true })
            .limit(1);
        const { data: yearRowsEnd } = await supabase
            .from('transactions')
            .select('booking_date')
            .order('booking_date', { ascending: false })
            .limit(1);

        const minYear = yearRows?.[0]?.booking_date
            ? new Date(yearRows[0].booking_date).getFullYear() : year;
        const maxYear = yearRowsEnd?.[0]?.booking_date
            ? new Date(yearRowsEnd[0].booking_date).getFullYear() : year;
        const availableYears = [];
        for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

        return NextResponse.json({
            year,
            availableYears,
            summary: {
                einnahmen: Math.round(einnahmen * 100) / 100,
                ausgaben: Math.round(Math.abs(ausgaben) * 100) / 100,
                netto: Math.round(netto * 100) / 100,
                sparquote: einnahmen > 0 ? Math.round((netto / einnahmen) * 100) : 0,
            },
            cashflowSeries,
            topCategories,
            recentTransactions: (recent || []).map(t => ({
                id: t.transaction_id,
                date: t.booking_date,
                amount: Number(t.amount),
                counterparty: t.counterparty || '—',
                memo: t.memo || '',
                categoryLabel: t.categories?.label || null,
                categoryColor: t.categories?.color_hex || '#9CA3AF',
            })),
        });
    } catch (err) {
        console.error('Dashboard API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
