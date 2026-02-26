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

// ─── Transaktion-Detail-Modal ───
function TxDetailModal({ tx, categories, onClose, onSaved }) {
    const [savedCatId, setSavedCatId] = useState(tx.catId ?? null);
    const [saving, setSaving] = useState(false);
    const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

    async function save(catId) {
        setSaving(true);
        await fetch(`/api/transactions/${tx.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: catId }),
        });
        setSavedCatId(catId);
        setSaving(false);
        onSaved?.();
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>Transaktion</h2>
                    <button className={styles.modalClose} onClick={onClose}>✕</button>
                </div>
                <div className={styles.txDetailGrid}>
                    <div className={styles.txDetailRow}><span className={styles.txDetailLabel}>Datum</span><span className={styles.txDetailVal}>{tx.date}</span></div>
                    <div className={styles.txDetailRow}><span className={styles.txDetailLabel}>Gegenpartei</span><span className={styles.txDetailVal}>{tx.counterparty}</span></div>
                    <div className={styles.txDetailRow}><span className={styles.txDetailLabel}>Verwendungszweck</span><span className={styles.txDetailVal}>{tx.memo || '—'}</span></div>
                    <div className={styles.txDetailRow}><span className={styles.txDetailLabel}>Betrag</span><span className={`${styles.txDetailVal} ${tx.amount >= 0 ? styles.green : styles.red}`}>{fmt(tx.amount)}</span></div>
                </div>
                <div className={styles.txDetailCatSection}>
                    <p className={styles.txDetailLabel} style={{ marginBottom: 10 }}>Kategorie zuweisen</p>
                    <div className={styles.catPickerGrid}>
                        {(categories || []).map(cat => (
                            <button
                                key={cat.category_id}
                                className={`${styles.catPickerBtn} ${savedCatId === cat.category_id ? styles.catPickerActive : ''}`}
                                style={{ '--pick-color': cat.color_hex }}
                                onClick={() => save(cat.category_id)}
                                disabled={saving}
                            >
                                <span className={styles.catPickerDot} style={{ background: cat.color_hex }} />
                                {cat.label}
                            </button>
                        ))}
                        <button className={`${styles.catPickerBtn} ${savedCatId === null ? styles.catPickerActive : ''}`} onClick={() => save(null)} disabled={saving}>
                            <span className={styles.catPickerDot} style={{ background: '#374151' }} />Keine Kategorie
                        </button>
                    </div>
                    {savedCatId !== undefined && <p className={styles.green} style={{ fontSize: '12px', marginTop: '8px' }}>✓ Gespeichert</p>}
                </div>
            </div>
        </div>
    );
}

// ─── Transaktionen-Tab ───
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function ymToLabel(ym) {
    const [y, m] = ym.split('-');
    return `${MONTHS_DE[parseInt(m, 10) - 1]} ${y}`;
}
const SORT_COLS = [
    { key: 'date', label: 'Datum' },
    { key: 'counterparty', label: 'Gegenpartei' },
    { key: 'memo', label: 'Verwendungszweck' },
    { key: null, label: 'Kategorie' },
    { key: 'amount', label: 'Betrag' },
];
function TransaktionenTab({ categories }) {
    const [txData, setTxData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [query, setQuery] = useState('');
    const [month, setMonth] = useState('');
    const [availableMonths, setAvailableMonths] = useState([]);
    const [sortKey, setSortKey] = useState('date');
    const [sortDir, setSortDir] = useState('desc');
    const [uncat, setUncat] = useState(false);  // nur ohne Kategorie
    const [selectedTx, setSelectedTx] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkCat, setBulkCat] = useState('');
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkDone, setBulkDone] = useState(false);

    // Monate mit Daten einmalig laden
    useEffect(() => {
        fetch('/api/transactions/months')
            .then(r => r.json())
            .then(d => setAvailableMonths(d.months || []));
    }, []);

    function load(p, q, m, sk, sd, uc) {
        setLoading(true);
        setSelectedIds(new Set());
        const ps = new URLSearchParams({ page: p, search: q, sort: sk, dir: sd });
        if (m) ps.set('month', m);
        if (uc) ps.set('uncat', '1');
        fetch(`/api/transactions?${ps}`)
            .then(r => r.json())
            .then(d => { setTxData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }

    useEffect(() => { load(page, query, month, sortKey, sortDir, uncat); }, [page, query, month, sortKey, sortDir, uncat]);

    function handleSearch(e) { e.preventDefault(); setPage(1); setQuery(search); }

    function handleSort(key) {
        if (!key) return;
        const next = key === sortKey ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc';
        setSortKey(key); setSortDir(next); setPage(1);
    }

    function toggleId(id) {
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        setBulkDone(false);
    }
    function toggleAll() {
        const all = (txData?.transactions || []).map(t => t.id);
        setSelectedIds(selectedIds.size === all.length ? new Set() : new Set(all));
        setBulkDone(false);
    }
    async function applyBulk() {
        if (!bulkCat || selectedIds.size === 0) return;
        setBulkSaving(true);
        await fetch('/api/transactions/bulk', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [...selectedIds], category_id: bulkCat === '__none__' ? null : bulkCat }),
        });
        setBulkSaving(false); setBulkDone(true); setSelectedIds(new Set()); setBulkCat('');
        load(page, query, month, sortKey, sortDir, uncat);
    }

    const allSelected = txData?.transactions?.length > 0 && selectedIds.size === txData.transactions.length;
    const someSelected = selectedIds.size > 0;
    const sortIcon = (key) => !key ? null : (
        <span className={styles.sortIcon}>{key !== sortKey ? '⇅' : sortDir === 'asc' ? '↑' : '↓'}</span>
    );

    return (
        <div className={styles.tabContent}>
            {selectedTx && (
                <TxDetailModal tx={selectedTx} categories={categories}
                    onClose={() => setSelectedTx(null)}
                    onSaved={() => load(page, query, month, sortKey, sortDir, uncat)} />
            )}

            {someSelected && (
                <div className={styles.bulkBar}>
                    <span className={styles.bulkCount}>{selectedIds.size} ausgewählt</span>
                    <select className={styles.bulkSelect} value={bulkCat} onChange={e => { setBulkCat(e.target.value); setBulkDone(false); }}>
                        <option value="">— Kategorie wählen —</option>
                        {(categories || []).map(c => <option key={c.category_id} value={c.category_id}>{c.label}</option>)}
                        <option value="__none__">⊘ Keine Kategorie</option>
                    </select>
                    <button className={styles.bulkApplyBtn} onClick={applyBulk} disabled={!bulkCat || bulkSaving}>
                        {bulkSaving ? 'Speichern…' : 'Zuweisen'}
                    </button>
                    {bulkDone && <span className={styles.green} style={{ fontSize: 13 }}>✓ Gespeichert</span>}
                    <button className={styles.bulkCancelBtn} onClick={() => { setSelectedIds(new Set()); setBulkDone(false); }}>✕</button>
                </div>
            )}

            <div className={styles.txToolbar}>
                <form onSubmit={handleSearch} className={styles.searchForm}>
                    <input type="text" className={styles.searchInput} value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Suche nach Gegenpartei oder Verwendungszweck…" />
                    <button type="submit" className={styles.searchBtn}>Suchen</button>
                </form>
                <select className={styles.monthFilterSelect} value={month} onChange={e => { setMonth(e.target.value); setPage(1); }}>
                    <option value="">Alle Monate</option>
                    {availableMonths.map(ym => <option key={ym} value={ym}>{ymToLabel(ym)}</option>)}
                </select>
                <button
                    className={`${styles.uncatBtn} ${uncat ? styles.uncatBtnActive : ''}`}
                    onClick={() => { setUncat(u => !u); setPage(1); }}
                    title="Nur Transaktionen ohne Kategorie anzeigen"
                >
                    ⊘ Ohne Kategorie
                </button>
                {txData && <span className={styles.txCount}>{txData.total.toLocaleString('de-DE')} Buchungen</span>}
            </div>

            {loading ? <div className={styles.tabLoading}><div className={styles.spinner} /></div> : (
                <>
                    <div className={styles.txTable}>
                        <div className={`${styles.txTableHead} ${styles.txTableHeadBulk}`}>
                            <span><input type="checkbox" className={styles.cbx} checked={allSelected} onChange={toggleAll} title="Alle auswählen" /></span>
                            {SORT_COLS.map(col => (
                                <span key={col.label} className={col.key ? styles.thSortable : ''} onClick={() => handleSort(col.key)}>
                                    {col.label}{sortIcon(col.key)}
                                </span>
                            ))}
                        </div>
                        {(txData?.transactions || []).map(tx => (
                            <div key={tx.id}
                                className={`${styles.txTableRow} ${styles.txTableRowBulk} ${selectedIds.has(tx.id) ? styles.txRowSelected : ''}`}
                                onClick={() => setSelectedTx({ ...tx, catId: null })}>
                                <span onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" className={styles.cbx} checked={selectedIds.has(tx.id)} onChange={() => toggleId(tx.id)} />
                                </span>
                                <span className={styles.txDateCell}>{tx.date}</span>
                                <span className={styles.txCounterCell} title={tx.counterparty}>{tx.counterparty}</span>
                                <span className={styles.txMemoCell} title={tx.memo}>{tx.memo || '—'}</span>
                                <span>
                                    {tx.categoryLabel
                                        ? <span className={styles.txCatBadge} style={{ background: tx.categoryColor + '22', color: tx.categoryColor }}>{tx.categoryLabel}</span>
                                        : <span className={styles.txCatEmpty}>—</span>}
                                </span>
                                <span className={`${styles.txAmountCell} ${tx.amount >= 0 ? styles.green : styles.red}`}>
                                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(tx.amount)}
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

// ─── Neue-Kategorie-Modal ───
function NeuKategorieModal({ onClose, onSaved }) {
    const [label, setLabel] = useState('');
    const [color, setColor] = useState('#60A5FA');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        if (!label.trim()) { setError('Name darf nicht leer sein.'); return; }
        setSaving(true); setError('');
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: label.trim(), color_hex: color }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Fehler'); setSaving(false); return; }
        setSaving(false);
        onSaved?.();
        onClose();
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>Neue Kategorie</h2>
                    <button className={styles.modalClose} onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                    <div>
                        <label className={styles.txDetailLabel}>Name</label>
                        <input className={styles.searchInput} style={{ width: '100%', marginTop: 6 }} value={label} onChange={e => setLabel(e.target.value)} placeholder="z.B. Fitness" autoFocus />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label className={styles.txDetailLabel}>Farbe</label>
                        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 44, height: 32, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6 }} />
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{color}</span>
                    </div>
                    {error && <p className={styles.uploadError}>{error}</p>}
                    <button type="submit" className={styles.uploadBtn} style={{ width: '100%', padding: '10px 0', marginTop: 4 }} disabled={saving}>
                        {saving ? 'Speichern…' : 'Kategorie anlegen'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── Kategorie-Detail-Ansicht ───
function KategorieDetail({ cat, onBack, categories, year }) {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedTx, setSelectedTx] = useState(null);

    function loadDetail() {
        fetch(`/api/categories/${cat.category_id}?year=${year}`)
            .then(r => r.json())
            .then(d => { setDetail(d); setLoading(false); });
    }

    useEffect(() => { loadDetail(); }, [cat.category_id, year]);

    const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
    const maxMonth = detail ? Math.max(...detail.monthlySeries.map(m => m.amount), 1) : 1;
    const [hoveredBar, setHoveredBar] = useState(null);

    return (
        <div className={styles.tabContent}>
            {selectedTx && (
                <TxDetailModal
                    tx={{ ...selectedTx, catId: cat.category_id }}
                    categories={categories}
                    onClose={() => setSelectedTx(null)}
                    onSaved={() => loadDetail()}
                />
            )}
            <button className={styles.backBtn} onClick={onBack}>← Alle Kategorien ({year})</button>

            {loading ? <div className={styles.tabLoading}><div className={styles.spinner} /></div> : (
                <>
                    <div className={styles.catDetailHeader}>
                        <div className={styles.catDetailDot} style={{ background: cat.color_hex }} />
                        <div>
                            <h2 className={styles.catDetailTitle}>{cat.label}</h2>
                            <p className={styles.catDetailSub}>{detail.summary.count} Transaktionen · {fmt(Math.abs(detail.summary.totalAmount))} gesamt</p>
                        </div>
                    </div>

                    {/* Monats-Balken mit Hover-Tooltip */}
                    <div className={styles.catDetailChart}>
                        {detail.monthlySeries.map((m, i) => (
                            <div
                                key={m.label}
                                className={styles.catDetailBarCol}
                                style={{ position: 'relative' }}
                                onMouseEnter={() => setHoveredBar(i)}
                                onMouseLeave={() => setHoveredBar(null)}
                            >
                                {hoveredBar === i && m.amount > 0 && (
                                    <div className={styles.barTooltip}>
                                        {fmt(m.amount)}
                                    </div>
                                )}
                                <div className={styles.catDetailBar}>
                                    <div
                                        className={styles.catDetailBarFill}
                                        style={{
                                            height: `${(m.amount / maxMonth) * 100}%`,
                                            background: hoveredBar === i ? '#fff' : cat.color_hex,
                                            transition: 'background 0.15s ease',
                                        }}
                                    />
                                </div>
                                <span className={styles.catDetailBarLabel}>{m.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Transaktionsliste */}
                    <div className={styles.txTable} style={{ marginTop: 16 }}>
                        <div className={styles.txTableHead}>
                            <span>Datum</span><span>Gegenpartei</span><span>Verwendungszweck</span><span></span><span>Betrag</span>
                        </div>
                        {(detail.transactions || []).map(tx => (
                            <div key={tx.id} className={`${styles.txTableRow} ${styles.txTableRowClick}`} onClick={() => setSelectedTx(tx)}>
                                <span className={styles.txDateCell}>{tx.date}</span>
                                <span className={styles.txCounterCell}>{tx.counterparty}</span>
                                <span className={styles.txMemoCell}>{tx.memo || '—'}</span>
                                <span />
                                <span className={`${styles.txAmountCell} ${tx.amount >= 0 ? styles.green : styles.red}`}>{fmt(tx.amount)}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Kategorien-Tab ───
function KategorienTab({ categories, setCategories, year }) {
    const [loading, setLoading] = useState(!categories);
    const [selected, setSelected] = useState(null);
    const [showNeu, setShowNeu] = useState(false);

    function loadCats() {
        setLoading(true);
        fetch('/api/categories')
            .then(r => r.json())
            .then(d => { setCategories(d); setLoading(false); })
            .catch(() => setLoading(false));
    }

    useEffect(() => { if (!categories) loadCats(); }, []);

    if (selected) return <KategorieDetail cat={selected} onBack={() => setSelected(null)} categories={categories} year={year} />;
    if (loading) return <div className={styles.tabLoading}><div className={styles.spinner} /></div>;

    return (
        <div className={styles.tabContent}>
            {showNeu && <NeuKategorieModal onClose={() => setShowNeu(false)} onSaved={loadCats} />}
            <div className={styles.catTabToolbar}>
                <p className={styles.catHint} style={{ margin: 0 }}>💡 Kategorie anklicken für Detailansicht &amp; Transaktionen</p>
                <button className={styles.uploadBtn} onClick={() => setShowNeu(true)}>+ Neue Kategorie</button>
            </div>
            <div className={styles.catGrid} style={{ marginTop: 16 }}>
                {(categories || []).map(cat => (
                    <div key={cat.category_id} className={`${styles.catGridCard} ${styles.catGridCardClick}`} onClick={() => setSelected(cat)}>
                        <div className={styles.catGridDot} style={{ background: cat.color_hex || '#9CA3AF' }} />
                        <div style={{ flex: 1 }}>
                            <p className={styles.catGridLabel}>{cat.label}</p>
                        </div>
                        <span style={{ fontSize: 14, color: '#374151' }}>›</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Monats-Kachel ───
function MonatsKachel({ cashflowSeries, year }) {
    const lastDataIdx = cashflowSeries.reduce((last, m, i) => {
        if (m.einnahmen > 0 || m.ausgaben > 0) return i;
        return last;
    }, 0);
    const [idx, setIdx] = useState(lastDataIdx);
    const month = cashflowSeries[idx];

    const maxEin = Math.max(...cashflowSeries.map(m => m.einnahmen), 1);
    const maxAus = Math.max(...cashflowSeries.map(m => m.ausgaben), 1);
    const netto = month.einnahmen - month.ausgaben;
    const nettoPos = netto >= 0;

    return (
        <div className={`card ${styles.monthCard}`}>
            <div className={styles.cardHeader} style={{ marginBottom: 0 }}>
                <h2 className={styles.cardTitle}>Monatsübersicht</h2>
                <span className={styles.cardSub}>{year}</span>
            </div>
            <div className={styles.monthNav}>
                <button className={styles.monthNavBtn} onClick={() => setIdx(i => i - 1)} disabled={idx === 0} title="Vorheriger Monat">←</button>
                <span className={styles.monthTitle}>{month.label}</span>
                <button className={styles.monthNavBtn} onClick={() => setIdx(i => i + 1)} disabled={idx === cashflowSeries.length - 1} title="Nächster Monat">→</button>
            </div>
            <div className={styles.monthRows}>
                <div className={styles.monthRow}>
                    <div className={styles.monthRowTop}>
                        <span className={styles.monthRowLabel}>Einnahmen</span>
                        <span className={`${styles.monthRowValue} ${styles.green}`}>{fmt(month.einnahmen)}</span>
                    </div>
                    <div className={styles.monthBar}>
                        <div className={styles.monthBarFill} style={{ width: `${(month.einnahmen / maxEin) * 100}%`, background: '#4ade80' }} />
                    </div>
                </div>
                <div className={styles.monthRow}>
                    <div className={styles.monthRowTop}>
                        <span className={styles.monthRowLabel}>Ausgaben</span>
                        <span className={`${styles.monthRowValue} ${styles.red}`}>{fmt(month.ausgaben)}</span>
                    </div>
                    <div className={styles.monthBar}>
                        <div className={styles.monthBarFill} style={{ width: `${(month.ausgaben / maxAus) * 100}%`, background: '#f97316' }} />
                    </div>
                </div>
                <div className={styles.monthDivider} />
                <div className={styles.monthNettoRow}>
                    <span className={styles.monthNettoLabel}>Netto</span>
                    <span className={`${styles.monthNettoValue} ${nettoPos ? styles.green : styles.red}`}>{fmt(netto)}</span>
                </div>
            </div>

            {/* Top 5 Ausgaben */}
            {(month.topAusgaben?.length > 0) && (
                <div className={styles.monthTop5}>
                    <p className={styles.monthTop5Title} style={{ color: '#f97316' }}>▼ Top Ausgaben</p>
                    {month.topAusgaben.map((t, i) => (
                        <div key={i} className={styles.monthTop5Row}>
                            <span className={styles.monthTop5Label} title={t.memo || t.label}>{t.label}</span>
                            <span className={`${styles.monthTop5Amt} ${styles.red}`}>{fmt(t.amount)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Top 5 Einnahmen */}
            {(month.topEinnahmen?.length > 0) && (
                <div className={styles.monthTop5} style={{ marginTop: 8 }}>
                    <p className={styles.monthTop5Title} style={{ color: '#4ade80' }}>▲ Top Einnahmen</p>
                    {month.topEinnahmen.map((t, i) => (
                        <div key={i} className={styles.monthTop5Row}>
                            <span className={styles.monthTop5Label} title={t.memo || t.label}>{t.label}</span>
                            <span className={`${styles.monthTop5Amt} ${styles.green}`}>{fmt(t.amount)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


// ─── Übersicht-Tab ───
function UebersichtTab({ data, categories, year }) {
    const { summary, cashflowSeries, topCategories, recentTransactions } = data;
    const labels = cashflowSeries.map(m => m.label);
    const [selectedCat, setSelectedCat] = useState(null);

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
            {/* Kategorie-Detail-Modal aus Overview */}
            {selectedCat && (
                <div className={styles.modalOverlay} onClick={() => setSelectedCat(null)}>
                    <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 20, width: '100%', maxWidth: 800, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <KategorieDetail cat={selectedCat} onBack={() => setSelectedCat(null)} categories={categories} year={year} />
                    </div>
                </div>
            )}

            {/* Balkendiagramm */}
            <div className={`card ${styles.chartCard}`}>
                <div className={styles.cardHeader}>
                    <div><h2 className={styles.cardTitle}>Einnahmen &amp; Ausgaben</h2><p className={styles.cardSub}>Monatsübersicht {year}</p></div>
                    <div className={styles.legendRow}>
                        <span className={styles.legendDot} style={{ background: '#4ade80' }} /><span className={styles.legendLabel}>Einnahmen</span>
                        <span className={styles.legendDot} style={{ background: '#f97316' }} /><span className={styles.legendLabel}>Ausgaben</span>
                    </div>
                </div>
                <div className={styles.chartWrap}><Bar data={barData} options={barOptions} /></div>
            </div>

            {/* KPI Panel */}
            <div className={`card ${styles.kpiPanel}`}>
                <div className={styles.cardHeader}><h2 className={styles.cardTitle}>Jahresbilanz {year}</h2></div>
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

            {/* Top Ausgaben — klickbar */}
            <div className={`card ${styles.catCard}`}>
                <div className={styles.cardHeader}><h2 className={styles.cardTitle}>Top Ausgaben</h2><p className={styles.cardSub}>Kategorien 2025 · anklicken für Details</p></div>
                <div className={styles.catList}>
                    {topCategories.map(cat => (
                        <div
                            key={cat.category_id}
                            className={`${styles.catRow} ${styles.catRowClick}`}
                            onClick={() => {
                                const fullCat = (categories || []).find(c => c.category_id === cat.category_id);
                                setSelectedCat(fullCat || { category_id: cat.category_id, label: cat.label, color_hex: cat.color });
                            }}
                        >
                            <div className={styles.catLeft}><span className={styles.catDot} style={{ background: cat.color }} /><span className={styles.catLabel}>{cat.label}</span></div>
                            <div className={styles.catRight}>
                                <span className={styles.catAmount}>{fmt(cat.amount)}</span>
                                <div className={styles.catBar}><div className={styles.catBarFill} style={{ width: `${Math.min(cat.share, 100).toFixed(1)}%`, background: cat.color }} /></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature Card — rot wenn Ausgaben > Einnahmen */}
            <div className={`card ${styles.featureCard}`} style={{ background: nettoPositiv ? 'linear-gradient(135deg, #0a1e14 0%, #0d0d0d 100%)' : 'linear-gradient(135deg, #1e0a0a 0%, #0d0d0d 100%)' }}>
                <div className={styles.featureOrb} style={{ background: nettoPositiv ? 'radial-gradient(circle at 35% 35%, #6ee7b7, #059669, #064e3b)' : 'radial-gradient(circle at 35% 35%, #fca5a5, #dc2626, #7f1d1d)', boxShadow: nettoPositiv ? '0 0 30px rgba(74,222,128,0.45), 0 0 60px rgba(74,222,128,0.2)' : '0 0 30px rgba(239,68,68,0.45), 0 0 60px rgba(239,68,68,0.2)' }} />
                <div className={styles.featureContent}>
                    <h2 className={styles.featureTitle} style={{ color: nettoPositiv ? '#6ee7b7' : '#fca5a5' }}>{nettoPositiv ? 'Gut gemacht! 🎉' : 'Ausgaben > Einnahmen!'}</h2>
                    <p className={styles.featureSub}>{nettoPositiv ? `Gespart: ${fmt(summary.netto)}` : `Differenz: ${fmt(Math.abs(summary.netto))}`}</p>
                </div>
            </div>

            {/* Monatsübersicht */}
            <MonatsKachel cashflowSeries={cashflowSeries} year={data.year ?? new Date().getFullYear()} />
        </main>
    );
}

// ─── Haupt-Export ───
export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState('uebersicht');
    const [dashData, setDashData] = useState(null);
    const [categories, setCategories] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [year, setYear] = useState(new Date().getFullYear());
    const [refreshKey, setRefreshKey] = useState(0);

    function loadDashboard(y) {
        setLoading(true);
        fetch(`/api/dashboard?year=${y || year}`)
            .then(r => r.json())
            .then(d => { setDashData(d); setLoading(false); })
            .catch(() => { setError('Daten konnten nicht geladen werden.'); setLoading(false); });
    }

    useEffect(() => {
        loadDashboard(year);
        fetch('/api/categories').then(r => r.json()).then(setCategories);
    }, []);

    function changeYear(y) {
        setYear(y);
        loadDashboard(y);
    }

    if (loading) return (
        <div className={styles.loadingScreen}>
            <div className={styles.loadingOrb} />
            <p>Lade Finanzdaten…</p>
        </div>
    );
    if (error) return <div className={styles.errorScreen}>{error}</div>;

    const availableYears = dashData?.availableYears || [year];

    return (
        <div className={styles.page}>
            {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); loadDashboard(year); }} />}

            <header className={styles.header}>
                <div className={styles.headerBrand}>
                    <div className={styles.headerOrb} />
                    <span className={styles.headerTitle}>Haushaltsbuch</span>
                </div>
                <nav className={styles.nav}>
                    {[['uebersicht', 'Übersicht'], ['transaktionen', 'Transaktionen'], ['kategorien', 'Kategorien']].map(([id, label]) => (
                        <button
                            key={id}
                            className={`${styles.navBtn} ${activeTab === id ? styles.navActive : ''}`}
                            onClick={() => {
                                setActiveTab(id);
                                if (id === 'uebersicht') loadDashboard(year);
                                if (id === 'kategorien') setRefreshKey(k => k + 1);
                            }}
                        >{label}</button>
                    ))}
                </nav>
                <div className={styles.headerRight}>
                    <button className={styles.uploadBtn} onClick={() => setShowUpload(true)}>⬆ CSV Import</button>
                    <select
                        className={styles.yearSelect}
                        value={year}
                        onChange={e => changeYear(Number(e.target.value))}
                        title="Jahresfilter"
                    >
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </header>

            {activeTab === 'uebersicht' && dashData && <UebersichtTab data={dashData} categories={categories} year={year} />}
            {activeTab === 'transaktionen' && <TransaktionenTab categories={categories} />}
            {activeTab === 'kategorien' && <KategorienTab key={refreshKey} categories={categories} setCategories={setCategories} year={year} />}
        </div>
    );
}
