export const mockMerchants = [
    {
        phone: "6281234567890", // Contoh nomor
        merchant_id: "merch_001",
        nama_kantin: "Kantin Bu eRTe",
        status_toko: "Buka",
        pesanan_aktif: "Ada 3 pesanan belum diproses",
        info_tambahan: "Meja 4 atas nama Budi statusnya: LUNAS (QRIS)"
    },
    {
        phone: "6289876543210", // Contoh nomor lain
        merchant_id: "merch_002",
        nama_kantin: "Kantin Kang Mus",
        status_toko: "Tutup",
        pesanan_aktif: "Tidak ada pesanan aktif",
        info_tambahan: "Stok ayam geprek habis"
    }
];

export async function findMerchantByPhone(phone: string) {
    // Simulasi delay query database
    await new Promise(resolve => setTimeout(resolve, 50));

    return mockMerchants.find(m => m.phone === phone) || null;
}

export async function updateMerchantStatus(merchantId: string, status: "Buka" | "Tutup") {
    // Simulasi delay query database
    await new Promise(resolve => setTimeout(resolve, 100));

    const merchantIndex = mockMerchants.findIndex(m => m.merchant_id === merchantId);
    if (merchantIndex !== -1) {
        mockMerchants[merchantIndex].status_toko = status;
        return true;
    }
    return false;
}
