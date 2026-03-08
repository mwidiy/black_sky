const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Seeding Mock Orders for Testing Dashboard...");

    const store = await prisma.store.findFirst();
    const table = await prisma.table.findFirst();

    if (!store || !table) {
        console.error("Missing Store or Table for seeding orders.");
        return;
    }

    let product = await prisma.product.findFirst();
    if (!product) {
        console.log("No menu found! Creating a dummy product...");
        const category = await prisma.category.findFirst();
        product = await prisma.product.create({
            data: {
                name: "Nasi Goreng QuackXel",
                price: 25000,
                storeId: store.id,
                categoryId: category.id,
                isActive: true
            }
        });
    }

    // 1. Pending Order (Pesanan Masuk)
    await prisma.order.create({
        data: {
            transactionCode: `ORD-TEST-${Date.now()}`,
            customerName: "Budi Santoso",
            orderType: "Dine-in",
            status: "Pending",
            totalAmount: product.price * 2,
            paymentStatus: "Paid",
            storeId: store.id,
            tableId: table.id,
            items: {
                create: [
                    { productId: product.id, quantity: 2, priceSnapshot: product.price, note: "Pedas ya mas" }
                ]
            }
        }
    });

    // 2. Completed Order (Riwayat Hari Ini)
    await prisma.order.create({
        data: {
            transactionCode: `ORD-COMP-${Date.now()}`,
            customerName: "Andi Wijaya",
            orderType: "Takeaway",
            status: "Completed",
            totalAmount: product.price * 3,
            paymentStatus: "Paid",
            storeId: store.id,
            createdAt: new Date(), // Today
            items: {
                create: [
                    { productId: product.id, quantity: 3, priceSnapshot: product.price }
                ]
            }
        }
    });

    // 3. Cancelled Order Request (Pesanan Masuk - Minta Batal)
    await prisma.order.create({
        data: {
            transactionCode: `ORD-CANC-${Date.now()}`,
            customerName: "Siti Aisyah",
            orderType: "Dine-in",
            status: "Pending",
            cancellationStatus: "Requested",
            cancellationReason: "Salah pesan meja, mau ganti",
            totalAmount: product.price,
            paymentStatus: "Paid",
            storeId: store.id,
            tableId: table.id,
            items: {
                create: [
                    { productId: product.id, quantity: 1, priceSnapshot: product.price }
                ]
            }
        }
    });

    console.log("Mock Orders Created Successfully!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
