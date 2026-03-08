"use client";

import { useState, useEffect, useMemo } from "react";

interface Category { id: number | string; name: string; }
interface Product { id: number | string; name: string; price: number; categoryId: number | string; isActive: boolean; image?: string; }
interface Table { id: number | string; name: string; qrCode: string; isActive: boolean; locationId: number | string; }
interface Location { id: number | string; name: string; tables: Table[]; }
interface Banner { id: number | string; title: string; subtitle?: string; image: string; isActive: boolean; }
interface OrderItem { id: number; productId: number; quantity: number; priceSnapshot: number; note?: string; product: { name: string; price: number; } }
interface Order {
    id: number; transactionCode: string; customerName: string; status: string; totalAmount: number;
    createdAt: string; note?: string; paymentStatus: string; cancellationReason?: string; cancellationStatus?: string;
    items: OrderItem[];
    table?: { name: string; }
}

interface StoreData {
    id: number; name: string; whatsappNumber: string; telegramChatId: string | null; isOpen: boolean;
    categories: Category[]; products: Product[]; locations: Location[]; banners: Banner[]; orders: Order[];
}

export default function AdminDashboard() {
    const [store, setStore] = useState<StoreData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState("pesanan");

    const [historyFilter, setHistoryFilter] = useState<"hari_ini" | "bulan_ini" | "semua">("hari_ini");

    useEffect(() => {
        fetch('/api/admin/db')
            .then(res => res.json())
            .then(data => {
                if (data && data.length > 0) setStore(data[0]);
                setLoading(false);
            })
            .catch(err => { console.error(err); setLoading(false); });
    }, []);

    const handleSave = async (silent = false) => {
        if (!store) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/db', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([store])
            });
            if (!silent) {
                if (res.ok) alert("✅ Perubahan berhasil disimpan ke Database!");
                else alert("❌ Gagal menyimpan data.");
            }
        } catch (error) {
            if (!silent) alert("❌ Error jaringan saat menyimpan DB.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={styles.container}>Loading Database Asli...</div>;
    if (!store) return <div style={styles.container}>❌ Store tidak ditemukan. Pastikan Prisma sudah di-seed.</div>;

    const renderTabs = () => (
        <div style={styles.tabContainer}>
            {['pesanan', 'riwayat', 'menu', 'lokasi', 'promo', 'profile'].map(tab => (
                <button
                    key={tab}
                    style={{ ...styles.tabButton, ...(activeTab === tab ? styles.tabActive : {}) }}
                    onClick={() => setActiveTab(tab)}
                >
                    {tab.toUpperCase().replace('_', ' ')}
                </button>
            ))}
        </div>
    );

    const formatRupiah = (angka: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(angka);

    // ===================================
    // TAB: PESANAN MASUK (PENDING / PROCESSING)
    // ===================================
    const renderPesanan = () => {
        const activeOrders = store.orders.filter(o => o.status === 'Pending' || o.status === 'Processing');

        return (
            <section style={styles.card}>
                <h2 style={styles.sectionTitle}>🔔 Pesanan Masuk (Live)</h2>
                {activeOrders.length === 0 && <p>Belum ada antrean pesanan baru.</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    {activeOrders.map(order => (
                        <div key={order.id} style={{ border: '2px solid #ecc94b', borderRadius: '8px', padding: '1rem', backgroundColor: '#faf089' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #d69e2e', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                                <strong>#{order.transactionCode} ({order.table?.name || 'Takeaway'})</strong>
                                <span style={styles.badgeWarning}>{order.status}</span>
                            </div>
                            <p style={{ margin: '0 0 0.5rem' }}>👤 <strong>{order.customerName}</strong></p>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
                                {order.items.map(item => (
                                    <li key={item.id}>{item.quantity}x {item.product.name} ({formatRupiah(item.priceSnapshot)})</li>
                                ))}
                            </ul>
                            <div style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>Total: {formatRupiah(order.totalAmount)}</div>

                            {order.cancellationStatus === 'Requested' && (
                                <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: '#fed7d7', borderRadius: '4px' }}>
                                    <strong>🚨 Request Batal:</strong> {order.cancellationReason}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <button style={styles.btnDanger} onClick={() => updateOrderStatus(order.id, 'Cancelled', 'Approved')}>ACC Batal (+Refund)</button>
                                        <button style={styles.btnSmall} onClick={() => updateOrderStatus(order.id, order.status, 'Rejected')}>Tolak Batal</button>
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                {order.status === 'Pending' && <button style={{ ...styles.btnPrimary, flex: 1 }} onClick={() => updateOrderStatus(order.id, 'Processing')}>Masak! (Terima)</button>}
                                {order.status === 'Processing' && <button style={{ ...styles.btnSmall, flex: 1, backgroundColor: '#48bb78' }} onClick={() => updateOrderStatus(order.id, 'Completed')}>✅ Makanan Selesai</button>}
                                <button style={{ ...styles.btnDanger, flex: 1 }} onClick={() => {
                                    const reason = prompt("Alasan menolak pesanan ini (misal: Bahan habis):");
                                    if (reason) updateOrderStatus(order.id, 'Cancelled', 'Rejected', reason);
                                }}>Tolak Pesanan</button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        )
    };

    const updateOrderStatus = (orderId: number, newStatus: string, cancelStat?: string, cancelReason?: string) => {
        const newOrders = [...store.orders];
        const idx = newOrders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
            newOrders[idx].status = newStatus;
            if (cancelStat) newOrders[idx].cancellationStatus = cancelStat;
            if (cancelReason) newOrders[idx].cancellationReason = cancelReason;
            setStore({ ...store, orders: newOrders });
        }
    };

    // ===================================
    // TAB: RIWAYAT TRANSAKSI
    // ===================================
    const renderRiwayat = () => {
        const historyData = store.orders.filter(o => o.status === 'Completed' || o.status === 'Cancelled');

        let filteredData = historyData;
        const now = new Date();

        if (historyFilter === 'hari_ini') {
            filteredData = historyData.filter(o => {
                const od = new Date(o.createdAt);
                return od.getDate() === now.getDate() && od.getMonth() === now.getMonth() && od.getFullYear() === now.getFullYear();
            });
        } else if (historyFilter === 'bulan_ini') {
            filteredData = historyData.filter(o => {
                const od = new Date(o.createdAt);
                return od.getMonth() === now.getMonth() && od.getFullYear() === now.getFullYear();
            });
        }

        const totalPendapatan = filteredData.filter(o => o.status === 'Completed').reduce((sum, o) => sum + o.totalAmount, 0);

        return (
            <section style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={styles.sectionTitle}>📜 Riwayat Transaksi</h2>
                    <select style={styles.input} value={historyFilter} onChange={(e: any) => setHistoryFilter(e.target.value)}>
                        <option value="hari_ini">Hari Ini</option>
                        <option value="bulan_ini">Bulan Ini</option>
                        <option value="semua">Semua Transaksi</option>
                    </select>
                </div>

                <div style={{ backgroundColor: '#ebf8ff', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, color: '#2b6cb0' }}>Pendapatan Bersih (Selesai): {formatRupiah(totalPendapatan)}</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#4a5568' }}>Total {filteredData.length} order tercatat pada rentang ini.</p>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#edf2f7', textAlign: 'left' }}>
                            <th style={{ padding: '0.75rem' }}>Waktu</th>
                            <th style={{ padding: '0.75rem' }}>Pelanggan (Meja)</th>
                            <th style={{ padding: '0.75rem' }}>Total Item</th>
                            <th style={{ padding: '0.75rem' }}>Status</th>
                            <th style={{ padding: '0.75rem' }}>Pendapatan</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map(o => (
                            <tr key={o.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '0.75rem' }}>{new Date(o.createdAt).toLocaleString('id-ID')}</td>
                                <td style={{ padding: '0.75rem' }}>{o.customerName} ({o.table?.name || 'Takeaway'})</td>
                                <td style={{ padding: '0.75rem' }}>{o.items.length} Macam</td>
                                <td style={{ padding: '0.75rem', fontWeight: 'bold', color: o.status === 'Completed' ? '#38a169' : '#e53e3e' }}>
                                    {o.status} {o.cancellationReason && `(${o.cancellationReason})`}
                                </td>
                                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{formatRupiah(o.totalAmount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        );
    };

    // ===================================
    // TAB: MENU & KATEGORI (CRUD LENGKAP)
    // ===================================
    const renderMenu = () => (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <section style={{ ...styles.card, flex: 1, minWidth: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h2 style={styles.sectionTitle}>Kategori Menu</h2>
                    <button style={styles.btnSmall} onClick={() => {
                        setStore({ ...store, categories: [...store.categories, { id: `cat_${Date.now()}`, name: 'Kategori Baru' }] });
                    }}>+ Tambah Kategori</button>
                </div>

                {store.categories?.map((cat, i) => (
                    <div key={cat.id} style={styles.itemRow}>
                        <input
                            style={{ ...styles.input, flex: 1 }}
                            value={cat.name}
                            onChange={e => {
                                const newCats = [...store.categories]; newCats[i].name = e.target.value; setStore({ ...store, categories: newCats });
                            }}
                        />
                        <button style={styles.btnDanger} onClick={() => {
                            if (window.confirm('Yakin hapus kategori ini? Semua menu di dalamnya akan ikut lenyap.')) {
                                setStore({
                                    ...store,
                                    categories: store.categories.filter((_, idx) => idx !== i),
                                    products: store.products.filter(p => p.categoryId !== cat.id) // Hapus relasi Child
                                });
                            }
                        }}>Hapus</button>
                    </div>
                ))}
            </section>

            <section style={{ ...styles.card, flex: 2, minWidth: '400px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h2 style={styles.sectionTitle}>Daftar Menu Makanan & Minuman</h2>
                    <button style={styles.btnSmall} onClick={() => {
                        if (store.categories.length === 0) return alert('Buat kategori dulu bos!');
                        setStore({
                            ...store,
                            products: [...store.products, { id: `new_${Date.now()}`, name: 'Menu Baru', price: 10000, categoryId: store.categories[0].id, isActive: true }]
                        });
                    }}>+ Tambah Menu</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {store.products?.map((prod, i) => (
                        <div key={prod.id} style={{ ...styles.itemRow, flexWrap: 'wrap', backgroundColor: prod.isActive ? 'white' : '#f7fafc', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            <input style={{ ...styles.input, width: '150px', flex: 2 }} value={prod.name} placeholder="Nama Menu" onChange={e => {
                                const newProds = [...store.products]; newProds[i].name = e.target.value; setStore({ ...store, products: newProds });
                            }} />
                            <input type="number" style={{ ...styles.input, width: '100px', flex: 1 }} value={prod.price} onChange={e => {
                                const newProds = [...store.products]; newProds[i].price = parseInt(e.target.value) || 0; setStore({ ...store, products: newProds });
                            }} />
                            <select style={{ ...styles.input, width: '120px', flex: 1 }} value={prod.categoryId} onChange={e => {
                                const newCatId = e.target.value.includes('cat_') ? e.target.value : parseInt(e.target.value);
                                const newProds = [...store.products]; newProds[i].categoryId = newCatId; setStore({ ...store, products: newProds });
                            }}>
                                {store.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                                <input type="checkbox" checked={prod.isActive} onChange={(e) => {
                                    const newProds = [...store.products]; newProds[i].isActive = e.target.checked; setStore({ ...store, products: newProds });
                                }} /> Tersedia
                            </label>

                            <button style={styles.btnDanger} onClick={() => {
                                setStore({ ...store, products: store.products.filter((_, idx) => idx !== i) });
                            }}>Hapus</button>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );

    // ===================================
    // TAB: LOKASI & MEJA (CRUD LENGKAP)
    // ===================================
    const renderLokasi = () => (
        <section>
            <button style={{ ...styles.btnPrimary, marginBottom: '1.5rem' }} onClick={() => {
                setStore({ ...store, locations: [...store.locations, { id: `loc_${Date.now()}`, name: "Lokasi / Lantai Baru", tables: [] }] });
            }}>+ TAMBAH AREA / LOKASI BARU</button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                {store.locations?.map((loc, locIndex) => (
                    <div key={loc.id} style={styles.card}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <input style={{ ...styles.input, fontSize: '1.1rem', fontWeight: 'bold' }} value={loc.name} onChange={e => {
                                const newLocs = [...store.locations]; newLocs[locIndex].name = e.target.value; setStore({ ...store, locations: newLocs });
                            }} />
                            <button style={styles.btnDanger} onClick={() => {
                                if (window.confirm(`Hapus area ${loc.name} beserta seluruh mejanya?`)) {
                                    setStore({ ...store, locations: store.locations.filter((_, idx) => idx !== locIndex) });
                                }
                            }}>Hapus Area</button>
                        </div>

                        <button style={{ ...styles.btnSmall, marginBottom: '1rem' }} onClick={() => {
                            const newLocs = [...store.locations];
                            newLocs[locIndex].tables.push({ id: `t_${Date.now()}`, name: `Meja Baru`, qrCode: `QR_${Date.now()}`, isActive: true, locationId: loc.id });
                            setStore({ ...store, locations: newLocs });
                        }}>+ Tambah Meja di sini</button>

                        {loc.tables.map((table, tIndex) => (
                            <div key={table.id} style={{ ...styles.itemRow, marginBottom: '0.5rem' }}>
                                <input style={{ ...styles.input, flex: 2 }} value={table.name} onChange={e => {
                                    const newLocs = [...store.locations]; newLocs[locIndex].tables[tIndex].name = e.target.value; setStore({ ...store, locations: newLocs });
                                }} />
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', flex: 1 }}>
                                    <input type="checkbox" checked={table.isActive} onChange={(e) => {
                                        const newLocs = [...store.locations]; newLocs[locIndex].tables[tIndex].isActive = e.target.checked; setStore({ ...store, locations: newLocs });
                                    }} /> Dibuka
                                </label>
                                <button style={styles.btnDanger} onClick={() => {
                                    const newLocs = [...store.locations]; newLocs[locIndex].tables.splice(tIndex, 1); setStore({ ...store, locations: newLocs });
                                }}>X</button>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </section>
    );

    const renderProfile = () => (
        <section style={styles.card}>
            <h2 style={styles.sectionTitle}>ℹ️ Profil Kantin Asli</h2>
            <div style={styles.formGroup}>
                <label style={styles.label}>Nama Kantin</label>
                <input style={styles.input} value={store.name} onChange={e => setStore({ ...store, name: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
                <label style={styles.label}>Nomor WhatsApp / Pendaftaran (Contoh: 081... / 628...)</label>
                <input style={styles.input} value={store.whatsappNumber || ''} onChange={e => setStore({ ...store, whatsappNumber: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
                <label style={styles.label}>Status Kantin</label>
                <select style={styles.input} value={store.isOpen ? 'Buka' : 'Tutup'} onChange={e => setStore({ ...store, isOpen: e.target.value === 'Buka' })}>
                    <option value="Buka">🟢 Buka (Beroperasi)</option>
                    <option value="Tutup">🔴 Tutup</option>
                </select>
            </div>
            <div style={styles.formGroup}>
                <label style={styles.label}>Telegram Chat ID (Otomatis Tersinkron Saat Pelanggan Login dari Bot)</label>
                <input readOnly style={{ ...styles.input, backgroundColor: '#edf2f7' }} value={store.telegramChatId || 'Belum Ada Akun Terhubung! Buka Bot Telegram lalu Pilih Verifikasi Kontak.'} />
            </div>
        </section>
    );

    const renderPromo = () => (
        <section style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={styles.sectionTitle}>Banner Promosi Live</h2>
                <button style={styles.btnSmall} onClick={() => {
                    setStore({ ...store, banners: [...store.banners, { id: `b_${Date.now()}`, title: 'Promo Sensasi', image: '', isActive: true }] });
                }}>+ Tambah Gambar Banner</button>
            </div>
            {store.banners?.map((banner, i) => (
                <div key={banner.id} style={{ ...styles.itemRow, alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #eee', gap: '1rem' }}>
                    {banner.image ?
                        <img src={banner.image} alt="prev" style={{ width: '80px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                        : <div style={{ width: '80px', height: '40px', backgroundColor: '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>No Img</div>
                    }

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <input style={styles.input} value={banner.title} placeholder="Judul / Call To Action" onChange={e => {
                            const newB = [...store.banners]; newB[i].title = e.target.value; setStore({ ...store, banners: newB });
                        }} />
                        <input style={styles.input} value={banner.image} placeholder="Paste Image URL / Link Gambar" onChange={e => {
                            const newB = [...store.banners]; newB[i].image = e.target.value; setStore({ ...store, banners: newB });
                        }} />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={banner.isActive} onChange={(e) => {
                            const newB = [...store.banners]; newB[i].isActive = e.target.checked; setStore({ ...store, banners: newB });
                        }} /> Tampilkan di Aplikasi
                    </label>

                    <button style={styles.btnDanger} onClick={() => {
                        setStore({ ...store, banners: store.banners.filter((_, idx) => idx !== i) });
                    }}>Hapus</button>
                </div>
            ))}
        </section>
    );

    return (
        <main style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>QuackXel 3.0 Real-Time Master Control</h1>
                <p style={styles.subtitle}>Supercharged Central Database Admin Panel</p>
                <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                    <button onClick={() => handleSave(false)} style={styles.btnPrimary} disabled={saving}>
                        {saving ? "⏳ Menyinkronkan Graph DB..." : "💾 CLOUD SYNC: SIMPAN SEMUA PERUBAHAN DB"}
                    </button>
                </div>
                {renderTabs()}
            </header>

            <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
                {activeTab === 'pesanan' && renderPesanan()}
                {activeTab === 'riwayat' && renderRiwayat()}
                {activeTab === 'profile' && renderProfile()}
                {activeTab === 'menu' && renderMenu()}
                {activeTab === 'lokasi' && renderLokasi()}
                {activeTab === 'promo' && renderPromo()}
            </div>
        </main>
    );
}

const styles: { [key: string]: React.CSSProperties } = {
    container: { minHeight: "100vh", backgroundColor: "#f7fafc", fontFamily: "system-ui, -apple-system, sans-serif", padding: "2rem", color: "#2d3748" },
    header: { textAlign: "center" as const, marginBottom: "2rem" },
    title: { fontSize: "2.5rem", fontWeight: "bold", margin: "0 0 0.5rem 0", color: "#2b6cb0" },
    subtitle: { fontSize: "1.25rem", color: "#4a5568", margin: 0 },
    tabContainer: { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '2rem' },
    tabButton: { padding: '0.75rem 1.5rem', fontSize: '0.95rem', fontWeight: 'bold', border: 'none', backgroundColor: '#e2e8f0', color: '#4a5568', cursor: 'pointer', borderRadius: '8px 8px 0 0', transition: 'all 0.2s', borderBottom: '3px solid transparent' },
    tabActive: { backgroundColor: '#ffffff', color: '#2b6cb0', borderBottom: '3px solid #3182ce' },
    card: { backgroundColor: "#ffffff", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", padding: "1.5rem", borderTop: "5px solid #3182ce" },
    sectionTitle: { margin: "0 0 1rem 0", color: "#2d3748", fontSize: "1.25rem" },
    formGroup: { marginBottom: "1rem" },
    label: { display: "block", fontWeight: "600", marginBottom: "0.25rem", color: "#4a5568", fontSize: "0.875rem" },
    input: { width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "0.9rem", boxSizing: "border-box" },
    itemRow: { display: "flex", gap: "0.5rem", marginBottom: '0.75rem', alignItems: 'center' },
    btnPrimary: { backgroundColor: "#3182ce", color: "white", fontWeight: "bold", padding: "1rem 2rem", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "1.1rem", transition: "0.2s" },
    btnSmall: { backgroundColor: "#48bb78", color: "white", border: "none", borderRadius: "4px", padding: "0.5rem 1rem", fontSize: "0.85rem", cursor: "pointer", fontWeight: "bold" },
    btnDanger: { backgroundColor: "#f56565", color: "white", border: "none", borderRadius: "4px", padding: "0.5rem 1rem", cursor: "pointer", fontWeight: "bold", alignSelf: "center" },
    badgeWarning: { backgroundColor: "#ecc94b", color: "#744210", padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.8rem", fontWeight: "bold" }
};
