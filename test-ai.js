require('dotenv').config({ path: '.env' });
const { processMerchantMessage } = require('./src/lib/ai/generate');

async function test() {
    console.log("Testing processMerchantMessage directly...");

    // Create a fake context that matches what it expects
    const contextForAI = {
        id_merchant: "1",
        nama_kantin: "Kantin Tester",
        status_saat_ini: "Buka",
        info_tambahan: "(Test Environment)",
        menus: [
            { id: "1", nama: "Nasi Goreng", harga: 15000 }
        ],
        tables: []
    };

    try {
        const response = await processMerchantMessage(contextForAI, "Halo bro, kantin buka kan?");
        console.log("FINAL RESPONSE:", response);
    } catch (e) {
        console.error("CRASH CATCHED:", e);
    }
}

test();
