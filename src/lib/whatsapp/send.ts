export async function sendWhatsAppMessage(to: string, message: string) {
    // Saat ini kita mock dulu menggunakan console.log
    // Nanti di Tahap pengiriman pesan, ini akan diganti dengan fetch ke Graph API Meta
    console.log(`\n==================================`);
    console.log(`📤 MENGIRIM BALASAN WHATSAPP`);
    console.log(`Kepada : ${to}`);
    console.log(`Pesan  : ${message}`);
    console.log(`==================================\n`);

    // Contoh implementasi asli nantinya (jangan diuncomment dulu kalau belum siap):
    /*
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  
    await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message },
      }),
    });
    */
}
