import { PrismaClient } from '@prisma/client';

// Setup singleton Prisma Client untuk Next.js (Mencegah exhaustion connection di hot-reload)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['query', 'info', 'warn', 'error'],
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Mencari merchant (Store) berdasarkan nomor WhatsApp (yang didaftarkan) ATAU Chat ID Telegram
 * Mem-fetch sekalian: Product (Menu), dan Location -> Table (Meja)
 */
export async function findMerchantByPhoneOrChatId(query: string) {
    const store = await prisma.store.findFirst({
        where: {
            OR: [
                { whatsappNumber: query },
                { telegramChatId: query }
            ]
        },
        include: {
            categories: true,
            banners: {
                where: { isActive: true }
            },
            products: {
                where: { isActive: true },
                include: { category: true } // Tarik kategori dari relasi produk
            },
            locations: {
                include: {
                    tables: true // Tarik semua meja di semua lokasi
                }
            },
            orders: {
                take: 100, // Ambil 100 orderan terakhir (sudah cukup mencakup order aktif & uang hari ini)
                orderBy: { createdAt: 'desc' },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    },
                    table: true
                }
            }
        }
    });

    return store;
}

/**
 * Menyambungkan/melink Telegram Chat ID ke sebuah kantin berdasarkan Nomor HP pendaftaran
 */
export async function linkTelegramChatId(phone: string, chatId: string) {
    // Cari dulu kantinnya
    const store = await prisma.store.findFirst({
        where: { whatsappNumber: phone }
    });

    if (!store) return false;

    // Update
    await prisma.store.update({
        where: { id: store.id },
        data: { telegramChatId: chatId }
    });

    return true;
}

/**
 * Tool eksekusi dari AI: Menyuruh database asli untuk Buka/Tutup toko
 */
export async function updateMerchantStatus(merchantId: number, status: 'Buka' | 'Tutup') {
    const isOpen = status === 'Buka';

    try {
        await prisma.store.update({
            where: { id: merchantId },
            data: { isOpen }
        });

        // 🚨 AUTO-KILL SWITCH: Mematikan seluruh QR Code Meja saat Toko Tutup, atau Mengaktifkan saat Buka
        const locations = await prisma.location.findMany({
            where: { storeId: merchantId },
            select: { id: true }
        });
        const locationIds = locations.map(l => l.id);

        if (locationIds.length > 0) {
            await prisma.table.updateMany({
                where: { locationId: { in: locationIds } },
                data: { isActive: isOpen } // Sync status meja (QR) dengan toko
            });
        }

        return true;
    } catch (e) {
        console.error("Gagal update status toko (DB Asli):", e);
        return false;
    }
}

// ==========================================
// TAHAP 15: AI DATABASE MUTATION (CRUD TOOLS)
// ==========================================

// ==========================================
// TAHAP 17: NLP-TO-DB ATOMIC TOOLS (AI FUNCTIONS)
// AI hanya perlu passing String (Bahasa Manusia), Mesin yang cari ID-nya.
// ==========================================

export async function selesaikanPesananAI(storeId: number, orderIdOrName: string) {
    if (!orderIdOrName || orderIdOrName.trim() === '') return { success: false, message: 'ID atau Nama pelanggan tidak boleh kosong.' };
    try {
        const orderId = Number(orderIdOrName);
        let order;

        if (!isNaN(orderId)) {
            order = await prisma.order.findFirst({
                where: { id: orderId, storeId, status: { in: ['Pending', 'Processing'] } }
            });
        }

        if (!order) {
            order = await prisma.order.findFirst({
                where: {
                    storeId,
                    customerName: { contains: orderIdOrName, mode: 'insensitive' },
                    status: { in: ['Pending', 'Processing'] }
                },
                orderBy: { createdAt: 'desc' }
            });
        }

        if (!order) return { success: false, message: `Pesanan ID/Nama '${orderIdOrName}' tidak ditemukan atau sudah selesai/batal.` };

        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'Completed' }
        });
        return { success: true, message: `Pesanan '${order.customerName}' (Kode: ${order.transactionCode}) berhasil diselesaikan!` };
    } catch (e: any) {
        return { success: false, message: `Gagal menyelesaikan pesanan: ${e.message}` };
    }
}

export async function batalkanPesananAI(storeId: number, namaPelanggan: string, alasan: string) {
    if (!namaPelanggan || namaPelanggan.trim() === '') return { success: false, message: 'Nama pelanggan tidak boleh kosong.' };
    if (!alasan || alasan.trim() === '') return { success: false, message: 'Alasan pembatalan harus disertakan.' };
    try {
        const order = await prisma.order.findFirst({
            where: {
                storeId,
                customerName: { contains: namaPelanggan, mode: 'insensitive' },
                status: { in: ['Pending', 'Processing'] }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!order) return { success: false, message: `Pesanan aktif atas nama '${namaPelanggan}' tidak ditemukan.` };

        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'Cancelled', cancellationReason: alasan, cancellationStatus: 'Approved' }
        });
        return { success: true, message: `Pesanan '${order.customerName}' berhasil dibatalkan dengan alasan: ${alasan}` };
    } catch (e: any) {
        return { success: false, message: `Gagal membatalkan pesanan: ${e.message}` };
    }
}

export async function tambahMenuKantinAI(storeId: number, namaMenu: string, harga: number, namaKategori: string = 'Umum') {
    if (!namaMenu || namaMenu.trim() === '') return { success: false, message: 'Nama menu tidak boleh kosong.' };
    if (isNaN(Number(harga)) || Number(harga) <= 0) return { success: false, message: 'Harga tidak valid.' };
    try {
        let category;
        
        // Cek jika input kategori berupa 'ID' (User milih angka dari List)
        if (!isNaN(Number(namaKategori))) {
             category = await prisma.category.findFirst({ where: { id: Number(namaKategori), storeId } });
        }
        
        // Cek berdasarkan persis Namanya jika ID tidak ditemukan
        if (!category) {
            category = await prisma.category.findFirst({
                where: { storeId, name: { equals: namaKategori, mode: 'insensitive' } }
            });
        }

        // Kalau belum ketemu juga, otomatis Bikin Kategori Baru!
        if (!category) {
            category = await prisma.category.create({ data: { name: namaKategori || 'Umum', storeId } });
        }

        await prisma.product.create({
            data: {
                name: namaMenu,
                price: Number(harga),
                isActive: true,
                categoryId: category.id,
                storeId,
                description: '',
                image: ''
            }
        });
        return { success: true, message: `Menu baru '${namaMenu}' seharga Rp${harga} berhasil ditambahkan ke Kategori '${category.name}'.` };
    } catch (e: any) {
        return { success: false, message: `Gagal menambah menu: ${e.message}` };
    }
}

export async function tambahKategoriAI(storeId: number, namaKategori: string) {
    if (!namaKategori || namaKategori.trim() === '') return { success: false, message: 'Nama kategori tidak boleh kosong.' };
    try {
        const existing = await prisma.category.findFirst({
            where: { storeId, name: { equals: namaKategori, mode: 'insensitive' } }
        });
        
        if (existing) return { success: false, message: `Kategori '${existing.name}' sudah ada di menu Anda.` };

        await prisma.category.create({ data: { name: namaKategori, storeId } });
        return { success: true, message: `Kategori baru '${namaKategori}' berhasil dibuat.` };
    } catch (e: any) {
        return { success: false, message: `Gagal membuat kategori: ${e.message}` };
    }
}

export async function ubahHargaMenuAI(storeId: number, menuIdOrName: string, hargaBaru: number) {
    if (!menuIdOrName || menuIdOrName.trim() === '') return { success: false, message: 'ID atau Nama menu tidak boleh kosong.' };
    if (isNaN(Number(hargaBaru)) || Number(hargaBaru) <= 0) return { success: false, message: 'Harga baru tidak valid atau tidak disebutkan.' };
    try {
        const menuId = Number(menuIdOrName);
        let product;

        if (!isNaN(menuId)) {
            product = await prisma.product.findFirst({ where: { id: menuId, storeId } });
        }

        if (!product) {
            product = await prisma.product.findFirst({
                where: { storeId, name: { contains: menuIdOrName, mode: 'insensitive' } }
            });
        }

        if (!product) return { success: false, message: `Menu dengan pelacak '${menuIdOrName}' tidak ditemukan.` };

        await prisma.product.update({
            where: { id: product.id },
            data: { price: Number(hargaBaru) }
        });
        return { success: true, message: `Harga '${product.name}' berhasil diubah menjadi Rp${hargaBaru}.` };
    } catch (e: any) {
        return { success: false, message: `Gagal mengubah harga menu: ${e.message}` };
    }
}

export async function ubahStatusMenuAI(storeId: number, namaMenu: string, statusText: string) {
    if (!namaMenu || namaMenu.trim() === '') return { success: false, message: 'Tolong sebutkan nama menu yang spesifik secara lengkap.' };
    if (!statusText || statusText.trim() === '') return { success: false, message: 'Status tidak boleh kosong.' };
    try {
        const product = await prisma.product.findFirst({
            where: { storeId, name: { contains: namaMenu, mode: 'insensitive' } }
        });

        if (!product) return { success: false, message: `Menu mirip kata '${namaMenu}' tidak ditemukan.` };

        const isAvailable = !(statusText.toLowerCase().includes('habis') || statusText.toLowerCase().includes('kosong'));

        await prisma.product.update({
            where: { id: product.id },
            data: { isActive: isAvailable }
        });
        const statusLabel = isAvailable ? 'Tersedia' : 'Habis';
        return { success: true, message: `Status '${product.name}' berhasil diubah menjadi ${statusLabel}.` };
    } catch (e: any) {
        return { success: false, message: `Gagal mengubah status menu: ${e.message}` };
    }
}

export async function hapusMenuAI(storeId: number, menuIdOrName: string) {
    if (!menuIdOrName || menuIdOrName.trim() === '') return { success: false, message: 'Tolong sebutkan ID atau nama menu yang ingin dihapus.' };
    try {
        const menuId = Number(menuIdOrName);
        let product;

        if (!isNaN(menuId)) {
            product = await prisma.product.findFirst({ where: { id: menuId, storeId } });
        }

        if (!product) {
            product = await prisma.product.findFirst({
                where: { storeId, name: { contains: menuIdOrName, mode: 'insensitive' } }
            });
        }

        if (!product) return { success: false, message: `Menu pelacak '${menuIdOrName}' tidak ditemukan.` };

        await prisma.product.delete({
            where: { id: product.id }
        });
        return { success: true, message: `Menu '${product.name}' berhasil dihapus dari daftar katalog.` };
    } catch (e: any) {
        return { success: false, message: `Gagal menghapus menu: ${e.message}` };
    }
}


export async function tambahLokasiAI(storeId: number, namaLokasi: string) {
    if (!namaLokasi || namaLokasi.trim() === '') return { success: false, message: 'Nama lokasi (area) tidak boleh kosong.' };
    try {
        await prisma.location.create({
            data: {
                name: namaLokasi,
                storeId: storeId
            }
        });
        return { success: true, message: `Lokasi baru '${namaLokasi}' berhasil ditambahkan ke kantin.` };
    } catch (e: any) {
        return { success: false, message: `Gagal menambah lokasi: ${e.message}` };
    }
}

export async function tambahMejaAI(storeId: number, namaMeja: string, locationIdOrName: string = '') {
    if (!namaMeja || namaMeja.trim() === '') return { success: false, message: 'Nama/Nomor meja tidak boleh kosong.' };
    try {
        let location;
        const locId = Number(locationIdOrName);
        
        // Priority: EXACT Location ID
        if (!isNaN(locId) && locId !== 0) {
            location = await prisma.location.findFirst({ where: { id: locId, storeId } });
        }

        // Fallback: Fuzzy Name Match
        if (!location && locationIdOrName.trim() !== '') {
             location = await prisma.location.findFirst({
                 where: { storeId, name: { contains: locationIdOrName, mode: 'insensitive' } }
             });
        }

        // Fallback: Default location or Create one
        if (!location) {
             location = await prisma.location.findFirst({ where: { storeId }, orderBy: { id: 'asc' } });
             if (!location) {
                 location = await prisma.location.create({ data: { name: 'Area Utama', storeId } });
             }
        }

        await prisma.table.create({
            data: {
                name: namaMeja,
                isActive: true,
                locationId: location.id,
                qrCode: `qr_${storeId}_${Date.now()}`
            }
        });
        return { success: true, message: `Meja '${namaMeja}' berhasil ditambahkan ke area ${location.name}.` };
    } catch (e: any) {
        return { success: false, message: `Gagal menambah meja: ${e.message}` };
    }
}

export async function crudTableAI(action: 'create' | 'update' | 'delete', storeId: number, tableId?: number, name?: string, isActive?: boolean) {
    try {
        // Karena Table terkait dengan Location, kita tarik Locations miliknya si Store ini
        const locs = await prisma.location.findMany({ where: { storeId } });
        const locIds = locs.map(l => l.id);

        if (action === 'create' && name) {
            if (locs.length === 0) return { success: false, message: 'Harus ada Location minimal 1 di dashboard sebelum membuat Meja.' };
            await prisma.table.create({
                data: { name, isActive: isActive ?? true, locationId: locs[0].id, qrCode: `qr_ai_${Date.now()}` }
            });
            return { success: true, message: `Meja '${name}' berhasil ditambah.` };
        } else if (action === 'update' && tableId) {
            const t = await prisma.table.findFirst({ where: { id: tableId, locationId: { in: locIds } } });
            if (!t) return { success: false, message: `Akses ditolak: Meja ID ${tableId} bukan milik kantin ini.` };

            const dataToUpdate: any = {};
            if (name) dataToUpdate.name = name;
            if (isActive !== undefined) dataToUpdate.isActive = isActive;

            await prisma.table.update({ where: { id: tableId }, data: dataToUpdate });
            return { success: true, message: `Status Meja/QR ID ${tableId} berhasil diubah.` };
        } else if (action === 'delete' && tableId) {
            const t = await prisma.table.findFirst({ where: { id: tableId, locationId: { in: locIds } } });
            if (!t) return { success: false, message: `Akses ditolak: Meja ID ${tableId} bukan milik kantin ini.` };

            await prisma.table.delete({ where: { id: tableId } });
            return { success: true, message: `Meja ID ${tableId} berhasil dibakar/dihapus.` };
        }
        return { success: false, message: 'Parameter meja tidak lengkap.' };
    } catch (e: any) {
        return { success: false, message: `Gagal manipulasi meja: ${e.message}` };
    }
}
