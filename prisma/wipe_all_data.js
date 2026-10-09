const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function wipeDatabase() {
  console.log('🗑️  Starting complete database cleanup (preserving primary Admin user)...');

  try {
    // 1. Delete Order-related items in order of foreign key dependency
    const deletedOrderItems = await prisma.orderItem.deleteMany({});
    console.log(`✅ Deleted ${deletedOrderItems.count} OrderItems`);

    const deletedHistory = await prisma.orderStatusHistory.deleteMany({});
    console.log(`✅ Deleted ${deletedHistory.count} OrderStatusHistory entries`);

    const deletedOrders = await prisma.order.deleteMany({});
    console.log(`✅ Deleted ${deletedOrders.count} Orders`);

    // 2. Delete Customer-related items
    const deletedCustomerNotes = await prisma.customerNote.deleteMany({});
    console.log(`✅ Deleted ${deletedCustomerNotes.count} CustomerNotes`);

    const deletedCustomers = await prisma.customer.deleteMany({});
    console.log(`✅ Deleted ${deletedCustomers.count} Customers`);

    // 3. Delete Product-related items
    const deletedAudits = await prisma.inventoryAudit.deleteMany({});
    console.log(`✅ Deleted ${deletedAudits.count} InventoryAudits`);

    const deletedProducts = await prisma.product.deleteMany({});
    console.log(`✅ Deleted ${deletedProducts.count} Products`);

    const deletedCategories = await prisma.category.deleteMany({});
    console.log(`✅ Deleted ${deletedCategories.count} Categories`);

    const deletedBrands = await prisma.brand.deleteMany({});
    console.log(`✅ Deleted ${deletedBrands.count} Brands`);

    // 4. Delete Marketing / Promo items
    const deletedCoupons = await prisma.coupon.deleteMany({});
    console.log(`✅ Deleted ${deletedCoupons.count} Coupons`);

    const deletedOffers = await prisma.offer.deleteMany({});
    console.log(`✅ Deleted ${deletedOffers.count} Offers`);

    // 5. Clean up sessions
    const deletedSessions = await prisma.session.deleteMany({});
    console.log(`✅ Cleared ${deletedSessions.count} Active Sessions`);

    // 6. Delete all users EXCEPT primary admin
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: {
          not: 'admin@krishnatextiles.com',
        },
      },
    });
    console.log(`✅ Deleted ${deletedUsers.count} non-admin Users`);

    // 7. Ensure primary admin user exists and is up to date
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@krishnatextiles.com' },
      update: {
        role: Role.ADMIN,
        passwordHash: adminPasswordHash,
        name: 'Krishna Jawli Stores Admin',
      },
      create: {
        email: 'admin@krishnatextiles.com',
        name: 'Krishna Jawli Stores Admin',
        passwordHash: adminPasswordHash,
        role: Role.ADMIN,
        phone: '+91 98765 43210',
      },
    });
    console.log(`👑 Preserved Admin User: ${admin.email} (Role: ${admin.role})`);

    // 8. Output summary of remaining counts
    const finalCounts = {
      users: await prisma.user.count(),
      sessions: await prisma.session.count(),
      categories: await prisma.category.count(),
      brands: await prisma.brand.count(),
      products: await prisma.product.count(),
      audits: await prisma.inventoryAudit.count(),
      customers: await prisma.customer.count(),
      customerNotes: await prisma.customerNote.count(),
      orders: await prisma.order.count(),
      orderItems: await prisma.orderItem.count(),
      orderStatusHistory: await prisma.orderStatusHistory.count(),
      coupons: await prisma.coupon.count(),
      offers: await prisma.offer.count(),
    };

    console.log('\n📊 DATABASE POST-CLEANUP STATUS:');
    console.log(JSON.stringify(finalCounts, null, 2));
    console.log('\n✨ Database is completely wiped clean and ready for real data!');

  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

wipeDatabase();
