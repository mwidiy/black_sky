const { PrismaClient } = require('@prisma/client');
const http = require('http');
const prisma = new PrismaClient();

async function main() {
    // Cari store pertama
    const store = await prisma.store.findFirst();
    let chatId = store?.telegramChatId;

    if (!chatId) {
        // Kalo kosong, kita update sementara buat testing
        chatId = "TEST_CHAT_123";
        await prisma.store.update({
            where: { id: store.id },
            data: { telegramChatId: chatId }
        });
        console.log("Diupdate chatId sementara:", chatId);
    } else {
        console.log("ChatId asli ditemukan:", chatId);
    }

    const data = JSON.stringify({
        message: {
            chat: { id: chatId },
            text: "Coba balas pesan ini pakai AI"
        }
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/webhook/telegram',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, res => {
        console.log(`statusCode: ${res.statusCode}`);
        res.on('data', d => {
            process.stdout.write(d);
        });
    });

    req.on('error', error => {
        console.error("HTTP Error:", error);
    });

    req.write(data);
    req.end();
}

main().catch(console.error);
