import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { updateMerchantStatus } from '../db/prisma';

// Define the shape of our context
interface MenuItem {
    id: string;
    nama: string;
    harga: number;
}

interface TableItem {
    id: string;
    nomor: string;
    status: string;
}

interface MerchantContext {
    id_merchant: string;
    nama_kantin: string;
    status_saat_ini: string;
    info_tambahan: string;
    menus: MenuItem[];
    tables: TableItem[];
}

export async function processMerchantMessage(contextForAI: MerchantContext, messageText: string) {
    // Bagian A: Menulis "System Prompt" (SOP Kaku)
    const systemPromptBase = `Kamu adalah asisten cerdas untuk aplikasi kasir dan self-ordering QuackXel. Tugasmu HANYA membantu pemilik kantin mengelola warung mereka dan sistem Meja Pesan. Bersikaplah ramah, singkat, dan profesional. Jangan pernah menjawab pertanyaan di luar urusan operasional kantin.`;

    // Bagian B: Injeksi Konteks Dinamis (Variabel)
    const menuList = contextForAI.menus && contextForAI.menus.length > 0
        ? contextForAI.menus.map(m => `- ${m.nama} (Rp ${m.harga.toLocaleString('id-ID')})`).join('\n')
        : 'Belum ada menu yang didaftarkan.';

    const tableList = contextForAI.tables && contextForAI.tables.length > 0
        ? contextForAI.tables.map(t => `- ${t.nomor}: ${t.status}`).join('\n')
        : 'Belum ada meja yang didaftarkan.';

    const dynamicContext = `
Saat ini kamu sedang melayani pemilik kantin bernama: ${contextForAI.nama_kantin}. 
Status toko saat ini adalah: ${contextForAI.status_saat_ini}. 

Daftar Menu yang Tersedia:
${menuList}

Daftar Meja dan Statusnya:
${tableList}

Info tambahan mengenai kantin: ${contextForAI.info_tambahan}

PENTING: Jika merchant meminta menutup atau membuka kantin, WAJIB panggil alat (tool) \`ubahStatusKantin\` dan berikan parameter \`status\` dengan nilai "Buka" atau "Tutup". JANGAN biarkan parameter kosong! Setelah memanggil alat, kamu WAJIB membalas pesan ke merchant yang menginformasikan bahwa kantin sudah ditutup/dibuka.
`;

    const fullSystemPrompt = `${systemPromptBase}\n${dynamicContext}`;

    let toolExecutionResult: string | null = null;

    try {
        // Bagian C: Format Array Pesan (Menyuapi LLM) & Menambahkan Tools
        const response = await generateText({
            model: google('gemini-2.5-flash'),
            system: fullSystemPrompt,
            prompt: messageText,
            // @ts-ignore - Bypass type missing maxSteps on older or mismatched @ai-sdk/google versions
            maxSteps: 5, // Wajib ada supaya fungsi return text jalan setelah ping-pong tool
            tools: {
                ubahStatusKantin: tool({
                    description: 'Gunakan alat ini setiap kali merchant menyuruh untuk MEMBUKA atau MENUTUP toko/kantin. Pastikan untuk mengisi parameter status.',
                    parameters: z.object({
                        status: z.string().describe('Ketik persis "Buka" atau "Tutup" di sini.')
                    }),
                    // @ts-ignore
                    execute: async (args: any) => {
                        console.log(`\n⚙️  [TOOL PAYLOAD ASLI DARI AI]:`, JSON.stringify(args));

                        // Ekstrak status secara aman, kadang AI membungkusnya dalam objek lain
                        let statusRaw = args?.status || args?.arguments?.status || args?.parameters?.status;

                        // Validasi fallback jika masih undefined tapi ada di dalam string atau object
                        if (!statusRaw && typeof args === 'object') {
                            const values = Object.values(args);
                            statusRaw = values.find(v => typeof v === 'string' && (v.toLowerCase() === 'buka' || v.toLowerCase() === 'tutup'));
                        }

                        const status = (statusRaw === 'Tutup' || statusRaw?.toLowerCase() === 'tutup') ? 'Tutup' : 'Buka';

                        console.log(`\n⚙️  [TOOL DIPANGGIL] AI meminta perubahan status kantin menjadi: ${status}`);

                        // Eksekusi fungsi backend
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
            },
            onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
                console.log(`\n🔍 [AI STEP DEBUG] Reason: ${finishReason}`);
                if (toolCalls && toolCalls.length > 0) {
                    console.log(`🔍 [AI TOOL DARI MODEL]:`, JSON.stringify(toolCalls));
                }
                if (text) {
                    console.log(`🔍 [AI TEKS SEMENTARA]:`, text);
                }
            }
        });

        // Kalau tool tereksekusi, kita kirimkan balasan yang kita racik sendiri agar aman dari undefined.
        if (toolExecutionResult) {
            return toolExecutionResult;
        }

        return response.text || "Tidak ada respon teks atau tool yang dipanggil oleh sistem AI.";
    } catch (error) {
        console.error("❌ Error saat memanggil Gemini AI:", error);
        return "Maaf, sistem AI kami sedang mengalami gangguan. Mohon coba beberapa saat lagi.";
    }
}
