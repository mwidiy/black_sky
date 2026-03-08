import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { updateMerchantStatus } from '../db/prisma';
import { getNextKeyConfiguration, getTotalKeys, getFallbackModel } from './key-manager';

// Kita buat MerchantContext fleksibel karena sekarang dia menerima JSON Laporan Utuh
export type MerchantContext = any;

type CoreMessage = { role: 'user' | 'assistant' | 'system', content: string };

// === MEMORI OBROLAN ===
// Menyimpan riwayat obrolan AI per Chat ID
const chatMemories = new Map<string, CoreMessage[]>();

export async function processMerchantMessage(contextForAI: MerchantContext, messageText: string, chatId: string = 'default') {
    // Bagian A: Menulis "System Prompt" (SOP Kaku)
    const systemPromptBase = `Kamu adalah asisten pengelola tingkat tinggi (Store Manager Omniscient) untuk aplikasi kasir dan self-ordering QuackXel. 
Tugasmu adalah membantu pemilik kantin memonitor seluruh operasional mereka dari mulai katalog menu, promo, denah meja, laporan pendapatan kasir, hingga pantauan pesanan dapur yang masih antre. Bersikaplah ramah, proaktif, layaknya manajer profesional. JANGAN berhalusinasi data. Gunakan murni data JSON yang diberikan di bawah ini.`;

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
4. ATURAN CARA BICARA: JANGAN PERNAH menyebut kata-kata teknis komputer di balasanmu (seperti "JSON", "Array", "dapur_aktif", "kasir_hari_ini", "object"). Jawablah dengan bahasa manusia yang luwes dan natural, seolah kamu asisten manusia sungguhan!
`;

    const fullSystemPrompt = `${systemPromptBase}\n${dynamicContext}`;

    let toolExecutionResult: string | null = null;

    try {
        const toolsDef = {
            ubahStatusKantin: tool({
                description: 'Gunakan alat ini setiap kali merchant menyuruh untuk MEMBUKA atau MENUTUP toko/kantin. Pastikan untuk mengisi parameter status.',
                parameters: z.object({
                    status: z.string().describe('Ketik persis "Buka" atau "Tutup" di sini.')
                }),
                // @ts-ignore
                execute: async (args: any) => {
                    console.log(`\n⚙️  [TOOL PAYLOAD ASLI DARI AI]:`, JSON.stringify(args));

                    let statusRaw = args?.status || args?.arguments?.status || args?.parameters?.status;
                    if (!statusRaw && typeof args === 'object') {
                        const values = Object.values(args);
                        statusRaw = values.find(v => typeof v === 'string' && (v.toLowerCase() === 'buka' || v.toLowerCase() === 'tutup'));
                    }

                    const status = (statusRaw === 'Tutup' || statusRaw?.toLowerCase() === 'tutup') ? 'Tutup' : 'Buka';

                    console.log(`\n⚙️  [TOOL DIPANGGIL] AI meminta perubahan status kantin menjadi: ${status}`);

                    const mId = parseInt(contextForAI.id_merchant);
                    const success = await updateMerchantStatus(mId, status);

                    if (success) {
                        toolExecutionResult = `Siap laksanakan! Status warung/kantin *${contextForAI.nama_kantin}* sekarang sudah diubah menjadi *${status}*.`;
                    } else {
                        toolExecutionResult = `Maaf bos, terjadi kesalahan sistem saat mencoba mengubah status kantin. Coba lagi nanti ya.`;
                    }
                    return toolExecutionResult;
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
                const currentMessage: CoreMessage = { role: 'user', content: messageText };

                const response = await generateText({
                    model: targetModel,
                    system: fullSystemPrompt,
                    messages: [...pastMessages, currentMessage],
                    // @ts-ignore
                    maxSteps: 5,
                    maxTokens: 1500, // Mencegah AI boros limit untuk free tier OpenRouter
                    tools: toolsDef,
                    onStepFinish({ text, toolCalls, finishReason }) {
                        if (finishReason) console.log(`\n🔍 [AI STEP DEBUG] Reason: ${finishReason}`);
                    }
                });

                // Kalo sukses, simpan percakapan ini ke CACHE MEMORY
                pastMessages.push(currentMessage);
                pastMessages.push({ role: 'assistant', content: response.text });

                // Batasi memori max 10 pesan terakhir (5 pasang tanya jawab) agar tidak melebihi konteks API
                if (pastMessages.length > 10) {
                    pastMessages = pastMessages.slice(pastMessages.length - 10);
                }
                chatMemories.set(chatId, pastMessages);

                responseText = response.text;
                break;

            } catch (error: any) {
                console.error(`❌ [ROTASI KEY ERROR] Model ${keyConfig?.name || 'Default'} gagal:`, error.message.substring(0, 100) + '...');

                // Kalo ini loop terakhir dari jatah key OpenRouter...
                if (attempts === totalMaxKeys - 1 || totalMaxKeys === 0) {
                    console.log(`🔥 [FALLBACK TERAKHIR] Semua antrean key error. Mengaktifkan GOOGLE_GENERATIVE_AI_API_KEY bawaan!`);
                    try {
                        let pastMessages = chatMemories.get(chatId) || [];
                        const currentMessage: CoreMessage = { role: 'user', content: messageText };

                        const finalResponse = await generateText({
                            model: getFallbackModel(),
                            system: fullSystemPrompt,
                            messages: [...pastMessages, currentMessage],
                            // @ts-ignore
                            maxSteps: 5,
                            maxTokens: 1500,
                            tools: toolsDef
                        });

                        pastMessages.push(currentMessage);
                        pastMessages.push({ role: 'assistant', content: finalResponse.text });
                        if (pastMessages.length > 10) pastMessages = pastMessages.slice(pastMessages.length - 10);
                        chatMemories.set(chatId, pastMessages);

                        responseText = finalResponse.text;
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

        if (toolExecutionResult) {
            return toolExecutionResult;
        }

        return responseText || "Tidak ada respon teks atau tool yang dipanggil oleh sistem AI.";
    } catch (error) {
        console.error("❌ Error saat memanggil Gemini AI:", error);
        return "Maaf, sistem AI kami sedang mengalami gangguan. Kami kehabisan semua api key cadangan dan Google API Key juga gagal merespon.";
    }
}
