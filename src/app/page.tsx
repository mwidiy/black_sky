"use client";

import { useState, useEffect } from "react";

interface MenuItem {
    id: string;
    nama: string;
    harga: number;
}

interface TableItem {
    id: string;
    nomor: string;
    status: 'Aktif' | 'Tidak Aktif';
}

interface MerchantData {
    phone: string;
    merchant_id: string;
    nama_kantin: string;
    status_toko: 'Buka' | 'Tutup';
    info_tambahan: string;
    menus: MenuItem[];
    tables: TableItem[];
    telegram_chat_id?: string;
}

export default function DatabaseSimulator() {
    const [merchants, setMerchants] = useState<MerchantData[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    // Load data from internal API
    useEffect(() => {
        fetch('/api/admin/db')
            .then(res => res.json())
            .then(data => {
                setMerchants(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaveStatus(null);
        try {
            const res = await fetch('/api/admin/db', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(merchants)
            });
            if (res.ok) {
                setSaveStatus("✅ Berhasil disimpan ke Web Memory!");
                setTimeout(() => setSaveStatus(null), 3000);
            } else {
                setSaveStatus("❌ Gagal menyimpan data.");
            }
        } catch (error) {
            setSaveStatus("❌ Error jaringan.");
        } finally {
            setSaving(false);
        }
    };

    const updateMerchantField = (index: number, field: keyof MerchantData, value: any) => {
        const newData = [...merchants];
        newData[index] = { ...newData[index], [field]: value };
        setMerchants(newData);
    };

    const addMenu = (merchantIndex: number) => {
        const newData = [...merchants];
        newData[merchantIndex].menus.push({
            id: `menu_${Date.now()}`,
            nama: "Menu Baru",
            harga: 10000
        });
        setMerchants(newData);
    };

    const updateMenu = (mIndex: number, menuIndex: number, field: keyof MenuItem, value: any) => {
        const newData = [...merchants];
        newData[mIndex].menus[menuIndex] = { ...newData[mIndex].menus[menuIndex], [field]: value };
        setMerchants(newData);
    };

    const deleteMenu = (mIndex: number, menuIndex: number) => {
        const newData = [...merchants];
        newData[mIndex].menus.splice(menuIndex, 1);
        setMerchants(newData);
    };

    const addTable = (merchantIndex: number) => {
        const newData = [...merchants];
        newData[merchantIndex].tables.push({
            id: `tbl_${Date.now()}`,
            nomor: `Meja ${newData[merchantIndex].tables.length + 1}`,
            status: "Aktif"
        });
        setMerchants(newData);
    };

    const updateTable = (mIndex: number, tableIndex: number, field: keyof TableItem, value: any) => {
        const newData = [...merchants];
        newData[mIndex].tables[tableIndex] = { ...newData[mIndex].tables[tableIndex], [field]: value };
        setMerchants(newData);
    };

    const deleteTable = (mIndex: number, tableIndex: number) => {
        const newData = [...merchants];
        newData[mIndex].tables.splice(tableIndex, 1);
        setMerchants(newData);
    };

    if (loading) return <div style={styles.container}>Loading Database...</div>;

    return (
        <main style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>QuackXel DB Simulator</h1>
                <p style={styles.subtitle}>Dashboard Kontrol Memori Sementara</p>
                <div style={{ marginTop: '1rem' }}>
                    <button onClick={handleSave} style={styles.btnPrimary} disabled={saving}>
                        {saving ? "Menyimpan..." : "💾 Simpan Perubahan ke DB"}
                    </button>
                    {saveStatus && <span style={{ marginLeft: '1rem', fontWeight: 'bold' }}>{saveStatus}</span>}
                </div>
            </header>

            <div style={styles.grid}>
                {merchants.map((merchant, mIndex) => (
                    <section key={merchant.merchant_id} style={styles.card}>
                        <div style={styles.cardHeader}>
                            <h2 style={{ margin: 0, color: "#2b6cb0" }}>{merchant.nama_kantin}</h2>
                            <select
                                value={merchant.status_toko}
                                onChange={(e) => updateMerchantField(mIndex, 'status_toko', e.target.value)}
                                style={{
                                    ...styles.badge,
                                    backgroundColor: merchant.status_toko === 'Buka' ? '#c6f6d5' : '#fed7d7',
                                    color: merchant.status_toko === 'Buka' ? '#22543d' : '#822727'
                                }}
                            >
                                <option value="Buka">Buka</option>
                                <option value="Tutup">Tutup</option>
                            </select>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Nomor HP Terdaftar (Sesuai Telegram)</label>
                            <input
                                value={merchant.phone}
                                onChange={(e) => updateMerchantField(mIndex, 'phone', e.target.value)}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Telegram Chat ID (Login)</label>
                            <input
                                value={merchant.telegram_chat_id || 'Belum Login (Perlu Verifikasi)'}
                                readOnly
                                style={{ ...styles.input, backgroundColor: '#edf2f7', color: '#718096' }}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Info Tambahan</label>
                            <input
                                value={merchant.info_tambahan}
                                onChange={(e) => updateMerchantField(mIndex, 'info_tambahan', e.target.value)}
                                style={styles.input}
                            />
                        </div>

                        {/* MENU SECTION */}
                        <div style={styles.sectionDivider}>
                            <h3 style={styles.sectionTitle}>Daftar Menu</h3>
                            <button onClick={() => addMenu(mIndex)} style={styles.btnSmall}>+ Tambah Menu</button>
                        </div>
                        <div style={styles.itemsList}>
                            {merchant.menus.map((menu, menuIndex) => (
                                <div key={menu.id} style={styles.itemRow}>
                                    <input
                                        value={menu.nama}
                                        onChange={(e) => updateMenu(mIndex, menuIndex, 'nama', e.target.value)}
                                        style={{ ...styles.inputList, flex: 2 }}
                                    />
                                    <input
                                        type="number"
                                        value={menu.harga}
                                        onChange={(e) => updateMenu(mIndex, menuIndex, 'harga', parseInt(e.target.value) || 0)}
                                        style={{ ...styles.inputList, flex: 1 }}
                                    />
                                    <button onClick={() => deleteMenu(mIndex, menuIndex)} style={styles.btnDanger}>X</button>
                                </div>
                            ))}
                        </div>

                        {/* TABLE SECTION */}
                        <div style={styles.sectionDivider}>
                            <h3 style={styles.sectionTitle}>Status Meja</h3>
                            <button onClick={() => addTable(mIndex)} style={styles.btnSmall}>+ Tambah Meja</button>
                        </div>
                        <div style={styles.itemsList}>
                            {merchant.tables.map((table, tableIndex) => (
                                <div key={table.id} style={styles.itemRow}>
                                    <input
                                        value={table.nomor}
                                        onChange={(e) => updateTable(mIndex, tableIndex, 'nomor', e.target.value)}
                                        style={{ ...styles.inputList, flex: 1 }}
                                    />
                                    <select
                                        value={table.status}
                                        onChange={(e) => updateTable(mIndex, tableIndex, 'status', e.target.value)}
                                        style={{ ...styles.inputList, flex: 1 }}
                                    >
                                        <option value="Aktif">Aktif</option>
                                        <option value="Tidak Aktif">Tidak Aktif</option>
                                    </select>
                                    <button onClick={() => deleteTable(mIndex, tableIndex)} style={styles.btnDanger}>X</button>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </main>
    );
}

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: "100vh",
        backgroundColor: "#f7fafc",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2rem",
        color: "#2d3748",
    },
    header: {
        textAlign: "center" as const,
        marginBottom: "2rem",
    },
    title: {
        fontSize: "2.5rem",
        fontWeight: "bold",
        margin: "0 0 0.5rem 0",
        color: "#2b6cb0",
    },
    subtitle: {
        fontSize: "1.25rem",
        color: "#4a5568",
        margin: 0,
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
        gap: "2rem",
        maxWidth: "1200px",
        margin: "0 auto",
    },
    card: {
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        padding: "1.5rem",
        borderTop: "5px solid #3182ce"
    },
    cardHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1rem",
        paddingBottom: "1rem",
        borderBottom: "1px solid #e2e8f0"
    },
    badge: {
        padding: "0.25rem 0.75rem",
        borderRadius: "9999px",
        fontWeight: "bold",
        border: "none",
        outline: "none",
        cursor: "pointer"
    },
    formGroup: {
        marginBottom: "1rem",
    },
    label: {
        display: "block",
        fontWeight: "600",
        marginBottom: "0.25rem",
        color: "#4a5568",
        fontSize: "0.875rem"
    },
    input: {
        width: "100%",
        padding: "0.5rem",
        borderRadius: "6px",
        border: "1px solid #cbd5e0",
        fontSize: "0.9rem",
        boxSizing: "border-box" as const,
    },
    inputList: {
        padding: "0.4rem",
        borderRadius: "4px",
        border: "1px solid #cbd5e0",
        fontSize: "0.85rem",
    },
    sectionDivider: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "1.5rem",
        color: "#2d3748",
        backgroundColor: "#edf2f7",
        padding: "0.5rem",
        borderRadius: "6px"
    },
    sectionTitle: {
        margin: 0,
        fontSize: "1rem",
        fontWeight: "bold"
    },
    itemsList: {
        marginTop: "0.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem"
    },
    itemRow: {
        display: "flex",
        gap: "0.5rem"
    },
    btnPrimary: {
        backgroundColor: "#3182ce",
        color: "white",
        fontWeight: "bold",
        padding: "0.75rem 1.5rem",
        borderRadius: "8px",
        border: "none",
        cursor: "pointer",
        fontSize: "1rem"
    },
    btnSmall: {
        backgroundColor: "#48bb78",
        color: "white",
        border: "none",
        borderRadius: "4px",
        padding: "0.25rem 0.5rem",
        fontSize: "0.8rem",
        cursor: "pointer"
    },
    btnDanger: {
        backgroundColor: "#f56565",
        color: "white",
        border: "none",
        borderRadius: "4px",
        padding: "0.25rem 0.5rem",
        cursor: "pointer",
        fontWeight: "bold"
    }
};
