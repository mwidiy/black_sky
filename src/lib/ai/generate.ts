import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { updateMerchantStatus, selesaikanPesananAI, batalkanPesananAI, tambahMenuKantinAI, ubahHargaMenuAI, ubahStatusMenuAI, hapusMenuAI, crudTableAI } from '../db/prisma';
import { getNextKeyConfiguration, getTotalKeys, getFallbackModel } from './key-manager';

// Kita buat MerchantContext fleksibel karena sekarang dia menerima JSON Laporan Utuh
export type MerchantContext = any;

type CoreMessage = { role: 'user' | 'assistant' | 'system', content: string };

// === MEMORI OBROLAN ===
// Menyimpan riwayat obrolan AI per Chat ID
const chatMemories = new Map<string, CoreMessage[]>();

export async function processMerchantMessage(contextForAI: MerchantContext, messageText: string, chatId: string = 'default') {
    // Bagian A: Menulis "System Prompt" (SOP Kaku)
    const systemPromptBase = `Kamu adalah Kasir AI & Store Manager untuk aplikasi kantin cerdas bernama QuackXel.
Tugasmu adalah menjawab SEMUA pertanyaan murni berdasarkan DATA JSON REAL-TIME yang disuntikkan di bawah pesan ini.
JANGAN PERNAH berkata "saya tidak punya akses real-time" atau "silakan cek aplikasi", karena DATA DI BAWAH INI ADALAH DATA REAL-TIME DARI APLIKASI. Jika data ada di JSON, jawablah dengan percaya diri. Bersikaplah ramah dan asyik layaknya anak muda.`;

    // Bagian B: Injeksi Konteks Dinamis (JSON Penuh)
    const dynamicContext = `
DATA REAL-TIME DATABASE STORE INI SAAT INI (Format JSON):
\`\`\`json
${JSON.stringify(contextForAI, null, 2)}
\`\`\`

Berdasarkan JSON Laporan di atas:
- "profil_kantin" berisi status buka/tutup dan info rekening.
- "katalog_menu" berisi daftar barang dagangan, harga, kategori, ketersediaan.
- "denah_meja" berisi denah toko.
- "promo_aktif" berisi banner promo yang sedang dijalankan.
- "dapur_aktif" adalah DAFTAR PESANAN YANG SEDANG ANTRE / DIMASAK saat ini. Jika kosong, berarti tidak ada orderan nyangkut.
- "kasir_hari_ini" adalah rekapitulasi penjualan hari ini (revenue).

PENTING: 
1. Jika admin bertanya "ada pesanan masuk gak", lihat "dapur_aktif".
2. Jika admin bertanya "hari ini dapet berapa duit/omzet", lihat "kasir_hari_ini".
3. Jika admin meminta menutup atau membuka kantin, WAJIB panggil alat (tool) \`ubahStatusKantin\` dengan parameter "Buka" atau "Tutup".
4. Jika admin menyuruh memproses pesanan / menyelesaikan pesanan, panggil \`selesaikanPesanan\`. Jika admin minta membatalkan, panggil \`batalkanPesanan\`.
5. Jika admin meminta **MENAMBAH** menu baru, panggil \`tambahMenu\`.
6. Jika admin meminta mengubah **HARGA** menu, panggil \`ubahHargaMenu\`.
7. Jika admin meminta mengubah ketersediaan (habis/kosong/ada), panggil \`ubahStatusMenu\`.
8. Jika admin meminta **MENGHAPUS** menu, panggil \`hapusMenu\`.
9. ATURAN CARA BICARA: JANGAN menyebut kata-kata teknis seperti "JSON", "Array". Jawablah natural.
10. LARANGAN KERAS: DILARANG KERAS menyuruh user mengecek aplikasi sendiri jika datanya sudah ada di "katalog_menu" atau "dapur_aktif". Kamu HARUS membacakan datanya langsung dari JSON tersebut.
`;

    const fullSystemPrompt = `${systemPromptBase}\n${dynamicContext}`;

    try {
        const toolsDef = {
            ubahStatusKantin: tool({
                description: 'Gunakan alat ini setiap kali merchant menyuruh untuk MEMBUKA atau MENUTUP toko/kantin. Pastikan untuk mengisi parameter status.',
                parameters: z.object({
                    status: z.string().describe('Ketik persis "Buka" atau "Tutup" di sini.')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const { status } = args;
                    const statusStr = (status === 'Tutup' || status?.toLowerCase() === 'tutup') ? 'Tutup' : 'Buka';
                    console.log(`\n⚙️  [TOOL DIPANGGIL] AI meminta perubahan status kantin menjadi: ${statusStr}`);
                    const success = await updateMerchantStatus(parseInt(contextForAI.id_merchant), statusStr);
                    return success ? `Berhasil mengubah status kantin menjadi ${statusStr}` : `Gagal mengubah status kantin`;
                }
            }),
            selesaikanPesanan: tool({
                description: 'Selesaikan pesanan pelanggan berdasarkan nama pelanggannya.',
                parameters: z.object({
                    nama_pelanggan: z.string().describe('Nama pelanggan yang pesanannya mau diselesaikan (misal: Budi Santoso)')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const res = await selesaikanPesananAI(parseInt(contextForAI.id_merchant), args.nama_pelanggan);
                    return res.message;
                }
            }),
            batalkanPesanan: tool({
                description: 'Batalkan pesanan berdasarkan nama pelanggan dan sebutkan alasannya.',
                parameters: z.object({
                    nama_pelanggan: z.string().describe('Nama pelanggan'),
                    alasan: z.string().describe('Alasan lengkap kenapa dibatalkan')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const res = await batalkanPesananAI(parseInt(contextForAI.id_merchant), args.nama_pelanggan, args.alasan);
                    return res.message;
                }
            }),
            tambahMenu: tool({
                description: 'Tambahkan menu baru ke kantin beserta dengan harganya.',
                parameters: z.object({
                    nama_menu: z.string().describe('Nama lengkap jualan yang baru (Misal: Es Teh Manis)'),
                    harga: z.coerce.number().describe('Harga jual dalam bentuk angka bulat')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const res = await tambahMenuKantinAI(parseInt(contextForAI.id_merchant), args.nama_menu, args.harga);
                    return res.message;
                }
            }),
            ubahHargaMenu: tool({
                description: 'Ubah harga jual sebuah menu.',
                parameters: z.object({
                    nama_menu: z.string().describe('Nama menu yang ingin diubah harganya (Misal: Nasi Goreng)'),
                    harga_baru: z.coerce.number().describe('Harga baru dalam bentuk angka bulat (Misal: 15000)')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const res = await ubahHargaMenuAI(parseInt(contextForAI.id_merchant), args.nama_menu, args.harga_baru);
                    return res.message;
                }
            }),
            ubahStatusMenu: tool({
                description: 'Ubah ketersediaan sebuah menu (apakah sedang habis atau tersedia).',
                parameters: z.object({
                    nama_menu: z.string().describe('Nama menu'),
                    status_ketersediaan: z.string().describe('Ketik persis antara "tersedia" ATAU "habis"')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const res = await ubahStatusMenuAI(parseInt(contextForAI.id_merchant), args.nama_menu, args.status_ketersediaan);
                    return res.message;
                }
            }),
            hapusMenu: tool({
                description: 'Hapus sebuah menu permanen dari daftar kantin.',
                parameters: z.object({
                    nama_menu: z.string().describe('Nama menu yang mau dihapus/dicabut')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const res = await hapusMenuAI(parseInt(contextForAI.id_merchant), args.nama_menu);
                    return res.message;
                }
            }),
            crudTable: tool({
                description: 'Ubah atau hapus meja/lokasi fisik.',
                parameters: z.object({
                    action: z.enum(['create', 'update', 'delete']),
                    tableId: z.coerce.number().optional(),
                    name: z.string().optional(),
                    isActive: z.boolean().optional()
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    const res = await crudTableAI(args.action, parseInt(contextForAI.id_merchant), args.tableId, args.name, args.isActive);
                    return res.message;
                }
            })
        };

        let responseText = null;
        const totalMaxKeys = getTotalKeys();

        for (let attempts = 0; attempts < Math.max(1, totalMaxKeys); attempts++) {
            // Tentukan Model yang mau dipakai giliran ini
            const keyConfig = getNextKeyConfiguration();
            let targetModel = keyConfig ? keyConfig.model : google('gemini-2.5-flash');

            if (keyConfig) {
                console.log(`\n🔄 [ROTASI KEY]: Mencoba menggunakan array env key: ${keyConfig.name}`);
            } else {
                console.log(`\n🔄 [ROTASI KEY]: List OpenRouter kosong, menggunakan default Google AI...`);
            }

            try {
                // Tarik memori yang pernah diomongin oleh chat ID ini (kalo ada)
                let pastMessages = chatMemories.get(chatId) || [];
                // Bersihkan memori dari khayalan error sebelumnya
                pastMessages = pastMessages.filter(m => !m.content.includes('Sistem: undefined') && !m.content.includes('saya tidak dapat menampilkan'));

                const currentMessage: CoreMessage = { role: 'user', content: messageText };

                const response = await generateText({
                    model: targetModel,
                    system: fullSystemPrompt,
                    messages: [...pastMessages, currentMessage],
                    // @ts-ignore
                    maxSteps: 1, // Memaksa AI hanya 1 langkah untuk mencegah halusinasi tool-calls loop OpenRouter
                    maxTokens: 1500, // Mencegah AI boros limit untuk free tier OpenRouter
                    tools: toolsDef,
                    onStepFinish({ text, toolCalls, finishReason }) {
                        if (finishReason) console.log(`\n🔍 [AI STEP DEBUG] Reason: ${finishReason}`);
                    }
                });

                let finalOutputContent = response.text;

                // Mencegah loop OpenRouter: Langsung cetak hasil eksekusi tool jika ada
                if (response.toolResults && response.toolResults.length > 0) {
                    const mappedResults = response.toolResults.map((tr: any) => tr.result).join('\n---\n');
                    finalOutputContent = `✅ Eksekusi Selesai:\n${mappedResults}`;
                } else if (!finalOutputContent || finalOutputContent.trim() === '') {
                    finalOutputContent = "Aksi diterima. Sistem sedang memproses perintah Anda (Hanya backend).";
                }

                // Kalo sukses, simpan percakapan ini ke CACHE MEMORY
                pastMessages.push(currentMessage);
                pastMessages.push({ role: 'assistant', content: finalOutputContent });

                // Batasi memori max 10 pesan terakhir (5 pasang tanya jawab) agar tidak melebihi konteks API
                if (pastMessages.length > 10) {
                    pastMessages = pastMessages.slice(pastMessages.length - 10);
                }
                chatMemories.set(chatId, pastMessages);

                responseText = finalOutputContent;
                break;

            } catch (error: any) {
                console.error(`❌ [ROTASI KEY ERROR] Model ${keyConfig?.name || 'Default'} gagal:`, error.message.substring(0, 100) + '...');

                // Kalo ini loop terakhir dari jatah key OpenRouter...
                if (attempts === totalMaxKeys - 1 || totalMaxKeys === 0) {
                    console.log(`🔥 [FALLBACK TERAKHIR] Semua antrean key error. Mengaktifkan GOOGLE_GENERATIVE_AI_API_KEY bawaan!`);
                    try {
                        let pastMessages = chatMemories.get(chatId) || [];
                        pastMessages = pastMessages.filter(m => !m.content.includes('Sistem: undefined') && !m.content.includes('saya tidak dapat menampilkan'));
                        const currentMessage: CoreMessage = { role: 'user', content: messageText };

                        const finalResponse = await generateText({
                            model: getFallbackModel(),
                            system: fullSystemPrompt,
                            messages: [...pastMessages, currentMessage],
                            // @ts-ignore
                            maxSteps: 1,
                            maxTokens: 1500,
                            tools: toolsDef
                        });

                        let finalFallbackOutput = finalResponse.text;
                        if (finalResponse.toolResults && finalResponse.toolResults.length > 0) {
                            const fbMappedResults = finalResponse.toolResults.map((tr: any) => tr.result).join('\n---\n');
                            finalFallbackOutput = `✅ Eksekusi Selesai:\n${fbMappedResults}`;
                        } else if (!finalFallbackOutput || finalFallbackOutput.trim() === '') {
                            finalFallbackOutput = "Aksi diterima. Sistem memproses perintah Anda.";
                        }

                        pastMessages.push(currentMessage);
                        pastMessages.push({ role: 'assistant', content: finalFallbackOutput });
                        if (pastMessages.length > 10) pastMessages = pastMessages.slice(pastMessages.length - 10);
                        chatMemories.set(chatId, pastMessages);

                        responseText = finalFallbackOutput;
                        break;
                    } catch (finalError) {
                        console.error("❌ Error FATAL saat memanggil Google AI Terakhir:", finalError);
                        return "Maaf, sistem AI kami sedang mengalami gangguan. Kami kehabisan semua api key cadangan.";
                    }
                } else {
                    console.log(`⚠️ Melanjutkan ke rotasi key berikutnya...`);
                }
            }
        }

        return responseText || "Tidak ada respon teks atau tool yang dipanggil oleh sistem AI.";
    } catch (error) {
        console.error("❌ Error saat memanggil Gemini AI:", error);
        return "Maaf, sistem AI kami sedang mengalami gangguan. Kami kehabisan semua api key cadangan dan Google API Key juga gagal merespon.";
    }
}
