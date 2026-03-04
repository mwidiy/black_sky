import { NextResponse } from "next/server";
import { getAllMerchants, saveAllMerchants } from "@/lib/db/mock";

// GET: Ambil seluruh data simulasi DB
export async function GET() {
    try {
        const merchants = await getAllMerchants();
        return NextResponse.json(merchants, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch DB" }, { status: 500 });
    }
}

// POST: Digunakan untuk menimpa state DB secara full dari Dashboard UI
export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Asumsi body adalah array of MerchantData
        if (!Array.isArray(body)) {
            return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
        }

        await saveAllMerchants(body);

        return NextResponse.json({ success: true, message: "Database Simulator Updated" }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update DB" }, { status: 500 });
    }
}
