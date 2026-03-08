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
        return true;
    } catch (e) {
        console.error("Gagal update status toko (DB Asli):", e);
        return false;
    }
}
