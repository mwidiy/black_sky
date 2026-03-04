const https = require('https');
const fs = require('fs');

// Baca token langsung dari file .env.local tanpa library eksternal
let TOKEN = process.env.TELEGRAM_BOT_TOKEN;
try {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const match = envFile.match(/TELEGRAM_BOT_TOKEN=["']?([^"'\n]+)["']?/);
    if (match) {
        TOKEN = match[1].trim();
    }
} catch (e) {
    // Abaikan jika gagal baca file
}
const URL_NGROK = process.argv[2]; // We will pass this from command line

if (!TOKEN) {
    console.error("❌ Error: TELEGRAM_BOT_TOKEN belum diset di .env.local");
    process.exit(1);
}

if (!URL_NGROK) {
    console.error("❌ Error: Harap masukkan URL Ngrok sebagai argumen.");
    console.error("💡 Contoh: node register-telegram.js https://abcd.ngrok-free.app");
    process.exit(1);
}

const webhookUrl = `${URL_NGROK}/api/webhook/telegram`;
const apiUrl = `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${webhookUrl}`;

console.log(`⏳ Sedang mendaftarkan webhook ke Telegram...`);
console.log(`🔗 URL Webhook: ${webhookUrl}\n`);

https.get(apiUrl, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        try {
            const parsedData = JSON.parse(rawData);
            if (parsedData.ok) {
                console.log("✅ BERHASIL!");
                console.log("Telegram sekarang akan mengirim chat ke mesin lokalmu.");
                console.log("Ayo chat bot mu di aplikasi Telegram sekarang!");
            } else {
                console.error("❌ GAGAL mendaftarkan webhook.");
                console.error("Respons Telegram:", parsedData.description);
            }
        } catch (e) {
            console.error("❌ Error membaca response:", e.message);
        }
    });
}).on('error', (e) => {
    console.error(`❌ Terjadi kesalahan jaringan: ${e.message}`);
});
