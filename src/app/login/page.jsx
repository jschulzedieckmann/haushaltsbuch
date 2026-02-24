'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (res.ok) {
                router.push('/dashboard');
            } else {
                const data = await res.json();
                setError(data.error || 'Anmeldung fehlgeschlagen.');
            }
        } catch {
            setError('Verbindungsfehler. Bitte erneut versuchen.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className={styles.container}>
            <div className={styles.glow} />
            <div className={styles.card}>
                {/* Logo / Brand */}
                <div className={styles.brand}>
                    <div className={styles.orb} />
                    <div>
                        <h1 className={styles.title}>Haushaltsbuch</h1>
                        <p className={styles.subtitle}>Familien-Finanzübersicht 2025</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="username">Benutzername</label>
                        <input
                            id="username"
                            type="text"
                            className={styles.input}
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="Julian"
                            autoComplete="username"
                            required
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="password">Passwort</label>
                        <input
                            id="password"
                            type="password"
                            className={styles.input}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    {error && <p className={styles.error}>{error}</p>}
                    <button type="submit" className={styles.btn} disabled={loading}>
                        {loading ? 'Wird angemeldet…' : 'Anmelden →'}
                    </button>
                </form>
            </div>
        </main>
    );
}
