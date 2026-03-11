import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { updateMerchantStatus, selesaikanPesananAI, batalkanPesananAI, tambahMenuKantinAI, ubahHargaMenuAI, ubahStatusMenuAI, hapusMenuAI, crudTableAI } from '../db/prisma';
import { getNextKeyConfiguration, getTotalKeys, getFallbackModel } from './key-manager';

export type MerchantContext = any;

type CoreMessage = { role: 'user' | 'assistant' | 'system', content: string };
type ChatState = 'IDLE' | 'MODE_AI' | 'MODE_MENU_DB' | 'MODE_PILIH_KATEGORI' | 'MODE_PILIH_MENU' | 'MODE_PILIH_LOKASI' | 'MODE_PILIH_PESANAN' | 'MODE_FORM';
type ChatSession = {
    state: ChatState;
    currentAction: string | null;
    tempData?: any;
    messages: CoreMessage[];
};

// Memory Map Global dengan State
const chatSessions = new Map<string, ChatSession>();

const MENU_UTAMA = `Halo bro! Gue QuackXel, Asisten Kantin lu 😎\nMau ngapain nih hari ini?\n\n*Balas angkanya aja ya:*\n1. 🤖 Ngobrol & Analisis Data Kantin (AI)\n2. ⚙️ Manajemen Database Kantin (Bot Kaku)`;

const MENU_AKSI = `Pilih menu action (Ketik angkanya saja):\n1. ➕ Tambah Menu Baru\n2. 💵 Ubah Harga Menu\n3. 🗑️ Hapus Menu\n4. 🛒 Buka / Tutup Kantin\n5. 📍 Tambah Lokasi Counter\n6. 🪑 Tambah Meja / QR Baru\n7. ✅ Selesaikan Pesanan\n8. 📁 Tambah Kategori Baru\n\n0. 🔙 Kembali ke Menu Utama`;

const FORM_TEMPLATES: Record<string, string> = {
    '1': "Menu Baru: \nHarga: ",
    '2': "Harga Baru: ",
    '3': "Hapus Menu: ",
    '4': "Status Kantin (Buka/Tutup): ",
    '5': "Lokasi Baru: ",
    '6': "Nomor Meja Baru: ",
    '7': "Nama Pelanggan: ",
    '8': "Kategori Baru: "
};

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
                // @ts-ignore
                maxTokens: requireJson ? 500 : 1500,
                // @ts-ignore
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
    let session = chatSessions.get(chatId) || { state: 'IDLE', currentAction: null, messages: [] };
    const chatHistory = session.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const msgLower = messageText.trim().toLowerCase();

    try {
        // GLOBAL CATCH: Mencegah user tersesat
        if (msgLower === '0' || msgLower === 'kembali' || msgLower === 'menu' || msgLower === 'batal') {
            session.state = 'IDLE';
            session.currentAction = null;
            chatSessions.set(chatId, session);
            return { text: MENU_UTAMA, debug: { intent: "BACK_TO_MENU" } };
        }

        // ==========================================
        // STATE 1: IDLE (Memilih Mode)
        // ==========================================
        if (session.state === 'IDLE') {
            if (messageText.trim() === '1') {
                session.state = 'MODE_AI';
                chatSessions.set(chatId, session);
                return { text: "Siyapp! Lo sekarang masuk ke 🤖 MODE AI. Bebas nanya-nanya soal omset, menu laris, atau request insight ya!\n*(Ketik '0' kapan aja buat balik)*", debug: { mode: "AI" } };
            } else if (messageText.trim() === '2') {
                session.state = 'MODE_MENU_DB';
                chatSessions.set(chatId, session);
                return { text: MENU_AKSI, debug: { mode: "CRUD" } };
            } else {
                return { text: MENU_UTAMA, debug: { mode: "IDLE_PROMPT" } };
            }
        }

        // ==========================================
        // STATE 2: MODE_AI (Pure AI Chat)
        // ==========================================
        else if (session.state === 'MODE_AI') {
            const soloSystem = `Kamu adalah Kasir AI ramah bernama QuackXel.
Konteks Data Kantin: \n\`\`\`json\n${JSON.stringify(contextForAI)}\n\`\`\`
Jawab pertanyaan secara kasual, santai, dan menganalisa konteks kantin di atas. Dilarang halusinasi info yang tidak ada di Konteks.
Dilarang membahas hal teknis system. Format uang harus rapi.`;

            const reply = await runSwarmAgent("Solo Chat", soloSystem, `Riwayat:\n${chatHistory}\nUser: ${messageText}`, false);

            // Simpan Memori bertahap
            session.messages.push({ role: 'user', content: messageText }, { role: 'assistant', content: reply });
            if (session.messages.length > 6) session.messages = session.messages.slice(-6);
            chatSessions.set(chatId, session);

            return { text: reply, debug: { mode: "AI_REPLY" } };
        }

        // ==========================================
        // STATE 3: MODE_MENU_DB (Milih Aksi Kaku)
        // ==========================================
        else if (session.state === 'MODE_MENU_DB') {
            const pilihan = messageText.trim();
            const storeId = parseInt(contextForAI.id_merchant);

            if (pilihan === '1') {
                // Khusus Tambah Menu, TANYA KATEGORI DULU!
                const { prisma } = await import('../db/prisma');
                const categories = await prisma.category.findMany({ where: { storeId } });
                
                let catList = categories.map((c: any) => `${c.id}. ${c.name}`).join('\n');
                if (catList === '') catList = "(Belum ada kategori lu bro)";

                session.state = 'MODE_PILIH_KATEGORI';
                session.currentAction = '1';
                chatSessions.set(chatId, session);

                return { 
                    text: `Menu barunya mau dimasukin ke Kategori apa nih bro?\n\nPilih angkanya:\n${catList}\n\n*Atau BALAS KETIK NAMA KATEGORI BARU* jika belum ada di list (Contoh: Kuah / Minuman Dingin)\n\n*(Ketik 0 buat batal)*`, 
                    debug: { intent: "CHOOSE_CATEGORY" }
                };
            } 
            else if (pilihan === '2' || pilihan === '3') {
                const { prisma } = await import('../db/prisma');
                const menus = await prisma.product.findMany({ where: { storeId }, select: { id: true, name: true, price: true } });
                let menuList = menus.map((m: any) => `${m.id}. ${m.name} (Rp${m.price})`).join('\n');
                if (menuList === '') menuList = "(Belum ada menu bro)";

                session.state = 'MODE_PILIH_MENU';
                session.currentAction = pilihan;
                chatSessions.set(chatId, session);

                let msg = pilihan === '2' ? "Menu mana yang mau diubah harganya?" : "Menu mana yang mau DIHAPUS PERMANEN?";
                return { 
                    text: `${msg}\n\nPilih ID angkanya:\n${menuList}\n\n*(Ketik 0 buat batal)*`, 
                    debug: { intent: "CHOOSE_MENU" }
                };
            }
            else if (pilihan === '6') {
                const { prisma } = await import('../db/prisma');
                const locs = await prisma.location.findMany({ where: { storeId } });
                let locList = locs.map((l: any) => `${l.id}. ${l.name}`).join('\n');
                if (locList === '') locList = "(Belum ada lokasi)";

                session.state = 'MODE_PILIH_LOKASI';
                session.currentAction = '6';
                chatSessions.set(chatId, session);

                return { 
                    text: `Meja barunya ditaruh di area mana bro?\n\nPilih angkanya:\n${locList}\n\n*Atau ketik nama area baru* (Contoh: VIP / Lantai 2)\n\n*(Ketik 0 buat batal)*`, 
                    debug: { intent: "CHOOSE_LOCATION" }
                };
            }
            else if (pilihan === '7') {
                const { prisma } = await import('../db/prisma');
                const orders = await prisma.order.findMany({ 
                    where: { storeId, status: { in: ['Pending', 'Processing'] } },
                    orderBy: { createdAt: 'desc' }
                });
                let orderList = orders.map((o: any) => `${o.id}. ORD-${o.transactionCode.split('-').pop()} (${o.customerName}) - Rp${o.totalAmount}`).join('\n');
                
                if (orders.length === 0) {
                    session.state = 'MODE_MENU_DB';
                    session.currentAction = null;
                    chatSessions.set(chatId, session);
                    return { text: `✅ Gak ada orderan yang antre bro!\n\nLanjut menu admin? Ketik angkanya lagi:\n${MENU_AKSI}`, debug: { intent: "NO_ORDERS" } };
                }

                session.state = 'MODE_PILIH_PESANAN';
                session.currentAction = '7';
                chatSessions.set(chatId, session);

                return { 
                    text: `Orderan mana yang udah kelar bro?\n\nBalas pake ID angkanya:\n${orderList}\n\n*(Ketik 0 buat batal)*`, 
                    debug: { intent: "CHOOSE_ORDER" }
                };
            }
            else if (FORM_TEMPLATES[pilihan]) {
                session.state = 'MODE_FORM';
                session.currentAction = pilihan;
                chatSessions.set(chatId, session);

                return { 
                    text: `Siap bos! Biar mesin bisa baca otomatis tanpa AI, copas form ini terus isi nilainya setelah tanda titik dua (:) ya..\n\n${FORM_TEMPLATES[pilihan]}\n\n(Note: Pastikan harga itu Angka tok. Ketik 0 buat batal)`, 
                    debug: { intent: "SEND_FORM_TEMPLATE" }
                };
            } else {
                return { text: `Pilihan gak ada bro 😂\n\n${MENU_AKSI}`, debug: { intent: "INVALID_MENU" }};
            }
        }

        // ==========================================
        // STATE 3.5: MODE_PILIH_KATEGORI 
        // ==========================================
        else if (session.state === 'MODE_PILIH_KATEGORI') {
            session.tempData = { kategori: messageText.trim() };
            session.state = 'MODE_FORM';
            chatSessions.set(chatId, session);

            return { 
                text: `Siap Kategori *${messageText.trim()}*!\n\nSekarang copas form ini terus isi angkanya ya (Setelah tanda ':')..\n\n${FORM_TEMPLATES['1']}\n\n(Ketik 0 buat batal)`, 
                debug: { intent: "SEND_FORM_TEMPLATE_MENU" }
            };
        }

        // ==========================================
        // STATE 3.6: MODE_PILIH_MENU
        // ==========================================
        else if (session.state === 'MODE_PILIH_MENU') {
            const menuId = messageText.trim();
            session.tempData = { ...session.tempData, menuId };
            
            if (session.currentAction === '2') {
                session.state = 'MODE_FORM';
                chatSessions.set(chatId, session);
                return { 
                    text: `Siap! Sekarang mau *UBAH JADI HARGA BERAPA* bro? (Langsung ketik angkanya kelipatan ribuan, Misal: 15000)\n\n(Ketik 0 buat batal)`, 
                    debug: { intent: "SEND_FORM_TEMPLATE_PRICE" }
                };
            } 
            else if (session.currentAction === '3') {
                // Eksekusi Hapus Langsung!
                let executionResult = (await hapusMenuAI(parseInt(contextForAI.id_merchant), menuId)).message;
                session.state = 'MODE_MENU_DB';
                session.currentAction = null;
                chatSessions.set(chatId, session);
                
                const isError = executionResult.toLowerCase().includes('gagal');
                const hdr = isError ? '❌ ERROR DATABASE (Bot)' : '✅ REPORT DATABASE (Bot)';
                return { text: `${hdr}\n----------------------\n${executionResult}\n\nLanjut menu admin? Ketik angkanya lagi:\n${MENU_AKSI}`, debug: { intent: "DELETE_MENU_EXECUTED" } };
            }
        }

        // ==========================================
        // STATE 3.7: MODE_PILIH_LOKASI
        // ==========================================
        else if (session.state === 'MODE_PILIH_LOKASI') {
            session.tempData = { ...session.tempData, locationId: messageText.trim() };
            session.state = 'MODE_FORM';
            chatSessions.set(chatId, session);
            return { 
                text: `Siap Area *${messageText.trim()}*!\n\nSekarang MEJANYA MAU DIKASIH NAMA APA bro? (Ketik aja namanya misal: Meja 12)\n\n(Ketik 0 buat batal)`, 
                debug: { intent: "SEND_FORM_TEMPLATE_TABLE" }
            };
        }

        // ==========================================
        // STATE 3.8: MODE_PILIH_PESANAN
        // ==========================================
        else if (session.state === 'MODE_PILIH_PESANAN') {
            const orderId = messageText.trim();
            let executionResult = (await selesaikanPesananAI(parseInt(contextForAI.id_merchant), orderId)).message;
            
            session.state = 'MODE_MENU_DB';
            session.currentAction = null;
            chatSessions.set(chatId, session);
            
            const isError = executionResult.toLowerCase().includes('gagal');
            const hdr = isError ? '❌ ERROR DATABASE (Bot)' : '✅ REPORT DATABASE (Bot)';
            return { text: `${hdr}\n----------------------\n${executionResult}\n\nLanjut menu admin? Ketik angkanya lagi:\n${MENU_AKSI}`, debug: { intent: "ORDER_COMPLETED" } };
        }

        // ==========================================
        // STATE 4: MODE_FORM (Eksekusi 100% KAKU)
        // ==========================================
        else if (session.state === 'MODE_FORM') {
            const action = session.currentAction;
            let executionResult = "Gagal memproses form.";

            // MANUAL FORM EXTRACTION VIA STRING MANIPULATION (NO AI HALUSINASI)
            const lines = messageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            const extractValue = (keyword: string) => {
                const line = lines.find(l => l.toLowerCase().includes(keyword.toLowerCase()));
                if (!line) return null;
                const parts = line.split(':');
                if (parts.length < 2) return null;
                return parts.slice(1).join(':').trim() || null;
            };

            const storeId = parseInt(contextForAI.id_merchant);

            if (action === '1') {
                const nama = extractValue("Menu Baru") || extractValue("Nama Menu");
                const hargaRaw = extractValue("Harga");
                const harga = hargaRaw ? parseInt(hargaRaw.replace(/\D/g, '')) : 0;
                const namaKategori = session.tempData?.kategori || 'Umum';
                
                executionResult = (await tambahMenuKantinAI(storeId, nama || '', harga, namaKategori)).message;
            }
            else if (action === '2') {
                const hargaRaw = extractValue("Harga Baru") || extractValue("Harga") || messageText;
                const harga = hargaRaw ? parseInt(hargaRaw.replace(/\D/g, '')) : 0;
                const menuId = session.tempData?.menuId || '';
                executionResult = (await ubahHargaMenuAI(storeId, menuId, harga)).message;
            }
            else if (action === '4') {
                const stat = extractValue("Status") || extractValue("Buka") || messageText;
                const statusStr = stat?.toLowerCase().includes('tutup') ? 'Tutup' : 'Buka';
                const isSukses = await updateMerchantStatus(storeId, statusStr);
                executionResult = isSukses ? `Status kantin berhasil diubah menjadi ${statusStr}!` : `Gagal ubah status`;
            }
            else if (action === '5') {
                const { tambahLokasiAI } = await import('../db/prisma');
                const nama = extractValue("Lokasi") || messageText;
                executionResult = (await tambahLokasiAI(storeId, nama || '')).message;
            }
            else if (action === '6') {
                const { tambahMejaAI } = await import('../db/prisma');
                const nama = extractValue("Nomor") || extractValue("Nama/Nomor") || extractValue("Meja") || messageText;
                const locationId = session.tempData?.locationId || '';
                executionResult = (await tambahMejaAI(storeId, nama || '', locationId)).message;
            }
            else if (action === '7') {
                const nama = extractValue("Nama Pelanggan") || extractValue("Nama Pelanggan di antrean");
                executionResult = (await selesaikanPesananAI(storeId, nama || '')).message;
            }
            else if (action === '8') {
                const { tambahKategoriAI } = await import('../db/prisma');
                const nama = extractValue("Kategori") || messageText;
                executionResult = (await tambahKategoriAI(storeId, nama || '')).message;
            }

            // Setelah sukses eksekusi kaku, balik ke Menu Database
            session.state = 'MODE_MENU_DB';
            session.currentAction = null;
            chatSessions.set(chatId, session);

            const isError = executionResult.toLowerCase().includes('gagal');
            const hdr = isError ? '❌ ERROR DATABASE (Bot)' : '✅ REPORT DATABASE (Bot)';

            return {
                text: `${hdr}\n----------------------\n${executionResult}\n\nLanjut menu admin? Ketik angkanya lagi:\n${MENU_AKSI}`,
                debug: { intent: "EXECUTED_FORM_RAW", executionResult }
            };
        }

    } catch (e: any) {
        session.state = 'IDLE';
        session.currentAction = null;
        chatSessions.set(chatId, session);
        return { text: `Terdapat error sistem: ${e.message}\n\n` + MENU_UTAMA, debug: {} };
    }
}
