import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET: Ambil data Full Graph Store dari PostgreSQL Termasuk Transaksi
export async function GET() {
    try {
        const stores = await prisma.store.findMany({
            include: {
                categories: true,
                products: true,
                locations: {
                    include: { tables: true }
                },
                banners: true,
                orders: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        table: true,
                        items: { include: { product: true } }
                    }
                }
            }
        });

        // Kembalikan struktur asli Prisma ke Frontend Admin
        return NextResponse.json(stores, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to fetch full store graph" }, { status: 500 });
    }
}

// POST: Full Sync dari Dashboard
// Kita asumsikan payload berisi array `stores`, dimana kita hanya proses store[0] untuk MVP.
export async function POST(req: Request) {
    try {
        const stores = await req.json();

        if (!Array.isArray(stores) || stores.length === 0) {
            return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
        }

        const m = stores[0];
        const storeId = parseInt(m.id);

        if (isNaN(storeId)) {
            return NextResponse.json({ error: "Invalid Store ID" }, { status: 400 });
        }

        // 1. Update Profile Store
        await prisma.store.update({
            where: { id: storeId },
            data: {
                name: m.name,
                whatsappNumber: m.whatsappNumber,
                isOpen: m.isOpen
            }
        });

        // 2. Sync Banners
        if (m.banners) {
            // Kita bisa cek mana banner yang dihapus (deleted on UI)
            const incomingBannerIds = m.banners.filter((b: any) => typeof b.id === 'number').map((b: any) => b.id);
            await prisma.banner.deleteMany({
                where: { storeId: storeId, NOT: { id: { in: incomingBannerIds } } }
            });

            for (const b of m.banners) {
                if (typeof b.id === 'number') {
                    await prisma.banner.update({ where: { id: b.id }, data: { title: b.title, subtitle: b.subtitle, image: b.image, isActive: b.isActive } });
                } else {
                    await prisma.banner.create({ data: { title: b.title, subtitle: b.subtitle, image: b.image || '', isActive: b.isActive, storeId } });
                }
            }
        }

        // 3. Sync Categories
        if (m.categories) {
            const incomingCategoryIds = m.categories.filter((c: any) => typeof c.id === 'number').map((c: any) => c.id);
            // Hapus kategori lama jika gak ada di payload
            await prisma.category.deleteMany({
                where: { storeId: storeId, NOT: { id: { in: incomingCategoryIds } } }
            });

            for (const c of m.categories) {
                if (typeof c.id === 'number') {
                    await prisma.category.update({ where: { id: c.id }, data: { name: c.name } });
                } else {
                    await prisma.category.create({ data: { name: c.name, storeId } });
                }
            }
        }

        // 4. Sync Products (Menu)
        if (m.products) {
            const incomingProductIds = m.products.filter((p: any) => typeof p.id === 'number').map((p: any) => p.id);
            await prisma.product.deleteMany({
                where: { storeId: storeId, NOT: { id: { in: incomingProductIds } } }
            });

            for (const p of m.products) {
                if (typeof p.id === 'number') {
                    // Update Product
                    await prisma.product.update({
                        where: { id: p.id },
                        data: { name: p.name, price: p.price, isActive: p.isActive, categoryId: p.categoryId }
                    });
                } else {
                    // Cek jika kategori valid saat create product
                    if (p.categoryId && typeof p.categoryId === 'number') {
                        await prisma.product.create({
                            data: { name: p.name, price: p.price, isActive: p.isActive !== false, categoryId: p.categoryId, storeId }
                        });
                    }
                }
            }
        }

        // 5. Sync Locations & Tables
        if (m.locations) {
            const incomingLocationIds = m.locations.filter((loc: any) => typeof loc.id === 'number').map((loc: any) => loc.id);
            await prisma.location.deleteMany({
                where: { storeId: storeId, NOT: { id: { in: incomingLocationIds } } }
            });

            for (const loc of m.locations) {
                let locationId = loc.id;

                // Create Lokasi baru jika string (e.g. 'loc_1234')
                if (typeof loc.id !== 'number') {
                    const newLocation = await prisma.location.create({ data: { name: loc.name, storeId } });
                    locationId = newLocation.id;
                } else {
                    await prisma.location.update({ where: { id: locationId }, data: { name: loc.name } });
                }

                // Sync Tables per location
                if (loc.tables) {
                    const incomingTableIds = loc.tables.filter((t: any) => typeof t.id === 'number').map((t: any) => t.id);
                    await prisma.table.deleteMany({
                        where: { locationId: locationId, NOT: { id: { in: incomingTableIds } } }
                    });

                    for (const t of loc.tables) {
                        if (typeof t.id === 'number') {
                            await prisma.table.update({ where: { id: t.id }, data: { name: t.name, isActive: t.isActive, locationId: locationId } });
                        } else {
                            await prisma.table.create({ data: { name: t.name, qrCode: t.qrCode || `QR-${Date.now()}`, locationId: locationId, isActive: t.isActive !== false } });
                        }
                    }
                }
            }
        }

        // 6. Update Orders (Hanya Status Saja)
        if (m.orders) {
            for (const order of m.orders) {
                if (order.id && typeof order.id === 'number') {
                    await prisma.order.update({
                        where: { id: order.id },
                        data: {
                            status: order.status,
                            cancellationStatus: order.cancellationStatus,
                            cancellationReason: order.cancellationReason
                        }
                    });
                }
            }
        }

        return NextResponse.json({ success: true, message: "Full Graph Synced with Deletions" }, { status: 200 });
    } catch (error) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: "Failed to sync full graph DB" }, { status: 500 });
    }
}
