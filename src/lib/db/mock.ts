export interface MenuItem {
    id: string;
    nama: string;
    harga: number;
}

export interface TableItem {
    id: string;
    nomor: string;
    status: 'Aktif' | 'Tidak Aktif';
}

export interface MerchantData {
    phone: string;
    merchant_id: string;
    nama_kantin: string;
    status_toko: 'Buka' | 'Tutup';
    info_tambahan: string;
    menus: MenuItem[];
    tables: TableItem[];
    telegram_chat_id?: string;
}

// Stateful In-Memory Database
export let mockMerchants: MerchantData[] = [
    {
        phone: "0895808953200",
        merchant_id: "merch_001",
        nama_kantin: "Kantin Bu eRTe",
        status_toko: "Buka",
        info_tambahan: "Terima pembayaran QRIS",
        menus: [
            { id: "menu_1", nama: "Nasi Goreng Spesial", harga: 15000 },
            { id: "menu_2", nama: "Ayam Penyet", harga: 20000 },
            { id: "menu_3", nama: "Es Teh Manis", harga: 5000 }
        ],
        tables: [
            { id: "tbl_1", nomor: "Meja 1", status: "Aktif" },
            { id: "tbl_2", nomor: "Meja 2", status: "Tidak Aktif" }
        ]
    }
];

export async function getAllMerchants() {
    return mockMerchants;
}

export async function findMerchantByPhoneOrChatId(query: string) {
    // Simulasi delay query database
    await new Promise(resolve => setTimeout(resolve, 50));
    return mockMerchants.find(m => m.phone === query || m.telegram_chat_id === query) || null;
}

export async function linkTelegramChatId(phone: string, chatId: string) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const merchantIndex = mockMerchants.findIndex(m => m.phone === phone);
    if (merchantIndex !== -1) {
        mockMerchants[merchantIndex].telegram_chat_id = chatId;
        return true;
    }
    return false;
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

// Di memori, kita bisa me-replace array keseluruhan untuk keperluan update dari Dashboard
export async function saveAllMerchants(newData: MerchantData[]) {
    mockMerchants = newData;
    return true;
}
