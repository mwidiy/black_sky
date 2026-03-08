import { createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// 1. Kumpulkan semua key dari .env yang bernama 'api1', 'api2', dst.
const primaryKeys: string[] = [];
for (const key in process.env) {
    if (key.startsWith('api') && process.env[key]) {
        primaryKeys.push(process.env[key] as string);
    }
}

// 2. Global Index Tracker untuk True Round-Robin
let currentIndex = 0;

export function getNextKeyConfiguration() {
    if (primaryKeys.length === 0) {
        return null;
    }

    const key = primaryKeys[currentIndex];
    const keyName = `api${currentIndex + 1}`; // Estimasi visual saja

    // Majukan index, jika sudah lewat batas balik ke 0 (Loop)
    currentIndex = (currentIndex + 1) % primaryKeys.length;

    // Tentukan Model Provider (OpenRouter vs Google Native)
    if (key.startsWith('sk-or-')) {
        const openrouter = createOpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: key,
        });
        return {
            name: keyName,
            key: key,
            model: openrouter.chat('openrouter/free')
        };
    } else {
        // Asumsi jika bukan OpenRouter berarti Google API Key murni
        // (Bisa disesuaikan jika ada provider lain)
        return {
            name: keyName,
            key: key,
            model: google('gemini-2.5-flash')
            // Catatan: ai-sdk idealnya butuh environment apiKey spesifik saat init, 
            // tapi kita bisa andalkan behavior default yang baca dari construct internal.
            // Google Generative AI Provider gak gampang trima key dinamis di argumen model, 
            // makanya fallback terakhir kita set paten aja nanti di generateText.
        };
    }
}

export function getTotalKeys() {
    return primaryKeys.length;
}

export function getFallbackModel() {
    // Dipanggil hanya jika semua key OpenRouter habis/gagal
    return google('gemini-2.5-flash');
}
