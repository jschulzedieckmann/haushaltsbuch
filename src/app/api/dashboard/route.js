import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        // 1. Monatliche Cashflow-Serie (Einnahmen + Ausgaben pro Monat)
        const { data: monthly, error: e1 } = await supabase.rpc('get_monthly_cashflow');

        // 2. Ausgaben-Aufschlüsselung: erst nach Kategorie, dann Fallback nach Gegenpartei
        const { data: ausgabenTx } = await supabase
            .from('transactions')
            .select('category_id, counterparty, amount, categories(label, color_hex)')
            .lt('amount', 0)
            .gte('booking_date', '2025-01-01')
            .lte('booking_date', '2025-12-31');

        // Aggregation: nach Kategorie wenn vorhanden, sonst nach Gegenpartei
        const catMap = {};
        const COLORS = ['#4ade80', '#60a5fa', '#f97316', '#a78bfa', '#fb7185', '#fbbf24', '#34d399', '#f472b6'];
        let colorIdx = 0;

        (ausgabenTx || []).forEach(t => {
            // Schlüssel: category_id > bereinigter counterparty-Name
            const key = t.category_id || (t.counterparty || 'Sonstiges').trim().substring(0, 22);
            const label = t.categories?.label || (t.counterparty || 'Sonstiges').trim().substring(0, 22);
            const color = t.categories?.color_hex || (catMap[key]?.color ?? COLORS[colorIdx++ % COLORS.length]);
            if (!catMap[key]) catMap[key] = { category_id: key, label, color, amount: 0 };
            catMap[key].amount += Math.abs(Number(t.amount));
        });

        const totalAusgabenAbs = Object.values(catMap).reduce((s, c) => s + c.amount, 0);
        const topCategories = Object.values(catMap)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)
            .map(c => ({ ...c, share: totalAusgabenAbs > 0 ? (c.amount / totalAusgabenAbs) * 100 : 0 }));
        const { data: recent, error: e3 } = await supabase
            .from('transactions')
            .select('transaction_id, booking_date, amount, counterparty, memo, category_id, categories(label, color_hex)')
            .order('booking_date', { ascending: false })
            .limit(10);

        // 4. Jahres-Gesamtsummen
        const { data: totals, error: e4 } = await supabase
            .from('transactions')
            .select('amount')
            .gte('booking_date', '2025-01-01')
            .lte('booking_date', '2025-12-31');

        if (e1 || e3) {
            console.error('Supabase errors:', e1, e3);
        }

        // Jahressummen berechnen
        const einnahmen = (totals || []).filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
        const ausgaben = (totals || []).filter(t => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
        const netto = einnahmen + ausgaben;

        // Monatliche Cashflow-Serie aus raw transactions berechnen (falls RPC nicht existiert)
        const { data: allTx } = await supabase
            .from('transactions')
            .select('booking_date, amount')
            .gte('booking_date', '2025-01-01')
            .lte('booking_date', '2025-12-31');

        const monthlyMap = {};
        const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        months.forEach((m, i) => { monthlyMap[i + 1] = { label: m, einnahmen: 0, ausgaben: 0 }; });

        (allTx || []).forEach(t => {
            const month = new Date(t.booking_date).getMonth() + 1;
            const amt = Number(t.amount);
            if (amt > 0) monthlyMap[month].einnahmen += amt;
            else monthlyMap[month].ausgaben += Math.abs(amt);
        });

        const cashflowSeries = Object.values(monthlyMap);

        return NextResponse.json({
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
