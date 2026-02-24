import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'haushaltsbuch-secret-2026'
);

export async function POST(request) {
    const { username, password } = await request.json();

    const validUser = (process.env.DASHBOARD_USER || 'Julian').trim();
    const validPass = (process.env.DASHBOARD_PASS || '').trim();

    if (username.trim() !== validUser || password !== validPass) {
        return NextResponse.json({ error: 'Ungültige Anmeldedaten.' }, { status: 401 });
    }

    const token = await new SignJWT({ sub: username })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(SECRET);

    const response = NextResponse.json({ ok: true });
    response.cookies.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 Stunden
        path: '/',
    });

    return response;
}
