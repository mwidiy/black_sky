export async function sendWhatsAppMessage(to: string, message: string) {
  // Saat ini kita mock dulu menggunakan console.log
  // Nanti di Tahap pengiriman pesan, ini akan diganti dengan fetch ke Graph API Meta
  console.log(`\n==================================`);
  console.log(`📤 MENGIRIM BALASAN (Via Telegram)`);
  console.log(`Kepada (Chat ID): ${to}`);
  console.log(`Pesan  : ${message}`);
  console.log(`==================================\n`);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN belum diset di .env.local!");
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: to,
        text: message,
      }),
    });

    if (response.ok) {
      console.log("✅ Pesan berhasil dikirim ke Telegram dengan status 200");
    } else {
      console.error("❌ Telegram API error:", await response.text());
    }
  } catch (error) {
    console.error("❌ Terjadi kesalahan jaringan saat menghubungi Telegram:", error);
  }
}
