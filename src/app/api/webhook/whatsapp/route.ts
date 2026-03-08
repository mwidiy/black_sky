import { NextResponse } from "next/server";
import { findMerchantByPhoneOrChatId } from "@/lib/db/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { processMerchantMessage } from "@/lib/ai/generate";

// 1. GET Request untuk Verifikasi Meta Webhook
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get("hub.mode");
        const token = searchParams.get("hub.verify_token");
        const challenge = searchParams.get("hub.challenge");

        // Ambil token dari environment variable
        const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

        // Cek apakah mode dan token sesuai dengan ekspektasi dari Meta
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("✅ Webhook Meta berhasil diverifikasi!");
            // Kembalikan hub.challenge dalam bentuk format teks murni / HTTP 200 OK
            return new NextResponse(challenge, { status: 200 });
        }

        // Jika tidak sesuai, tolak permintaan
        console.error("❌ Verifikasi Webhook gagal. Token tidak sesuai.");
        return new NextResponse("Forbidden", { status: 403 });
    } catch (error) {
        console.error("❌ Terjadi kesalahan pada saat verifikasi GET:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

// 2. POST Request untuk Menerima Pesan Masuk (Tamu 2)
export async function POST(req: Request) {
    try {
        // Parsing JSON payload dari Meta secara aman
        const body = await req.json();

        // 1. Pastikan struktur dasar ada (object whatsapp_business_account & entry array)
        if (body.object === "whatsapp_business_account" && body.entry && body.entry.length > 0) {
            const entry = body.entry[0];

            // 2. Cek keberadaan changes array
            if (entry.changes && entry.changes.length > 0) {
                const change = entry.changes[0];
                const value = change.value;

                // 3. Cek keberadaan messages array (Pastikan pesan teks, bukan status read/delivered)
                if (value && value.messages && value.messages.length > 0) {
                    const message = value.messages[0];

                    // 4. Ekstrak Pengirim dan Isi Pesan
                    const senderNumber = message.from; // Contoh: "6281234567890"

                    // Pastikan tipe pesan adalah text
                    let messageText = "";
                    if (message.type === "text" && message.text) {
                        messageText = message.text.body; // Contoh: "Tolong tutup kantin dong"
                    } else {
                        messageText = "[Bukan Pesan Teks (Gambar/Audio/Video)]";
                    }

                    // Tampilkan log sesuai permintaan
                    console.log("\n==================================");
                    console.log("📨 PESAN WHATSAPP MASUK (Dari Meta)");
                    console.log(`👤 Dari (Sender) : ${senderNumber}`);
                    console.log(`💬 Pesan         : ${messageText}`);
                    console.log("==================================\n");

                    // TAHAP 2: Filter & Tarik Data
                    const merchant = await findMerchantByPhoneOrChatId(senderNumber);

                    if (!merchant) {
                        // Kondisi A: Nomor TIDAK ketemu di Database
                        console.log(`❌ Akses Ditolak: Nomor ${senderNumber} bukan mitra terdaftar.`);
                        await sendWhatsAppMessage(
                            senderNumber,
                            "Maaf, nomor Anda belum terdaftar sebagai mitra pengelola kantin QuackXel. Silakan daftar di aplikasi."
                        );
                    } else {
                        // Kondisi B: Nomor KETEMU di Database
                        // Merge Locations -> Tables
                        let allTables: any[] = [];
                        merchant.locations?.forEach((loc: any) => {
                            allTables = [...allTables, ...loc.tables];
                        });

                        const contextForAI = {
                            pesan_masuk: messageText,
                            id_merchant: merchant.id.toString(),
                            nama_kantin: merchant.name,
                            status_saat_ini: merchant.isOpen ? 'Buka' : 'Tutup',
                            info_tambahan: "(Prisma PostgreSQL Connected)",
                            menus: merchant.products?.map((p: any) => ({
                                id: p.id.toString(),
                                nama: p.name,
                                harga: p.price
                            })) || [],
                            tables: allTables.map((t: any) => ({
                                id: t.id.toString(),
                                nomor: t.name,
                                status: t.isActive ? 'Aktif' : 'Tidak Aktif'
                            }))
                        };

                        console.log("📦 Paket Data Matang (Context for AI):", contextForAI);

                        // TAHAP 3: Kirim contextForAI ini ke AI QuackXel
                        const aiResponse = await processMerchantMessage(contextForAI, messageText);

                        // TAHAP 4: Kembalikan balasan ke WhatsApp (Mock)
                        await sendWhatsAppMessage(senderNumber, aiResponse);
                    }
                }
            }
        }

        // SELALU kembalikan respon HTTP 200 OK secepat mungkin agar Meta tidak spam / retry
        return NextResponse.json({ success: true, message: "EVENT_RECEIVED" }, { status: 200 });

    } catch (error) {
        console.error("❌ Terjadi kesalahan saat memproses payload POST:", error);
        // Jika JSON hancur atau kode crash, Meta juga tetap butuh respon 200/500 (untuk kasus ini kita return 200 biar ga dispam jika error parsing)
        return NextResponse.json({ error: "Terjadi kesalahan sistem, tapi payload diterima." }, { status: 200 });
    }
}
