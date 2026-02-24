'use client';
import { useEffect, useState, useRef } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, Filler, Tooltip, Legend,
} from 'chart.js';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);

const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const fmtShort = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k €` : `${n.toFixed(0)} €`);

// ─── KPI Card ───
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

// ─── Upload Modal ───
function UploadModal({ onClose, onSuccess }) {
    const [dragging, setDragging] = useState(false);
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const inputRef = useRef();

    async function upload(f) {
        setFile(f);
        setUploading(true);
        setError('');
        setResult(null);
        const fd = new FormData();
        fd.append('file', f);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
            setResult(data);
            onSuccess?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) upload(f);
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>CSV Import</h2>
                    <button className={styles.modalClose} onClick={onClose}>✕</button>
                </div>
                <p className={styles.modalSub}>ING DiBa CSV-Export hochladen (latin-1, semikolongetrennt)</p>

                <div
                    className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".csv"
                        style={{ display: 'none' }}
                        onChange={e => e.target.files[0] && upload(e.target.files[0])}
                    />
                    {uploading ? (
                        <div className={styles.uploadingSpinner}><div className={styles.spinner} /><span>Wird verarbeitet…</span></div>
                    ) : (
                        <>
                            <div className={styles.dropIcon}>📂</div>
                            <p className={styles.dropText}>CSV hier hineinziehen oder klicken</p>
                            {file && <p className={styles.dropFile}>{file.name}</p>}
                        </>
                    )}
                </div>

                {result && (
                    <div className={styles.uploadResult}>
                        <span className={styles.green}>✓ Erfolgreich</span>
                        <span>{result.parsed} geparst, {result.txInserted} neu importiert</span>
                        {result.errors?.length > 0 && <span className={styles.red}>{result.errors.length} Fehler</span>}
                    </div>
                )}
                {error && <p className={styles.uploadError}>{error}</p>}
            </div>
        </div>
    );
}

// ─── Transaktionen-Tab ───
function TransaktionenTab() {
    const [txData, setTxData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [query, setQuery] = useState('');

    useEffect(() => {
        setLoading(true);
        fetch(`/api/transactions?page=${page}&search=${encodeURIComponent(query)}`)
            .then(r => r.json())
            .then(d => { setTxData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [page, query]);

    function handleSearch(e) {
        e.preventDefault();
        setPage(1);
        setQuery(search);
    }

    return (
        <div className={styles.tabContent}>
            <div className={styles.txToolbar}>
                <form onSubmit={handleSearch} className={styles.searchForm}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Suche nach Gegenpartei oder Verwendungszweck…"
                    />
                    <button type="submit" className={styles.searchBtn}>Suchen</button>
                </form>
                {txData && <span className={styles.txCount}>{txData.total.toLocaleString('de-DE')} Buchungen</span>}
            </div>

            {loading ? <div className={styles.tabLoading}><div className={styles.spinner} /></div> : (
                <>
                    <div className={styles.txTable}>
                        <div className={styles.txTableHead}>
                            <span>Datum</span><span>Gegenpartei</span><span>Verwendungszweck</span><span>Kategorie</span><span>Betrag</span>
                        </div>
                        {(txData?.transactions || []).map(tx => (
                            <div key={tx.id} className={styles.txTableRow}>
                                <span className={styles.txDateCell}>{tx.date}</span>
                                <span className={styles.txCounterCell} title={tx.counterparty}>{tx.counterparty}</span>
                                <span className={styles.txMemoCell} title={tx.memo}>{tx.memo || '—'}</span>
                                <span>
                                    {tx.categoryLabel
                                        ? <span className={styles.txCatBadge} style={{ background: tx.categoryColor + '22', color: tx.categoryColor }}>{tx.categoryLabel}</span>
                                        : <span className={styles.txCatEmpty}>—</span>}
                                </span>
                                <span className={`${styles.txAmountCell} ${tx.amount >= 0 ? styles.green : styles.red}`}>
                                    {fmt(tx.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                    {txData && txData.pages > 1 && (
                        <div className={styles.pagination}>
                            <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Zurück</button>
                            <span className={styles.pageInfo}>Seite {page} / {txData.pages}</span>
                            <button className={styles.pageBtn} disabled={page >= txData.pages} onClick={() => setPage(p => p + 1)}>Weiter →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Kategorien-Tab ───
function KategorienTab() {
    const [cats, setCats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/categories')
            .then(r => r.json())
            .then(d => { setCats(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <div className={styles.tabLoading}><div className={styles.spinner} /></div>;

    return (
        <div className={styles.tabContent}>
            <p className={styles.catHint}>
                💡 Kategorien werden in Supabase verwaltet. Transaktionen erhalten automatisch eine Kategorie sobald eine Zuordnungsregel definiert ist.
            </p>
            <div className={styles.catGrid}>
                {(cats || []).map(cat => (
                    <div key={cat.category_id} className={styles.catGridCard}>
                        <div className={styles.catGridDot} style={{ background: cat.color_hex || '#9CA3AF' }} />
                        <div>
                            <p className={styles.catGridLabel}>{cat.label}</p>
                            {cat.parent_id && <p className={styles.catGridParent}>Unterkategorie</p>}
                        </div>
                        <div className={styles.catGridActive} style={{ color: cat.active ? '#4ade80' : '#ef4444' }}>
                            {cat.active ? '● Aktiv' : '○ Inaktiv'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Übersicht-Tab ───
function UebersichtTab({ data }) {
    const { summary, cashflowSeries, topCategories, recentTransactions } = data;
    const labels = cashflowSeries.map(m => m.label);

    const barData = {
        labels,
        datasets: [
            { label: 'Einnahmen', data: cashflowSeries.map(m => m.einnahmen), backgroundColor: 'rgba(74,222,128,0.75)', borderRadius: 6, borderSkipped: false },
            { label: 'Ausgaben', data: cashflowSeries.map(m => m.ausgaben), backgroundColor: 'rgba(249,115,22,0.65)', borderRadius: 6, borderSkipped: false },
        ],
    };
    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1, titleColor: '#fff', bodyColor: '#9ca3af', padding: 12, callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } } },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 12 } } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 12 }, callback: v => fmtShort(v) } },
        },
    };

    const nettoLine = cashflowSeries.map(m => m.einnahmen - m.ausgaben);
    const lineData = {
        labels,
        datasets: [{ label: 'Cashflow', data: nettoLine, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#4ade80' }],
    };
    const lineOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1, titleColor: '#fff', bodyColor: '#9ca3af', padding: 10, callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } } },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#4b5563', font: { size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4b5563', font: { size: 11 }, callback: v => fmtShort(Math.abs(v)) } },
        },
    };

    const nettoPositiv = summary.netto >= 0;

    return (
        <main className={styles.grid}>
            {/* Balkendiagramm */}
            <div className={`card ${styles.chartCard}`}>
                <div className={styles.cardHeader}>
                    <div><h2 className={styles.cardTitle}>Einnahmen &amp; Ausgaben</h2><p className={styles.cardSub}>Monatsübersicht 2025</p></div>
                    <div className={styles.legendRow}>
                        <span className={styles.legendDot} style={{ background: '#4ade80' }} /><span className={styles.legendLabel}>Einnahmen</span>
                        <span className={styles.legendDot} style={{ background: '#f97316' }} /><span className={styles.legendLabel}>Ausgaben</span>
                    </div>
                </div>
                <div className={styles.chartWrap}><Bar data={barData} options={barOptions} /></div>
            </div>

            {/* KPI Panel */}
            <div className={`card ${styles.kpiPanel}`}>
                <div className={styles.cardHeader}><h2 className={styles.cardTitle}>Jahresbilanz 2025</h2></div>
                <div className={styles.kpiHero}>
                    <span className={`${styles.kpiHeroNum} ${nettoPositiv ? styles.green : styles.red}`}>{fmt(summary.netto)}</span>
                    <span className={`badge ${nettoPositiv ? 'pos' : 'neg'}`}>{nettoPositiv ? '▲' : '▼'} Netto</span>
                </div>
                <div className={styles.kpiGrid}>
                    <KpiCard label="Einnahmen" value={summary.einnahmen} positive={true} />
                    <KpiCard label="Ausgaben" value={summary.ausgaben} positive={false} />
                    <KpiCard label="Sparquote" value={summary.sparquote} sub={`${summary.sparquote} % vom Einkommen`} positive={summary.sparquote > 0} isPercent={true} />
                </div>
            </div>

            {/* Cashflow */}
            <div className={`card ${styles.lineCard}`}>
                <div className={styles.cardHeader}><div><h2 className={styles.cardTitle}>Cashflow-Verlauf</h2><p className={styles.cardSub}>Monatliches Netto</p></div></div>
                <div className={styles.lineWrap}><Line data={lineData} options={lineOptions} /></div>
            </div>

            {/* Top Ausgaben */}
            <div className={`card ${styles.catCard}`}>
                <div className={styles.cardHeader}><h2 className={styles.cardTitle}>Top Ausgaben</h2><p className={styles.cardSub}>Kategorien 2025</p></div>
                <div className={styles.catList}>
                    {topCategories.map(cat => (
                        <div key={cat.category_id} className={styles.catRow}>
                            <div className={styles.catLeft}><span className={styles.catDot} style={{ background: cat.color }} /><span className={styles.catLabel}>{cat.label}</span></div>
                            <div className={styles.catRight}>
                                <span className={styles.catAmount}>{fmt(cat.amount)}</span>
                                <div className={styles.catBar}><div className={styles.catBarFill} style={{ width: `${Math.min(cat.share, 100).toFixed(1)}%`, background: cat.color }} /></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature Card */}
            <div className={`card ${styles.featureCard}`}>
                <div className={styles.featureOrb} />
                <div className={styles.featureContent}>
                    <h2 className={styles.featureTitle}>{summary.netto < 0 ? 'Ausgaben übersteigen Einnahmen!' : 'Gut gemacht!'}</h2>
                    <p className={styles.featureSub}>{summary.netto < 0 ? `Differenz: ${fmt(Math.abs(summary.netto))}` : `Gespart: ${fmt(summary.netto)}`}</p>
                </div>
            </div>

            {/* Letzte Buchungen */}
            <div className={`card ${styles.txCard}`}>
                <div className={styles.cardHeader}><h2 className={styles.cardTitle}>Letzte Buchungen</h2></div>
                <div className={styles.txList}>
                    {recentTransactions.map(tx => (
                        <div key={tx.id} className={styles.txRow}>
                            <div className={styles.txLeft}>
                                <span className={styles.txDate}>{tx.date}</span>
                                <span className={styles.txCounterparty}>{tx.counterparty}</span>
                                {tx.categoryLabel && <span className={styles.txCat} style={{ background: tx.categoryColor + '22', color: tx.categoryColor }}>{tx.categoryLabel}</span>}
                            </div>
                            <span className={`${styles.txAmount} ${tx.amount >= 0 ? styles.green : styles.red}`}>{fmt(tx.amount)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}

// ─── Haupt-Export ───
export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState('uebersicht');
    const [dashData, setDashData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showUpload, setShowUpload] = useState(false);

    function loadDashboard() {
        setLoading(true);
        fetch('/api/dashboard')
            .then(r => r.json())
            .then(d => { setDashData(d); setLoading(false); })
            .catch(() => { setError('Daten konnten nicht geladen werden.'); setLoading(false); });
    }

    useEffect(() => { loadDashboard(); }, []);

    if (loading) return (
        <div className={styles.loadingScreen}>
            <div className={styles.loadingOrb} />
            <p>Lade Finanzdaten…</p>
        </div>
    );
    if (error) return <div className={styles.errorScreen}>{error}</div>;

    return (
        <div className={styles.page}>
            {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); loadDashboard(); }} />}

            <header className={styles.header}>
                <div className={styles.headerBrand}>
                    <div className={styles.headerOrb} />
                    <span className={styles.headerTitle}>Haushaltsbuch</span>
                </div>
                <nav className={styles.nav}>
                    {[['uebersicht', 'Übersicht'], ['transaktionen', 'Transaktionen'], ['kategorien', 'Kategorien']].map(([id, label]) => (
                        <button key={id} className={`${styles.navBtn} ${activeTab === id ? styles.navActive : ''}`} onClick={() => setActiveTab(id)}>{label}</button>
                    ))}
                </nav>
                <div className={styles.headerRight}>
                    <button className={styles.uploadBtn} onClick={() => setShowUpload(true)}>⬆ CSV Import</button>
                    <span className={styles.headerYear}>2025</span>
                </div>
            </header>

            {activeTab === 'uebersicht' && dashData && <UebersichtTab data={dashData} />}
            {activeTab === 'transaktionen' && <TransaktionenTab />}
            {activeTab === 'kategorien' && <KategorienTab />}
        </div>
    );
}
