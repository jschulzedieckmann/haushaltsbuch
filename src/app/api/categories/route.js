import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/categories — neue Kategorie anlegen
export async function POST(request) {
    const body = await request.json();
    const { label, color_hex, parent_id } = body;

    if (!label?.trim()) return NextResponse.json({ error: 'Label darf nicht leer sein.' }, { status: 400 });

    // category_id aus label ableiten (lowercase, Umlaute ersetzen, Leerzeichen → -)
    const id = label.toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const { data, error } = await supabase
        .from('categories')
        .insert({ category_id: id, label: label.trim(), color_hex: color_hex || '#9CA3AF', parent_id: parent_id || null, active: true })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
}
