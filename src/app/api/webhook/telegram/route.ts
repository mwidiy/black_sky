import { NextResponse } from "next/server";
import { findMerchantByPhoneOrChatId, linkTelegramChatId } from "@/lib/db/mock";
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
                    await linkTelegramChatId(merchant.phone, chatId);

                    // Supaya tombol "Share Contact" hilang dari layar user, kita kirim ReplyMarkupRemove
                    const botToken = process.env.TELEGRAM_BOT_TOKEN;
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `✅ *Verifikasi Berhasil!*\n\nSelamat datang, pengelola kantin *${merchant.nama_kantin}*.\nInformasi Chat ID Anda telah disimpan.\nSekarang Anda bisa langsung mengatur kantin menggunakan chat.`,
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
                const contextForAI = {
                    pesan_masuk: messageText,
                    id_merchant: merchant.merchant_id,
                    nama_kantin: merchant.nama_kantin,
                    status_saat_ini: merchant.status_toko,
                    info_tambahan: merchant.info_tambahan,
                    menus: merchant.menus,
                    tables: merchant.tables
                };

                console.log("📦 Paket Data Matang (Context for AI):", contextForAI);

                const aiResponse = await processMerchantMessage(contextForAI, messageText);

                await sendWhatsAppMessage(chatId, aiResponse);
            }
        }

        // SELALU kembalikan HTTP 200 OK
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("❌ Terjadi kesalahan saat memproses payload Telegram:", error);
        return NextResponse.json({ error: "Terjadi kesalahan sistem." }, { status: 200 });
    }
}
