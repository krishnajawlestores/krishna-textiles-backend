import { PrismaClient, Role, CustomerType, OrderStatus, PaymentStatus, CouponType, OfferTarget } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Sample data must never overwrite live store records.
if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Demo seeding is disabled. Use an isolated development database with NODE_ENV=development and ALLOW_DEMO_SEED=true.');
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Admin Users (Only ADMIN role per requirements)
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@krishnatextiles.com' },
    update: {
      role: Role.ADMIN,
    },
    create: {
      email: 'admin@krishnatextiles.com',
      name: 'Rajesh Sharma (Admin)',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      phone: '+91 98765 43210',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    },
  });

  console.log(`✅ Admin User created: ${admin.email}`);

  // 2. Categories with Images
  const categoriesData = [
    {
      name: 'Pure Silk Sarees',
      slug: 'pure-silk-sarees',
      image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop',
      description: 'Handwoven Kanchipuram and Banarasi pure silk sarees with rich zari work.',
      sortOrder: 1,
    },
    {
      name: 'Cotton Sarees & Dhotis',
      slug: 'cotton-sarees-dhotis',
      image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=600&auto=format&fit=crop',
      description: 'Premium Coimbatore and Madurai 100% combed cotton sarees and traditional dhotis.',
      sortOrder: 2,
    },
    {
      name: 'Designer Kurtis & Tunics',
      slug: 'designer-kurtis',
      image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop',
      description: 'Modern ethnic kurtis, anarkalis, and daily office wear tunics crafted from rayon and cotton.',
      sortOrder: 3,
    },
    {
      name: 'Mens Ethnic & Shirting',
      slug: 'mens-ethnic-shirting',
      image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop',
      description: 'Linen shirts, festive kurtas, Nehru jackets, and luxury blended trouser fabrics.',
      sortOrder: 4,
    },
    {
      name: 'Home Furnishings & Bedding',
      slug: 'home-furnishings',
      image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&auto=format&fit=crop',
      description: '300TC cotton bedsheets, jacquard curtains, handloom diwan sets, and woven cushion covers.',
      sortOrder: 5,
    },
    {
      name: 'Dress Materials & Unstitched Suits',
      slug: 'dress-materials',
      image: 'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=600&auto=format&fit=crop',
      description: 'Chanderi, organza, and modal dress materials with embroidered dupattas.',
      sortOrder: 6,
    },
  ];

  const categoryMap = new Map<string, string>();
  for (const cat of categoriesData) {
    const createdCat = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { image: cat.image, description: cat.description, sortOrder: cat.sortOrder },
      create: cat,
    });
    categoryMap.set(cat.slug, createdCat.id);
  }
  console.log(`✅ Seeded ${categoriesData.length} Categories.`);

  // 3. Brands with Images
  const brandsData = [
    {
      name: 'Krishna Heritage Silk',
      slug: 'krishna-heritage-silk',
      image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=300&auto=format&fit=crop',
      description: 'Our premier signature brand preserving 50+ years of handloom traditions.',
    },
    {
      name: 'Varnam Handlooms',
      slug: 'varnam-handlooms',
      image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=300&auto=format&fit=crop',
      description: 'Organic dyed natural cotton fabrics and authentic artisan weaves.',
    },
    {
      name: 'Aura Linen & Cottons',
      slug: 'aura-linen',
      image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=300&auto=format&fit=crop',
      description: 'Breathable European linen blends tailored for executive formal wear.',
    },
    {
      name: 'Ananya Festive Weaves',
      slug: 'ananya-festive',
      image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&auto=format&fit=crop',
      description: 'Celebratory lehengas, bridal dupattas, and heavy brocades.',
    },
  ];

  const brandMap = new Map<string, string>();
  for (const br of brandsData) {
    const createdBrand = await prisma.brand.upsert({
      where: { slug: br.slug },
      update: { image: br.image, description: br.description },
      create: br,
    });
    brandMap.set(br.slug, createdBrand.id);
  }
  console.log(`✅ Seeded ${brandsData.length} Brands.`);

  // 4. Products with Images & Links
  const products = [
    {
      name: 'Kanchipuram Temple Border Silk Saree',
      slug: 'kanchipuram-temple-border-silk-saree',
      categorySlug: 'pure-silk-sarees',
      brandSlug: 'krishna-heritage-silk',
      price: 8499,
      mrp: 12999,
      stock: 45,
      sku: 'KT-KHS-1001',
      imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop',
      sizes: ['Standard 6.2m'],
      description: 'Authentic pure silk saree with traditional contrast temple pallu and zari thread embroidery.',
      bestSeller: true,
    },
    {
      name: 'Royal Banarasi Gold Brocade Zari Saree',
      slug: 'royal-banarasi-gold-brocade-saree',
      categorySlug: 'pure-silk-sarees',
      brandSlug: 'krishna-heritage-silk',
      price: 9999,
      mrp: 15499,
      stock: 30,
      sku: 'KT-KHS-1002',
      imageUrl: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=600&auto=format&fit=crop',
      sizes: ['Standard 6.2m'],
      description: 'Woven in Varanasi using pure silver-gilt zari with floral jaal motifs and attached unstitched blouse.',
      bestSeller: true,
    },
    {
      name: 'Madurai Organic Sungudi Cotton Saree',
      slug: 'madurai-organic-sungudi-cotton-saree',
      categorySlug: 'cotton-sarees-dhotis',
      brandSlug: 'varnam-handlooms',
      price: 1850,
      mrp: 2799,
      stock: 120,
      sku: 'KT-VAR-1003',
      imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop',
      sizes: ['Standard 5.5m'],
      description: 'Natural block-printed ring-tied traditional Sungudi cotton saree made from 100s count yarn.',
      bestSeller: false,
    },
    {
      name: 'Pure Linen Executive Mandarin Shirt Fabric',
      slug: 'pure-linen-executive-shirt-fabric',
      categorySlug: 'mens-ethnic-shirting',
      brandSlug: 'aura-linen',
      price: 1450,
      mrp: 2200,
      stock: 80,
      sku: 'KT-AUR-1004',
      imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop',
      sizes: ['1.6m Length', '2.2m Kurta Length'],
      description: '60 Lea 100% natural flax linen shirting fabric imported from Normandy, softened finish.',
      bestSeller: true,
    },
    {
      name: '300TC Egyptian Cotton King Bedsheet Set',
      slug: '300tc-egyptian-cotton-bedsheet-set',
      categorySlug: 'home-furnishings',
      brandSlug: 'aura-linen',
      price: 2899,
      mrp: 4499,
      stock: 65,
      sku: 'KT-AUR-1005',
      imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&auto=format&fit=crop',
      sizes: ['King (108x108 inch)'],
      description: 'Breathable sateen weave bedding set including 1 bedsheet and 2 reversible pillow covers.',
      bestSeller: false,
    },
    {
      name: 'Chanderi Silk Gold Zari Unstitched Suit',
      slug: 'chanderi-silk-gold-zari-unstitched-suit',
      categorySlug: 'dress-materials',
      brandSlug: 'ananya-festive',
      price: 3499,
      mrp: 5299,
      stock: 50,
      sku: 'KT-ANA-1006',
      imageUrl: 'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=600&auto=format&fit=crop',
      sizes: ['Top 2.5m + Bottom 2.5m + Dupatta 2.4m'],
      description: 'Lightweight gossamer Chanderi suit material paired with printed organza dupatta.',
      bestSeller: true,
    },
    {
      name: 'Bridal Crimson Banarasi Georgette Lehenga Fabric',
      slug: 'bridal-crimson-banarasi-georgette-fabric',
      categorySlug: 'dress-materials',
      brandSlug: 'ananya-festive',
      price: 11500,
      mrp: 18000,
      stock: 18,
      sku: 'KT-ANA-1007',
      imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop',
      sizes: ['5m Fabric'],
      description: 'Heavy kadwa weaved pure georgette fabric designed for bridal kali panels.',
      bestSeller: false,
    },
    {
      name: 'Traditional Gold Jari Veshti & Angavastram Set',
      slug: 'traditional-gold-jari-veshti-set',
      categorySlug: 'cotton-sarees-dhotis',
      brandSlug: 'varnam-handlooms',
      price: 1999,
      mrp: 2999,
      stock: 90,
      sku: 'KT-VAR-1008',
      imageUrl: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop',
      sizes: ['8 Muzham (3.6m)'],
      description: 'Pure double dhoti set with 2-inch Mayilkan gold border, ideal for poojas and wedding muhurtham.',
      bestSeller: true,
    },
  ];

  for (const p of products) {
    const categoryId = categoryMap.get(p.categorySlug);
    const brandRefId = brandMap.get(p.brandSlug);

    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        price: p.price,
        mrp: p.mrp,
        stock: p.stock,
        imageUrl: p.imageUrl,
        categoryId: categoryId || null,
        brandRefId: brandRefId || null,
      },
      create: {
        name: p.name,
        slug: p.slug,
        brand: p.brandSlug.replace(/-/g, ' ').toUpperCase(),
        brandId: p.brandSlug,
        category: p.categorySlug,
        categoryId: categoryId || null,
        brandRefId: brandRefId || null,
        price: p.price,
        mrp: p.mrp,
        discount: Math.round(((p.mrp - p.price) / p.mrp) * 100),
        rating: 4.8,
        reviews: 42,
        imageUrl: p.imageUrl,
        bestSeller: p.bestSeller,
        description: p.description,
        sizes: p.sizes,
        stock: p.stock,
        minStockAlert: 15,
        sku: p.sku,
      },
    });
  }
  console.log(`✅ Seeded ${products.length} Products.`);

  // 5. CRM Customers
  const customer1 = await prisma.customer.upsert({
    where: { phone: '+91 94441 23456' },
    update: {},
    create: {
      name: 'Venkateshwara Textiles',
      email: 'orders@venkateshwara.in',
      phone: '+91 94441 23456',
      company: 'Venkateshwara Garments Ltd',
      gstin: '33AAACV1234F1Z8',
      address: '42, Mill Road, Gandhinagar',
      city: 'Tiruppur',
      state: 'Tamil Nadu',
      pincode: '641602',
      type: CustomerType.WHOLESALE,
      creditLimit: 500000,
    },
  });

  const customer2 = await prisma.customer.upsert({
    where: { phone: '+91 98450 98765' },
    update: {},
    create: {
      name: 'Ananya Sundaram',
      email: 'ananya.sundaram@gmail.com',
      phone: '+91 98450 98765',
      address: '14/B, Alwarpet High Road',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600018',
      type: CustomerType.RETAIL,
    },
  });

  console.log('✅ Seeded CRM Customers.');

  // 6. Orders with 9-digit order IDs and OrderStatusHistory
  const seededOrders = [
    {
      orderNumber: '100482914', // 9 digits
      customerId: customer1.id,
      customerName: customer1.name,
      customerPhone: customer1.phone,
      customerEmail: customer1.email,
      shippingAddress: '42, Mill Road, Gandhinagar, Tiruppur, Tamil Nadu - 641602',
      status: OrderStatus.DISPATCHED,
      subtotal: 42495,
      taxAmount: 2125,
      discountAmount: 2000,
      totalAmount: 42620,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'NEFT_BANK_TRANSFER',
      trackingNumber: 'VRL-EXP-99201',
      items: [
        { productName: 'Kanchipuram Temple Border Silk Saree', quantity: 5, unitPrice: 8499, totalPrice: 42495 },
      ],
      history: [
        { status: OrderStatus.CONFIRMED, note: 'Order placed from storefront', changedBy: 'Storefront' },
        { status: OrderStatus.PROCESSING, note: 'Packaged at Tiruppur central depot', changedBy: 'Admin' },
        { status: OrderStatus.DISPATCHED, note: 'Dispatched via VRL Logistics #VRL-EXP-99201', changedBy: 'Admin' },
      ],
    },
    {
      orderNumber: '100958273', // 9 digits
      customerId: customer2.id,
      customerName: customer2.name,
      customerPhone: customer2.phone,
      customerEmail: customer2.email,
      shippingAddress: '14/B, Alwarpet High Road, Chennai, Tamil Nadu - 600018',
      status: OrderStatus.CONFIRMED,
      subtotal: 9999,
      taxAmount: 500,
      discountAmount: 500,
      totalAmount: 9999,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'UPI_RAZORPAY',
      items: [
        { productName: 'Royal Banarasi Gold Brocade Zari Saree', quantity: 1, unitPrice: 9999, totalPrice: 9999 },
      ],
      history: [
        { status: OrderStatus.CONFIRMED, note: 'Order placed online with instant UPI confirmation', changedBy: 'Storefront' },
      ],
    },
  ];

  for (const o of seededOrders) {
    const existing = await prisma.order.findUnique({ where: { orderNumber: o.orderNumber } });
    if (!existing) {
      await prisma.order.create({
        data: {
          orderNumber: o.orderNumber,
          customerId: o.customerId,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          customerEmail: o.customerEmail,
          shippingAddress: o.shippingAddress,
          status: o.status,
          subtotal: o.subtotal,
          taxAmount: o.taxAmount,
          discountAmount: o.discountAmount,
          totalAmount: o.totalAmount,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          trackingNumber: o.trackingNumber,
          items: {
            create: o.items,
          },
          history: {
            create: o.history,
          },
        },
      });
    }
  }
  console.log('✅ Seeded 9-digit Orders with Status Timeline.');

  // 7. Seed Coupons
  const coupons = [
    {
      code: 'KRISHNA10',
      description: '10% instant discount on all pure silk sarees and ethnic wear',
      type: CouponType.PERCENTAGE,
      value: 10,
      minOrderAmount: 2000,
      maxDiscountAmount: 1500,
      usageLimit: 500,
      isActive: true,
    },
    {
      code: 'FESTIVE500',
      description: 'Flat ₹500 discount on orders above ₹4,999',
      type: CouponType.FIXED,
      value: 500,
      minOrderAmount: 4999,
      maxDiscountAmount: 500,
      usageLimit: 200,
      isActive: true,
    },
    {
      code: 'WHOLESALE15',
      description: '15% off for bulk boutique and shop orders above ₹25,000',
      type: CouponType.PERCENTAGE,
      value: 15,
      minOrderAmount: 25000,
      maxDiscountAmount: 7500,
      usageLimit: 100,
      isActive: true,
    },
  ];

  for (const c of coupons) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: c,
      create: c,
    });
  }
  console.log(`✅ Seeded ${coupons.length} Coupons.`);

  // 8. Seed Offers
  const offers = [
    {
      title: 'Grand Diwali & Pongal Silk Fest',
      description: 'Up to 30% off on authentic Kanchipuram and Banarasi handwoven silk collections.',
      bannerImage: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1200&auto=format&fit=crop',
      discountType: CouponType.PERCENTAGE,
      discountValue: 30,
      targetType: OfferTarget.CATEGORY,
      targetName: 'Pure Silk Sarees',
      badgeText: 'FESTIVE SPECIAL',
      priority: 1,
      isActive: true,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-11-30'),
    },
    {
      title: 'Varnam Artisan Weaves Promotion',
      description: 'Flat 20% off on all organic cotton sarees, veshtis, and handloom kurtis.',
      bannerImage: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1200&auto=format&fit=crop',
      discountType: CouponType.PERCENTAGE,
      discountValue: 20,
      targetType: OfferTarget.BRAND,
      targetName: 'Varnam Handlooms',
      badgeText: 'ARTISAN WEAVE',
      priority: 2,
      isActive: true,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-10-15'),
    },
  ];

  for (const off of offers) {
    const existing = await prisma.offer.findFirst({ where: { title: off.title } });
    if (!existing) {
      await prisma.offer.create({ data: off });
    }
  }
  console.log(`✅ Seeded ${offers.length} Promotional Offers.`);

  console.log('🎉 All Database Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
