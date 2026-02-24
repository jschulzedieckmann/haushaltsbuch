import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PATCH /api/transactions/[id] — Kategorie einer Transaktion zuweisen
export async function PATCH(request, { params }) {
    const { id } = params;
    const { category_id } = await request.json();

    const { data, error } = await supabase
        .from('transactions')
        .update({ category_id: category_id || null })
        .eq('transaction_id', id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// GET /api/transactions/[id] — einzelne Transaktion
export async function GET(request, { params }) {
    const { id } = params;

    const { data, error } = await supabase
        .from('transactions')
        .select('*, categories(label, color_hex)')
        .eq('transaction_id', id)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
}
