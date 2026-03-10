import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { updateMerchantStatus, selesaikanPesananAI, batalkanPesananAI, tambahMenuKantinAI, ubahHargaMenuAI, ubahStatusMenuAI, hapusMenuAI, crudTableAI } from '../db/prisma';
import { getNextKeyConfiguration, getTotalKeys, getFallbackModel } from './key-manager';

export type MerchantContext = any;

type CoreMessage = { role: 'user' | 'assistant' | 'system', content: string };
const chatMemories = new Map<string, CoreMessage[]>();

/**
 * 🤖 FUNGSI INTI SWARM AGENT
 * Menjalankan satu Agen spesifik dengan retry otomatis dan rotasi key
 */
async function runSwarmAgent(agentName: string, systemPrompt: string, userPrompt: string, requireJson: boolean = false): Promise<string> {
    const totalMaxKeys = getTotalKeys();

    for (let attempts = 0; attempts < Math.max(1, totalMaxKeys); attempts++) {
        const keyConfig = getNextKeyConfiguration();
        let targetModel = keyConfig ? keyConfig.model : google('gemini-2.5-flash');

        console.log(`\n🤖 [SWARM - ${agentName}] Mengudara dengan key: ${keyConfig ? keyConfig.name : 'Default'}`);

        try {
            const response = await generateText({
                model: targetModel,
                system: systemPrompt,
                prompt: userPrompt,
                maxTokens: requireJson ? 500 : 1500,
                temperature: requireJson ? 0.0 : 0.7, // JSON butuh presisi, Chat butuh kreativitas
            });

            let text = response.text;

            if (requireJson) {
                // Ekstrak JSON murni dari balasan (jaga-jaga model ngawur ngasih backticks)
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) text = jsonMatch[0];
            }
            return text;

        } catch (error: any) {
            console.error(`❌ [SWARM - ${agentName}] Error dengan key ${keyConfig?.name || 'Default'}:`, error.message.substring(0, 100));

            // Jika ini adalah percobaan terakhir, gunakan Fallback Asli
            if (attempts === totalMaxKeys - 1 || totalMaxKeys === 0) {
                try {
                    const fallbackRes = await generateText({
                        model: getFallbackModel(),
                        system: systemPrompt,
                        prompt: userPrompt,
                    });
                    let text = fallbackRes.text;
                    if (requireJson) {
                        const jsonMatch = text.match(/\{[\s\S]*\}/);
                        if (jsonMatch) text = jsonMatch[0];
                    }
                    return text;
                } catch (fallErr) {
                    console.error(`❌ [SWARM - ${agentName}] FATAL FALLBACK ERROR`);
                    return requireJson ? "{}" : "Maaf bro, sistem lagi pusing nih!";
                }
            }
        }
    }
    return requireJson ? "{}" : "Error";
}

/**
 * 👑 THE SWARM ORCHESTRATOR
 * Orkestrasi 4 Agen secara Paralel dan Sekuensial layaknya CrewAI
 */
export async function processMerchantMessage(contextForAI: MerchantContext, messageText: string, chatId: string = 'default') {
    // 1. Tarik Memori
    let pastMessages = chatMemories.get(chatId) || [];
    const chatHistory = pastMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

    // ==========================================
    // 🧠 TAHAP 1: PARALLEL EXTRACTION (Agen 1 & 2)
    // ==========================================
    const gatekeeperSystem = `Kamu adalah Agen 1 (Gatekeeper). Tugasmu MURNI membalas dengan format JSON saja.
Pilih satu intent (tujuan) utama dari chat user: "UBAH_HARGA", "TAMBAH_MENU", "HAPUS_MENU", "UBAH_STATUS_MENU", "UBAH_STATUS_KANTIN", "SELESAIKAN_PESANAN", "BATALKAN_PESANAN", "CRUD_TABLE", atau "CHAT" (jika hanya ngobrol santai atau nanya data).
Output wajib dalam bentuk JSON: {"intent": "..."}`;

    const extractorSystem = `Kamu adalah Agen 2 (Entity Extractor). Tugasmu MURNI membalas dengan JSON saja.
Ekstrak entitas (data) penting dari chat user. Jika data tidak disebutkan, isi dengan null.
Output Format JSON:
{
  "nama_menu": "string/null",
  "harga": "angka/null (contoh: 50000)",
  "status": "string/null",
  "nama_pelanggan": "string/null",
  "alasan": "string/null"
}`;

    console.log("\n🚀 [SWARM PIPELINE START] Mengeksekusi Tahap 1: Ekstraksi Paralel...");

    // Jalankan 2 otak AI berbarengan (Parallel Processing) biar cepet!
    const [intentJsonStr, entityJsonStr] = await Promise.all([
        runSwarmAgent("Gatekeeper", gatekeeperSystem, `Chat User Terbaru:\n${messageText}`, true),
        runSwarmAgent("Extractor", extractorSystem, `Chat User Terbaru:\n${messageText}`, true)
    ]);

    let intent = "CHAT";
    let entities: any = {};

    try {
        const parsedIntent = JSON.parse(intentJsonStr);
        if (parsedIntent.intent) intent = parsedIntent.intent;
    } catch (e) { console.error("⚠️ Gatekeeper gagal JSON"); }

    try {
        entities = JSON.parse(entityJsonStr);
    } catch (e) { console.error("⚠️ Extractor gagal JSON"); }

    console.log(`🧠 [SWARM KESIMPULAN] Intent: ${intent} | Entities:`, entities);


    // ==========================================
    // ⚙️ TAHAP 2: NATIVE NODE.JS EXECUTION (Sang Eksekutor)
    // ==========================================
    let executionResult = "Sistem gagal memproses aksi.";
    let isAction = true;

    if (intent === "CHAT") {
        isAction = false;
        executionResult = "User HANYA ingin mengobrol atau bertanya data kantin. Jawab pertanyaannya dengan mengambil data dari [KONTEKS KANTIN].";
    } else if (intent === "UBAH_HARGA" && entities.nama_menu && entities.harga) {
        const res = await ubahHargaMenuAI(parseInt(contextForAI.id_merchant), entities.nama_menu, Number(entities.harga));
        executionResult = `Hasil eksekusi [UBAH HARGA]: ${res.message}`;
    } else if (intent === "TAMBAH_MENU" && entities.nama_menu && entities.harga) {
        const res = await tambahMenuKantinAI(parseInt(contextForAI.id_merchant), entities.nama_menu, Number(entities.harga));
        executionResult = `Hasil eksekusi [TAMBAH MENU]: ${res.message}`;
    } else if (intent === "HAPUS_MENU" && entities.nama_menu) {
        const res = await hapusMenuAI(parseInt(contextForAI.id_merchant), entities.nama_menu);
        executionResult = `Hasil eksekusi [HAPUS MENU]: ${res.message}`;
    } else if (intent === "UBAH_STATUS_MENU" && entities.nama_menu && entities.status) {
        const res = await ubahStatusMenuAI(parseInt(contextForAI.id_merchant), entities.nama_menu, entities.status);
        executionResult = `Hasil eksekusi [UBAH STATUS MENU]: ${res.message}`;
    } else if (intent === "UBAH_STATUS_KANTIN") {
        const statusStr = messageText.toLowerCase().includes('tutup') ? 'Tutup' : 'Buka';
        const res = await updateMerchantStatus(parseInt(contextForAI.id_merchant), statusStr);
        executionResult = `Hasil eksekusi [UBAH STATUS KANTIN]: ${res ? 'Berhasil' : 'Gagal'} mengubah status kantin menjadi ${statusStr}`;
    } else if (intent === "SELESAIKAN_PESANAN" && entities.nama_pelanggan) {
        const res = await selesaikanPesananAI(parseInt(contextForAI.id_merchant), entities.nama_pelanggan);
        executionResult = `Hasil eksekusi [SELESAIKAN PESANAN]: ${res.message}`;
    } else if (intent === "BATALKAN_PESANAN" && entities.nama_pelanggan) {
        const alasan = entities.alasan || 'Dibatalkan admin secara paksa';
        const res = await batalkanPesananAI(parseInt(contextForAI.id_merchant), entities.nama_pelanggan, alasan);
        executionResult = `Hasil eksekusi [BATALKAN PESANAN]: ${res.message}`;
    } else {
        isAction = false;
        executionResult = "User mencoba mengubah sesuatu tapi parameternya (seperti nama menu atau harga) KOSONG atau kurang lengkap. Tolong beritahu user untuk melengkapi informasinya.";
    }


    // ==========================================
    // 🗣️ TAHAP 3: THE BARISTA (Drafting Agent)
    // ==========================================
    const drafterSystem = `Kamu adalah Agen 3 (Sang Barista). 
Berikut adalah DATA REAL-TIME KANTIN SAAT INI (Konteks):
\`\`\`json
${JSON.stringify(contextForAI)}
\`\`\`

Tugasmu:
1. Bacalah pesan User dan bacalah [HASIL EKSEKUSI SISTEM SERVER].
2. Buatkan laporan atau jawaban chatbot berformat narasi paragraf untuk user. 
3. Jika [HASIL EKSEKUSI] berisi error, beri tahu user. Jika sukses, sampaikan dengan gembira.
4. Jika User bertanya tentang menu/antrean, silakan baca JSON di atas dan laporkan informasinya.
5. SANGAT PENTING: DILARANG membahas teknis seperti "JSON", "Node.js", "Intent", "Parameter". Berbicaralah seperti asisten toko nyata.`;

    console.log("🚀 [SWARM PIPELINE] Agen 3: Menulis Draft Balasan...");
    const draftContent = await runSwarmAgent("Barista", drafterSystem, `Riwayat Chat Singkat:\n${chatHistory}\n\nChat Terbaru User: "${messageText}"\n\n[HASIL EKSEKUSI SISTEM SERVER]:\n${executionResult}`, false);


    // ==========================================
    // ✨ TAHAP 4: THE QA & LOCALIZER (Final Polish Agent)
    // ==========================================
    // Opsional: Untuk menghemat uang dan waktu, jika draftnya sudah cukup bagus, kita bisa langsung return draftnya.
    // Tapi karena Boss minta ekstrim, kita teruskan ke Agen ke-4 untuk sentuhan ajaib ("Bro" Slang + Anti-Halusinasi Checker)
    const qaSystem = `Kamu adalah Agen 4 (QA & Localizer Editor).
Tugasmu mereview (memoles) teks draft chatbot di bawah ini agar sempurna untuk audiens anak muda Indonesia.
ATURAN KERAS:
1. Ubah nadanya jadi SANGAT santuy, gaul, asyik, proaktif (pake sapaan bosku, bro, mantap, dll).
2. Kasih emoji keren biar gak monoton (🔥, 🚀, ☕, dll).
3. HAPUS SEMUA kata-kata sintaks error seperti <TOOLCALL> atau format JSON berformat aneh jika ada di draft. Bersihkan 100%.
4. DILARANG merevisi konteks/berita dari draft. Jika draftnya bilang sukses, tetap sukses. Cukup perbaiki diksi.
5. MURNI kembalikan hasil revisi teksnya saja, TANPA Basa-basi seperti "Berikut hasil revisinya:".`;

    console.log("🚀 [SWARM PIPELINE] Agen 4: QA & Polishing...");
    const finalPolishedText = await runSwarmAgent("QA Editor", qaSystem, `Draft Kasar Asli:\n${draftContent}`, false);


    // ==========================================
    // 💾 TAHAP 5: SIMPAN MEMORI & KEMBALIKAN
    // ==========================================
    pastMessages.push({ role: 'user', content: messageText });
    pastMessages.push({ role: 'assistant', content: finalPolishedText });

    // Batasi memori max 4 pesan terakhir biar tidak berat
    if (pastMessages.length > 4) {
        pastMessages = pastMessages.slice(pastMessages.length - 4);
    }
    chatMemories.set(chatId, pastMessages);

    return {
        text: finalPolishedText,
        debug: {
            pipeline: "4-Agent Swarm (Gatekeeper -> Extractor -> Node Coordinator -> Barista -> QA)",
            intent,
            entities,
            executionResult
        }
    };
}
