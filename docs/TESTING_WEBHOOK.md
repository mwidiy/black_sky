# Panduan Testing Webhook WhatsApp (QuackXel)

Panduan step-by-step ini disiapkan untuk Anda agar dapat menguji Webhook penerima pesan QuackXel secara lokal. Kita menggunakan `ngrok` untuk mengekspos aplikasi ke internet dan `curl` untuk mengirimkan payload dummy (simulasi pesan meta).

---

## 🚀 Persiapan

1. **Jalankan aplikasi Next.js Anda (Terminal 1)**
   Buka terminal pertama di dalam root project dan jalankan mode pengembangan lokal:
   ```bash
   npm run dev
   ```
   *(Aplikasi akan berjalan di http://localhost:3000)*

2. **Ekspos port menggunakan ngrok (Terminal 2)**
   Buka terminal kedua dan ketik perintah berikut:
   ```bash
   ngrok http 3000
   ```
   *(Anda akan mendapatkan URL HTTPS seperti `https://1234-abcd.ngrok-free.app`. Simpan URL tersebut)*

URL Webhook Lengkap Anda:  
**`[URL_NGROK]/api/webhook/whatsapp`**

---

## 🧪 1. Tes Verifikasi GET (Simulasi Setup Meta)

Sebelum API Meta mengirimkan pesan, mereka akan melakukan "Challenge" via GET Request untuk memastikan Endpoint Anda benar dan token sesuai. 

Pastikan Anda telah memiliki variabel lingkungan `WHATSAPP_VERIFY_TOKEN=namatokenmu` di file `.env`. Untuk mensimulasikannya, gunakan perintah berikut di terminal (Anda dapat menggunakan url ngrok atau localhost):

```bash
curl -X GET "http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=ISI_TOKEN_VERIFIKASI_ANDA&hub.challenge=1122334455"
```
*(Ganti `ISI_TOKEN_VERIFIKASI_ANDA` dengan nilai yang sama dari `process.env.WHATSAPP_VERIFY_TOKEN` anda)*

**Ekspektasi Hasil:**  
Response di terminal pemanggil (curl) adalah: `1122334455`

---

## 📨 2. Tes POST Request (Simulasi Pesan Masuk)

Gunakan perintah `curl` berikut di terminal Anda untuk mengirimkan payload JSON statis yang strukturnya memakan format standar Documentasi resmi Meta API. 

### 💻 Untuk Pengguna Windows (PowerShell):
Salin dan paste blok ini dan tekan Enter:
```powershell
curl.exe -X POST http://localhost:3000/api/webhook/whatsapp `
  -H "Content-Type: application/json" `
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "1234567890",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "messages": [{
            "from": "6281234567890",
            "id": "wamid.HBgLNjI4MTIzNDU2Nz...==",
            "timestamp": "1700000000",
            "text": {
              "body": "Halo QuackXel, saya mau pesan meja untuk berdua!"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

### 🐧 Untuk Pengguna Mac / Linux / Git Bash:
```bash
curl -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "1234567890",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "messages": [{
            "from": "6281234567890",
            "id": "wamid.HBgLNjI4MTIzNDU2Nz...==",
            "timestamp": "1700000000",
            "text": {
              "body": "Halo QuackXel, saya mau pesan meja untuk berdua!"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Ekspektasi Hasil:**
1. **Di terminal ngrok / curl kamu** akan muncul respons `{"success":true}`
2. **Di terminal Next.js kamu** (Terminal 1) akan keluar log:
   ```
   ==============================
   📨 PESAN WHATSAPP MASUK (QuackXel)
   👤 Dari (Sender) : 6281234567890
   💬 Pesan         : Halo QuackXel, saya mau pesan meja untuk berdua!
   ==============================
   ```

Selamat! Sistem Webhook Anda sudah siap menerima data dari Meta.
