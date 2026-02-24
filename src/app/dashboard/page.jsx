'use client';
import { useEffect, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, Filler, Tooltip, Legend,
} from 'chart.js';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);

const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const fmtShort = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k €` : `${n.toFixed(0)} €`);

function KpiCard({ label, value, sub, positive, isPercent }) {
    return (
        <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>{label}</span>
            <span className={`${styles.kpiValue} ${positive ? styles.green : positive === false ? styles.red : ''}`}>
                {isPercent ? `${value} %` : fmt(value)}
            </span>
            {sub && <span className={styles.kpiSub}>{sub}</span>}
        </div>
    );
}

export default function DashboardPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/dashboard')
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => { setError('Daten konnten nicht geladen werden.'); setLoading(false); });
    }, []);

    if (loading) return (
        <div className={styles.loadingScreen}>
            <div className={styles.loadingOrb} />
            <p>Lade Finanzdaten…</p>
        </div>
    );
    if (error) return <div className={styles.errorScreen}>{error}</div>;

    const { summary, cashflowSeries, topCategories, recentTransactions } = data;
    const labels = cashflowSeries.map(m => m.label);

    const barData = {
        labels,
        datasets: [
            {
                label: 'Einnahmen',
                data: cashflowSeries.map(m => m.einnahmen),
                backgroundColor: 'rgba(74,222,128,0.75)',
                borderRadius: 6,
                borderSkipped: false,
            },
            {
                label: 'Ausgaben',
                data: cashflowSeries.map(m => m.ausgaben),
                backgroundColor: 'rgba(249,115,22,0.65)',
                borderRadius: 6,
                borderSkipped: false,
            },
        ],
    };

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }, tooltip: {
                backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1,
                titleColor: '#fff', bodyColor: '#9ca3af', padding: 12,
                callbacks: { label: ctx => ` ${fmt(ctx.raw)}` },
            }
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 12 } } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 12 }, callback: v => fmtShort(v) } },
        },
    };

    const nettoLine = cashflowSeries.map(m => m.einnahmen - m.ausgaben);
    const lineData = {
        labels,
        datasets: [{
            label: 'Cashflow',
            data: nettoLine,
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74,222,128,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: '#4ade80',
        }],
    };
    const lineOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }, tooltip: {
                backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1,
                titleColor: '#fff', bodyColor: '#9ca3af', padding: 10,
                callbacks: { label: ctx => ` ${fmt(ctx.raw)}` },
            }
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#4b5563', font: { size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4b5563', font: { size: 11 }, callback: v => fmtShort(Math.abs(v)) } },
        },
    };

    const nettoPositiv = summary.netto >= 0;

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerBrand}>
                    <div className={styles.headerOrb} />
                    <span className={styles.headerTitle}>Haushaltsbuch</span>
                </div>
                <nav className={styles.nav}>
                    <button className={`${styles.navBtn} ${styles.navActive}`}>Übersicht</button>
                    <button className={styles.navBtn}>Kategorien</button>
                    <button className={styles.navBtn}>Transaktionen</button>
                </nav>
                <div className={styles.headerRight}>
                    <span className={styles.headerYear}>2025</span>
                </div>
            </header>

            {/* Bento Grid */}
            <main className={styles.grid}>

                {/* Kachel 1: Balkendiagramm (groß, 2/3) */}
                <div className={`card ${styles.chartCard}`}>
                    <div className={styles.cardHeader}>
                        <div>
                            <h2 className={styles.cardTitle}>Einnahmen &amp; Ausgaben</h2>
                            <p className={styles.cardSub}>Monatsübersicht 2025</p>
                        </div>
                        <div className={styles.legendRow}>
                            <span className={styles.legendDot} style={{ background: '#4ade80' }} />
                            <span className={styles.legendLabel}>Einnahmen</span>
                            <span className={styles.legendDot} style={{ background: '#f97316' }} />
                            <span className={styles.legendLabel}>Ausgaben</span>
                        </div>
                    </div>
                    <div className={styles.chartWrap}>
                        <Bar data={barData} options={barOptions} />
                    </div>
                </div>

                {/* Kachel 2: KPI (1/3) */}
                <div className={`card ${styles.kpiPanel}`}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>Jahresbilanz 2025</h2>
                    </div>
                    <div className={styles.kpiHero}>
                        <span className={`${styles.kpiHeroNum} ${nettoPositiv ? styles.green : styles.red}`}>
                            {fmt(summary.netto)}
                        </span>
                        <span className={`badge ${nettoPositiv ? 'pos' : 'neg'}`}>
                            {nettoPositiv ? '▲' : '▼'} Netto
                        </span>
                    </div>
                    <div className={styles.kpiGrid}>
                        <KpiCard label="Einnahmen" value={summary.einnahmen} positive={true} />
                        <KpiCard label="Ausgaben" value={summary.ausgaben} positive={false} />
                        <KpiCard
                            label="Sparquote"
                            value={summary.sparquote}
                            sub={`${summary.sparquote} % vom Einkommen`}
                            positive={summary.sparquote > 0}
                            isPercent={true}
                        />
                    </div>
                </div>

                {/* Kachel 3: Cashflow-Kurve */}
                <div className={`card ${styles.lineCard}`}>
                    <div className={styles.cardHeader}>
                        <div>
                            <h2 className={styles.cardTitle}>Cashflow-Verlauf</h2>
                            <p className={styles.cardSub}>Monatliches Netto</p>
                        </div>
                    </div>
                    <div className={styles.lineWrap}>
                        <Line data={lineData} options={lineOptions} />
                    </div>
                </div>

                {/* Kachel 4: Top-Kategorien */}
                <div className={`card ${styles.catCard}`}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>Top Ausgaben</h2>
                        <p className={styles.cardSub}>Kategorien 2025</p>
                    </div>
                    <div className={styles.catList}>
                        {topCategories.map(cat => (
                            <div key={cat.category_id} className={styles.catRow}>
                                <div className={styles.catLeft}>
                                    <span className={styles.catDot} style={{ background: cat.color }} />
                                    <span className={styles.catLabel}>{cat.label}</span>
                                </div>
                                <div className={styles.catRight}>
                                    <span className={styles.catAmount}>{fmt(cat.amount)}</span>
                                    <div className={styles.catBar}>
                                        <div className={styles.catBarFill}
                                            style={{ width: `${Math.min(cat.share, 100).toFixed(1)}%`, background: cat.color }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Kachel 5: Feature Card */}
                <div className={`card ${styles.featureCard}`}>
                    <div className={styles.featureOrb} />
                    <div className={styles.featureContent}>
                        <h2 className={styles.featureTitle}>
                            {summary.netto < 0
                                ? 'Ausgaben übersteigen Einnahmen!'
                                : 'Gut gemacht!'}
                        </h2>
                        <p className={styles.featureSub}>
                            {summary.netto < 0
                                ? `Differenz: ${fmt(Math.abs(summary.netto))}`
                                : `Gespart: ${fmt(summary.netto)}`}
                        </p>
                    </div>
                </div>

                {/* Kachel 6: Letzte Transaktionen */}
                <div className={`card ${styles.txCard}`}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>Letzte Buchungen</h2>
                    </div>
                    <div className={styles.txList}>
                        {recentTransactions.map(tx => (
                            <div key={tx.id} className={styles.txRow}>
                                <div className={styles.txLeft}>
                                    <span className={styles.txDate}>{tx.date}</span>
                                    <span className={styles.txCounterparty}>{tx.counterparty}</span>
                                    {tx.categoryLabel && (
                                        <span className={styles.txCat} style={{ background: tx.categoryColor + '22', color: tx.categoryColor }}>
                                            {tx.categoryLabel}
                                        </span>
                                    )}
                                </div>
                                <span className={`${styles.txAmount} ${tx.amount >= 0 ? styles.green : styles.red}`}>
                                    {fmt(tx.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

            </main>
        </div>
    );
}
