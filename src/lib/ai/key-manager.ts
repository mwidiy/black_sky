import { createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import fs from 'fs';
import path from 'path';

// 1. Kumpulkan semua key dari .env yang bernama 'api1', 'api2', dst. berurutan
const primaryKeys: { name: string, key: string }[] = [];
for (let i = 1; i <= 100; i++) {
    const envVarName = `api${i}`;
    if (process.env[envVarName]) {
        primaryKeys.push({
            name: envVarName,
            key: process.env[envVarName] as string
        });
    }
}

// 2. Setup Persistent State via FileSystem
const STATE_FILE = path.join(process.cwd(), '.key_state.json');

function getCurrentIndex(): number {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            if (typeof parsed.currentIndex === 'number') {
                return parsed.currentIndex;
            }
        }
    } catch (e) {
        console.error("⚠️ Gagal membaca .key_state.json, menggunakan index 0", e);
    }
    return 0;
}

function saveCurrentIndex(index: number) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ currentIndex: index }), 'utf-8');
    } catch (e) {
        console.error("⚠️ Gagal menyimpan .key_state.json", e);
    }
}

export function getNextKeyConfiguration() {
    if (primaryKeys.length === 0) {
        return null;
    }

    let currentIndex = getCurrentIndex();

    // Safety check: jika jumlah key di .env berkurang/dihapus, kembalikan index ke 0
    if (currentIndex >= primaryKeys.length) {
        currentIndex = 0;
    }

    const currentItem = primaryKeys[currentIndex];
    const keyName = currentItem.name;
    const key = currentItem.key;

    // Majukan index, jika sudah lewat batas balik ke 0 (Loop)
    const nextIndex = (currentIndex + 1) % primaryKeys.length;
    saveCurrentIndex(nextIndex);

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
