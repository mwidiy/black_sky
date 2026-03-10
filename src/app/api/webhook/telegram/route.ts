import { NextResponse } from "next/server";
import { findMerchantByPhoneOrChatId, linkTelegramChatId } from "@/lib/db/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { processMerchantMessage } from "@/lib/ai/generate";

// POST Request untuk Menerima Pesan Masuk dari Telegram
export async function POST(req: Request) {
    try {
        // Parsing JSON payload dari Telegram
        const body = await req.json();

        if (body.message) {
            const chatId = body.message.chat.id.toString();

            // Skenario 1: User menekan tombol "Verifikasi Nomor HP" (Mengirim Kontak)
            if (body.message.contact) {
                const contact = body.message.contact;

                // Normalisasi nomor HP (Buang tanda +, spasi, dll)
                let phone = contact.phone_number.replace(/\D/g, '');
                // Ubah awalan 62 jadi 0 agar seragam dengan input lokal di Dashboard Web
                if (phone.startsWith('62')) {
                    phone = '0' + phone.substring(2);
                }

                console.log(`\n📲 Menerima Kontak untuk Verifikasi: ${phone}`);

                // Cari merchant di DB berdasarkan nomor HP tersebut
                const merchant = await findMerchantByPhoneOrChatId(phone);

                if (merchant) {
                    // Cocok! Simpan Chat ID ke DB
                    await linkTelegramChatId(merchant.whatsappNumber!, chatId);

                    // Supaya tombol "Share Contact" hilang dari layar user, kita kirim ReplyMarkupRemove
                    const botToken = process.env.TELEGRAM_BOT_TOKEN;
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `✅ *Verifikasi Berhasil!*\n\nSelamat datang, pengelola kantin *${merchant.name}*.\nInformasi Chat ID Anda telah disimpan.\nSekarang Anda bisa langsung mengatur kantin menggunakan chat.`,
                            parse_mode: "Markdown",
                            reply_markup: { remove_keyboard: true }
                        })
                    });
                } else {
                    // Gak cocok!
                    await sendWhatsAppMessage(chatId, `❌ *Verifikasi Gagal.*\n\nNomor HP Anda (${phone}) tidak terdaftar sebagai pengelola kantin QuackXel di sistem kami.`);
                }

                return NextResponse.json({ success: true }, { status: 200 });
            }

            // Skenario 2: User mengirim Teks Biasa
            if (body.message.text) {
                const messageText = body.message.text;

                console.log("\n==================================");
                console.log("📨 PESAN TELEGRAM MASUK");
                console.log(`👤 Dari (Chat ID) : ${chatId}`);
                console.log(`💬 Pesan          : ${messageText}`);
                console.log("==================================\n");

                // PENTING: Kita cari merchant berdasarkan Chat ID yang mengobrol
                const merchant = await findMerchantByPhoneOrChatId(chatId);

                // Jika merchant TIDAK KETEMU, berarti user belum lolos verifikasi nomor HP
                if (!merchant) {
                    console.log(`❌ Akses Ditolak: Chat ID ${chatId} belum terdaftar/login.`);

                    const botToken = process.env.TELEGRAM_BOT_TOKEN;
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: "🔒 *Akses Terkunci*\n\nAnda belum terverifikasi sebagai pengelola kantin QuackXel. Silakan tekan tombol *📱 Verifikasi Nomor HP* di bawah layar untuk mengirim kontak Anda.\n\n⚠️ *Catatan Pengguna Web/Desktop:*\nJika tombol verifikasi tidak muncul di layar Anda, harap buka chat bot ini melalui **Aplikasi Telegram di HP/Smartphone** Anda agar tombol bisa ditekan.",
                            parse_mode: "Markdown",
                            reply_markup: {
                                keyboard: [
                                    [{ text: "📱 Verifikasi Nomor HP (Share Contact)", request_contact: true }]
                                ],
                                resize_keyboard: true,
                                one_time_keyboard: true
                            }
                        })
                    });

                    return NextResponse.json({ success: true }, { status: 200 });
                }

                // JIKA VALID / SUDAH LOGIN: Lanjut ke AI Flow seperti biasa
                // Merge Locations -> Tables
                let allTables: any[] = [];
                merchant.locations?.forEach((loc: any) => {
                    allTables = [...allTables, ...loc.tables];
                });

                // Hitung Revenue (Order Completed Hari Ini)
                const completedOrders = merchant.orders?.filter((o: any) => o.status === 'Completed') || [];
                const todayRevenue = completedOrders.reduce((acc: number, o: any) => acc + Number(o.totalAmount), 0);

                // Tarik Active Orders (Pending / Processing)
                const activeOrders = merchant.orders?.filter((o: any) => o.status === 'Pending' || o.status === 'Processing').map((o: any) => ({
                    id: o.id,
                    kode_transaksi: o.transactionCode,
                    pelanggan: o.customerName || 'Anonim',
                    waktu_pesan: o.createdAt,
                    tipe_pesanan: o.orderType, // Cth: DINE_IN / TAKEAWAY
                    pembayaran: o.paymentMethod,
                    meja: o.table?.name || '-',
                    status: o.status,
                    catatan_dari_pelanggan: o.note || '-',
                    total_tagihan: Number(o.totalAmount),
                    items: o.items.map((i: any) => `${i.quantity}x ${i.product.name}${i.note ? ` (Catatan: ${i.note})` : ''}`).join(", ")
                })) || [];

                // Kumpulkan Banners
                const activeBanners = merchant.banners?.filter((b: any) => b.isActive).map((b: any) => b.title) || [];

                // Susun Konteks Super Lengkap
                const contextForAI = {
                    pesan_masuk: messageText,
                    id_merchant: merchant.id,
                    profil_kantin: {
                        nama: merchant.name,
                        status_saat_ini: merchant.isOpen ? 'Buka' : 'Tutup',
                        telepon: merchant.whatsappNumber,
                        bank: merchant.bankName ? `${merchant.bankName} - ${merchant.bankNumber}` : 'Belum diatur',
                        qris: merchant.qrisImage ? 'Tersedia' : 'Tidak Tersedia'
                    },
                    katalog_menu: merchant.products?.map((p: any) => ({
                        id: p.id,
                        nama: p.name,
                        kategori: p.category?.name || 'Tanpa Kategori',
                        harga: Number(p.price),
                        status: p.isActive ? 'Tersedia' : 'Habis'
                    })) || [],
                    denah_meja: allTables.map(t => ({
                        id: t.id,
                        nomor: t.name,
                        status: t.isActive ? 'Bisa Dipakai' : 'Sedang Penuh/Mati'
                    })),
                    promo_aktif: activeBanners,
                    dapur_aktif: activeOrders,
                    kasir_hari_ini: {
                        total_transaksi_selesai: completedOrders.length,
                        pendapatan_kotor: todayRevenue
                    },
                    info_sistem: "(Data Deep Context - Realtime Prisma SQL)"
                };

                console.log("📦 Paket Data Matang (Context for AI):", contextForAI);

                // Kirim chatId sebagai identifier sesi memori (Tujuannya agar bot ingat riwayat obrolan user tsb)
                const aiResponseResult: any = await processMerchantMessage(contextForAI, messageText, chatId);
                const aiResponseText = typeof aiResponseResult === 'string' ? aiResponseResult : aiResponseResult.text;

                await sendWhatsAppMessage(chatId, aiResponseText);
                return NextResponse.json({ success: true }, { status: 200 });
            }
        }

        // SELALU kembalikan HTTP 200 OK
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error("❌ Terjadi kesalahan saat memproses payload Telegram:", error);
        return NextResponse.json({ error: "Terjadi kesalahan sistem.", details: error.message, stack: error.stack }, { status: 500 });
    }
}
