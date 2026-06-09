import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';
import * as schema from '../src/db/schema';
import { cleanEmail } from '../src/utils/normalizers';

config();

const {
    DB_HOST = '127.0.0.1',
    DB_PORT = '3306',
    DB_USER = 'root',
    DB_PASSWORD = '',
    DB_NAME = 'vlabs',
} = process.env;

const connection = createPool({
    host: DB_HOST,
    user: DB_USER,
    database: DB_NAME,
    password: DB_PASSWORD,
    port: Number(DB_PORT),
    connectionLimit: 1,
});

const db = drizzle(connection, { schema, mode: 'default' });

// ─── helpers ────────────────────────────────────────────────────────
function insertId(r: any) {
    return Number(r[0].insertId);
}
function rand<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function addDays(d: Date, n: number) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}
function fmtDate(d: Date) {
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('🌱 Seeding database (3x volume)...\n');

    // ─── 1. USERS (team members) ─────────────────────────────────────
    console.log('👤 Creating users...');
    const pw = await Bun.password.hash('password123', { algorithm: 'bcrypt', cost: 10 });

    const userSeed = [
        {
            email: 'andi.pratama@vauto.id',
            username: 'andi',
            phone: '628111000001',
            name: 'Andi Pratama',
            role: 2,
        },
        {
            email: 'budi.santoso@vauto.id',
            username: 'budi',
            phone: '628111000002',
            name: 'Budi Santoso',
            role: 1,
        },
        {
            email: 'citra.dewi@vauto.id',
            username: 'citra',
            phone: '628111000003',
            name: 'Citra Dewi',
            role: 1,
        },
        {
            email: 'dani.kurnia@vauto.id',
            username: 'dani',
            phone: '628111000004',
            name: 'Dani Kurniawan',
            role: 1,
        },
        {
            email: 'eka.suryanto@vauto.id',
            username: 'eka',
            phone: '628111000005',
            name: 'Eka Suryanto',
            role: 2,
        },
        {
            email: 'fitra.hidayat@vauto.id',
            username: 'fitra',
            phone: '628111000006',
            name: 'Fitra Hidayat',
            role: 1,
        },
        {
            email: 'gita.wijaya@vauto.id',
            username: 'gita',
            phone: '628111000007',
            name: 'Gita Wijaya',
            role: 1,
        },
        {
            email: 'hendra.lim@vauto.id',
            username: 'hendra',
            phone: '628111000008',
            name: 'Hendra Lim',
            role: 1,
        },
        {
            email: 'indriani.putri@vauto.id',
            username: 'indriani',
            phone: '628111000009',
            name: 'Indriani Putri',
            role: 2,
        },
        {
            email: 'joko.wijaya@vauto.id',
            username: 'joko',
            phone: '628111000010',
            name: 'Joko Wijaya',
            role: 1,
        },
        {
            email: 'karina.sari@vauto.id',
            username: 'karina',
            phone: '628111000011',
            name: 'Karina Sari',
            role: 1,
        },
        {
            email: 'lukman.hadi@vauto.id',
            username: 'lukman',
            phone: '628111000012',
            name: 'Lukman Hadi',
            role: 1,
        },
    ];

    const userIds: number[] = [];
    for (const u of userSeed) {
        const email = cleanEmail(u.email);
        const existing = await db.query.users.findFirst({
            where: (t, { eq }) => eq(t.email, email),
        });
        if (existing) {
            userIds.push(existing.id);
            continue;
        }
        const r = await db
            .insert(schema.users)
            .values({ email, username: u.username, phone: u.phone, password: pw, role: u.role });
        const uid = insertId(r);
        userIds.push(uid);
        await db
            .insert(schema.profiles)
            .values({ userId: uid, name: u.name, email, phone: u.phone });
    }
    console.log(`  ✓ ${userIds.length} users`);

    // ─── 2. CUSTOMERS ────────────────────────────────────────────────
    console.log('🏢 Creating customers...');
    const customerSeed = [
        {
            email: 'owner@tokobaju.id',
            username: 'tokobaju',
            phone: '628222000001',
            name: 'Toko Baju Indah',
        },
        {
            email: 'owner@rumahkuliner.id',
            username: 'rumahkuliner',
            phone: '628222000002',
            name: 'Rumah Kuliner Nusantara',
        },
        {
            email: 'owner@salonkecantikan.id',
            username: 'salonkecantikan',
            phone: '628222000003',
            name: 'Salon Kecantikan Cantik',
        },
        {
            email: 'owner@bengkelmotor.id',
            username: 'bengkelmotor',
            phone: '628222000004',
            name: 'Bengkel Motor Jaya',
        },
        {
            email: 'owner@apoteksehat.id',
            username: 'apoteksehat',
            phone: '628222000005',
            name: 'Apotek Sehat Mandiri',
        },
        {
            email: 'owner@coffeeshop.id',
            username: 'coffeeshop',
            phone: '628222000006',
            name: 'Coffee Shop Aroma',
        },
        {
            email: 'owner@fashionstore.id',
            username: 'fashionstore',
            phone: '628222000007',
            name: 'Fashion Store Premium',
        },
        {
            email: 'owner@gymfitness.id',
            username: 'gymfitness',
            phone: '628222000008',
            name: 'Gym Fitness Center',
        },
        {
            email: 'owner@restaurantok.id',
            username: 'restaurantok',
            phone: '628222000009',
            name: 'Restaurant OK',
        },
        {
            email: 'owner@travelagency.id',
            username: 'travelagency',
            phone: '628222000010',
            name: 'Travel Agency Jelajahi',
        },
        {
            email: 'owner@photoservice.id',
            username: 'photoservice',
            phone: '628222000011',
            name: 'Photo Studio Flash',
        },
        {
            email: 'owner@petshop.id',
            username: 'petshop',
            phone: '628222000012',
            name: 'Pet Shop Pawsome',
        },
        {
            email: 'owner@barandgrill.id',
            username: 'barandgrill',
            phone: '628222000013',
            name: 'Bar & Grill Mewah',
        },
        {
            email: 'owner@beautyproducts.id',
            username: 'beautyproducts',
            phone: '628222000014',
            name: 'Beauty Products Glam',
        },
        {
            email: 'owner@fitnessnutrition.id',
            username: 'fitnessnutrition',
            phone: '628222000015',
            name: 'Fitness Nutrition Hub',
        },
    ];

    const customerIds: number[] = [];
    for (const c of customerSeed) {
        const existing = await db.query.customers.findFirst({
            where: (t, { eq }) => eq(t.email, c.email),
        });
        if (existing) {
            customerIds.push(existing.id);
            continue;
        }
        const r = await db
            .insert(schema.customers)
            .values({ email: c.email, username: c.username, phone: c.phone, password: pw });
        const cid = insertId(r);
        customerIds.push(cid);
        await db
            .insert(schema.customerProfiles)
            .values({ customerId: cid, name: c.name, email: c.email, phone: c.phone });
    }
    console.log(`  ✓ ${customerIds.length} customers`);

    // ─── 3. PRODUCTS ─────────────────────────────────────────────────
    console.log('📦 Creating products...');
    const productSeed = [
        {
            name: 'Paket Starter',
            description: 'Manajemen iklan dasar - Setup akun & optimasi dasar',
            price: '500000.00',
        },
        {
            name: 'Paket Growth',
            description: 'Manajemen iklan + optimasi - Scaling & A/B testing',
            price: '1500000.00',
        },
        {
            name: 'Paket Scale',
            description: 'Full service digital marketing - Multi-platform',
            price: '3000000.00',
        },
        {
            name: 'Paket Enterprise',
            description: 'Custom solution untuk bisnis besar - Dedicated team',
            price: '5000000.00',
        },
        {
            name: 'Paket SMM',
            description: 'Social Media Management - Content & engagement',
            price: '800000.00',
        },
        {
            name: 'Paket Conversion',
            description: 'Landing page & conversion optimization',
            price: '1200000.00',
        },
        {
            name: 'Paket Analytics',
            description: 'Data analytics & reporting dashboard',
            price: '600000.00',
        },
        {
            name: 'Paket Brand',
            description: 'Branding & positioning strategy',
            price: '2000000.00',
        },
        {
            name: 'Paket Video',
            description: 'Video production & ads creation',
            price: '2500000.00',
        },
        {
            name: 'Paket SEO',
            description: 'Search engine optimization package',
            price: '1000000.00',
        },
        { name: 'Paket Email', description: 'Email marketing automation', price: '700000.00' },
        {
            name: 'Paket Bundle',
            description: 'Semua paket dalam satu bundel hemat',
            price: '8000000.00',
        },
    ];

    const productIds: number[] = [];
    for (const p of productSeed) {
        const existing = await db.query.products.findFirst({
            where: (t, { eq }) => eq(t.name, p.name),
        });
        if (existing) {
            productIds.push(existing.id);
            continue;
        }
        const r = await db.insert(schema.products).values(p);
        productIds.push(insertId(r));
    }
    console.log(`  ✓ ${productIds.length} products`);

    // ─── 4. SUBSCRIPTIONS ────────────────────────────────────────────
    console.log('🔐 Creating subscriptions...');
    const today = new Date('2026-04-19');
    const subData = [
        // Toko Baju
        {
            customerId: customerIds[0],
            productId: productIds[1],
            advertiserId: userIds[0],
            brand: 'Toko Baju Indah',
            platform: 'Meta Ads',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -90)),
            dueDate: fmtDate(addDays(today, 90)),
        },
        {
            customerId: customerIds[0],
            productId: productIds[4],
            advertiserId: userIds[4],
            brand: 'Toko Baju Indah',
            platform: 'Instagram',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -60)),
            dueDate: fmtDate(addDays(today, 120)),
        },
        // Rumah Kuliner
        {
            customerId: customerIds[1],
            productId: productIds[2],
            advertiserId: userIds[1],
            brand: 'Rumah Kuliner',
            platform: 'Google Ads',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -60)),
            dueDate: fmtDate(addDays(today, 120)),
        },
        {
            customerId: customerIds[1],
            productId: productIds[8],
            advertiserId: userIds[5],
            brand: 'Rumah Kuliner',
            platform: 'YouTube',
            status: 1,
            onboardingStatus: 1,
            startDate: fmtDate(addDays(today, -30)),
            dueDate: fmtDate(addDays(today, 60)),
        },
        // Salon Cantik
        {
            customerId: customerIds[2],
            productId: productIds[0],
            advertiserId: userIds[2],
            brand: 'Salon Cantik',
            platform: 'TikTok Ads',
            status: 1,
            onboardingStatus: 1,
            startDate: fmtDate(addDays(today, -30)),
            dueDate: fmtDate(addDays(today, 60)),
        },
        {
            customerId: customerIds[2],
            productId: productIds[4],
            advertiserId: userIds[6],
            brand: 'Salon Cantik',
            platform: 'Instagram',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -45)),
            dueDate: fmtDate(addDays(today, 75)),
        },
        // Bengkel Jaya
        {
            customerId: customerIds[3],
            productId: productIds[3],
            advertiserId: userIds[0],
            brand: 'Bengkel Jaya',
            platform: 'Meta Ads',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -120)),
            dueDate: fmtDate(addDays(today, 30)),
        },
        {
            customerId: customerIds[3],
            productId: productIds[9],
            advertiserId: userIds[3],
            brand: 'Bengkel Jaya',
            platform: 'Google Search',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -90)),
            dueDate: fmtDate(addDays(today, 60)),
        },
        // Apotek Sehat
        {
            customerId: customerIds[4],
            productId: productIds[1],
            advertiserId: userIds[3],
            brand: 'Apotek Sehat',
            platform: 'Google Ads',
            status: 2,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -180)),
            dueDate: fmtDate(addDays(today, -10)),
        },
        // Coffee Shop
        {
            customerId: customerIds[5],
            productId: productIds[4],
            advertiserId: userIds[7],
            brand: 'Coffee Shop Aroma',
            platform: 'Instagram',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -75)),
            dueDate: fmtDate(addDays(today, 105)),
        },
        // Fashion Store
        {
            customerId: customerIds[6],
            productId: productIds[2],
            advertiserId: userIds[8],
            brand: 'Fashion Store Premium',
            platform: 'Meta Ads',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -50)),
            dueDate: fmtDate(addDays(today, 100)),
        },
        {
            customerId: customerIds[6],
            productId: productIds[6],
            advertiserId: userIds[9],
            brand: 'Fashion Store Premium',
            platform: 'Analytics',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -50)),
            dueDate: fmtDate(addDays(today, 100)),
        },
        // Gym Fitness
        {
            customerId: customerIds[7],
            productId: productIds[5],
            advertiserId: userIds[10],
            brand: 'Gym Fitness Center',
            platform: 'Meta Ads',
            status: 1,
            onboardingStatus: 1,
            startDate: fmtDate(addDays(today, -20)),
            dueDate: fmtDate(addDays(today, 70)),
        },
        // Restaurant OK
        {
            customerId: customerIds[8],
            productId: productIds[4],
            advertiserId: userIds[4],
            brand: 'Restaurant OK',
            platform: 'TikTok',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -40)),
            dueDate: fmtDate(addDays(today, 80)),
        },
        // Travel Agency
        {
            customerId: customerIds[9],
            productId: productIds[8],
            advertiserId: userIds[1],
            brand: 'Travel Agency Jelajahi',
            platform: 'YouTube',
            status: 1,
            onboardingStatus: 1,
            startDate: fmtDate(addDays(today, -35)),
            dueDate: fmtDate(addDays(today, 65)),
        },
        // Photo Studio
        {
            customerId: customerIds[10],
            productId: productIds[9],
            advertiserId: userIds[11],
            brand: 'Photo Studio Flash',
            platform: 'Google',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -65)),
            dueDate: fmtDate(addDays(today, 95)),
        },
        // Pet Shop
        {
            customerId: customerIds[11],
            productId: productIds[4],
            advertiserId: userIds[5],
            brand: 'Pet Shop Pawsome',
            platform: 'Instagram',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -55)),
            dueDate: fmtDate(addDays(today, 85)),
        },
        // Bar & Grill
        {
            customerId: customerIds[12],
            productId: productIds[2],
            advertiserId: userIds[6],
            brand: 'Bar & Grill Mewah',
            platform: 'Meta Ads',
            status: 1,
            onboardingStatus: 1,
            startDate: fmtDate(addDays(today, -25)),
            dueDate: fmtDate(addDays(today, 75)),
        },
        // Beauty Products
        {
            customerId: customerIds[13],
            productId: productIds[1],
            advertiserId: userIds[7],
            brand: 'Beauty Products Glam',
            platform: 'TikTok',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -45)),
            dueDate: fmtDate(addDays(today, 85)),
        },
        // Fitness Nutrition
        {
            customerId: customerIds[14],
            productId: productIds[3],
            advertiserId: userIds[10],
            brand: 'Fitness Nutrition Hub',
            platform: 'Meta Ads',
            status: 1,
            onboardingStatus: 2,
            startDate: fmtDate(addDays(today, -80)),
            dueDate: fmtDate(addDays(today, 100)),
        },
    ];

    const subIds: number[] = [];
    for (const s of subData) {
        const r = await db.insert(schema.subscriptions).values({
            ...s,
            target: 'Meningkatkan brand awareness dan konversi penjualan online',
            note: rand([
                'Klien aktif, komunikasi lancar',
                'Perlu follow-up minggu depan',
                'Awaiting approval',
                'Baru onboarding',
            ]),
        });
        subIds.push(insertId(r));
    }
    console.log(`  ✓ ${subIds.length} subscriptions`);

    // ─── 5. SCORECARDS ───────────────────────────────────────────────
    console.log('📊 Creating scorecards...');
    // frequency: 1=monthly, 2=weekly, 3=daily
    const scorecardSeed = [
        // Toko Baju — monthly & weekly
        {
            customerId: customerIds[0],
            subscriptionId: subIds[0],
            assignedTo: userIds[0],
            title: 'ROAS Meta Ads',
            category: 0,
            targetValue: '5.00',
            unitValue: 3,
            frequency: 1,
            targetType: 0,
        },
        {
            customerId: customerIds[0],
            subscriptionId: subIds[0],
            assignedTo: userIds[0],
            title: 'Jumlah Purchase',
            category: 1,
            targetValue: '50.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        {
            customerId: customerIds[0],
            subscriptionId: subIds[0],
            assignedTo: userIds[0],
            title: 'Cost Per Purchase',
            category: 1,
            targetValue: '35000.00',
            unitValue: 1,
            frequency: 2,
            targetType: 1,
        },
        {
            customerId: customerIds[0],
            subscriptionId: subIds[1],
            assignedTo: userIds[4],
            title: 'IG Engagement Rate',
            category: 1,
            targetValue: '6.50',
            unitValue: 2,
            frequency: 3,
            targetType: 0,
        },
        // Rumah Kuliner — monthly & weekly
        {
            customerId: customerIds[1],
            subscriptionId: subIds[2],
            assignedTo: userIds[1],
            title: 'Conversion Rate',
            category: 0,
            targetValue: '3.50',
            unitValue: 2,
            frequency: 1,
            targetType: 0,
        },
        {
            customerId: customerIds[1],
            subscriptionId: subIds[2],
            assignedTo: userIds[1],
            title: 'Impressi Iklan',
            category: 1,
            targetValue: '25000.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        {
            customerId: customerIds[1],
            subscriptionId: subIds[2],
            assignedTo: userIds[1],
            title: 'CTR Google Ads',
            category: 1,
            targetValue: '4.00',
            unitValue: 2,
            frequency: 3,
            targetType: 0,
        },
        {
            customerId: customerIds[1],
            subscriptionId: subIds[3],
            assignedTo: userIds[5],
            title: 'Video Views',
            category: 1,
            targetValue: '50000.00',
            unitValue: 0,
            frequency: 1,
            targetType: 0,
        },
        // Salon Cantik — weekly & daily
        {
            customerId: customerIds[2],
            subscriptionId: subIds[4],
            assignedTo: userIds[2],
            title: 'Leads Masuk',
            category: 1,
            targetValue: '12.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        {
            customerId: customerIds[2],
            subscriptionId: subIds[4],
            assignedTo: userIds[2],
            title: 'Cost Per Lead',
            category: 1,
            targetValue: '20000.00',
            unitValue: 1,
            frequency: 2,
            targetType: 1,
        },
        {
            customerId: customerIds[2],
            subscriptionId: subIds[5],
            assignedTo: userIds[6],
            title: 'Followers Growth',
            category: 1,
            targetValue: '125.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        // Bengkel Jaya — daily & monthly
        {
            customerId: customerIds[3],
            subscriptionId: subIds[6],
            assignedTo: userIds[0],
            title: 'Click to WhatsApp',
            category: 1,
            targetValue: '10.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        {
            customerId: customerIds[3],
            subscriptionId: subIds[6],
            assignedTo: userIds[0],
            title: 'Total Spend',
            category: 2,
            targetValue: '5000000.00',
            unitValue: 1,
            frequency: 1,
            targetType: 0,
        },
        {
            customerId: customerIds[3],
            subscriptionId: subIds[7],
            assignedTo: userIds[3],
            title: 'Organic Traffic',
            category: 1,
            targetValue: '2000.00',
            unitValue: 0,
            frequency: 1,
            targetType: 0,
        },
        // Coffee Shop — daily
        {
            customerId: customerIds[5],
            subscriptionId: subIds[9],
            assignedTo: userIds[7],
            title: 'Reach Harian',
            category: 1,
            targetValue: '5000.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        {
            customerId: customerIds[5],
            subscriptionId: subIds[9],
            assignedTo: userIds[7],
            title: 'Story Interactions',
            category: 1,
            targetValue: '800.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        // Fashion Store — monthly & weekly
        {
            customerId: customerIds[6],
            subscriptionId: subIds[10],
            assignedTo: userIds[8],
            title: 'Revenue dari Ads',
            category: 0,
            targetValue: '50000000.00',
            unitValue: 1,
            frequency: 1,
            targetType: 0,
        },
        {
            customerId: customerIds[6],
            subscriptionId: subIds[10],
            assignedTo: userIds[8],
            title: 'Add to Cart',
            category: 1,
            targetValue: '37.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        {
            customerId: customerIds[6],
            subscriptionId: subIds[11],
            assignedTo: userIds[9],
            title: 'Bounce Rate',
            category: 1,
            targetValue: '40.00',
            unitValue: 2,
            frequency: 2,
            targetType: 1,
        },
        // Gym Fitness — weekly
        {
            customerId: customerIds[7],
            subscriptionId: subIds[12],
            assignedTo: userIds[10],
            title: 'Member Inquiries',
            category: 1,
            targetValue: '8.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        {
            customerId: customerIds[7],
            subscriptionId: subIds[12],
            assignedTo: userIds[10],
            title: 'Cost Per Inquiry',
            category: 1,
            targetValue: '25000.00',
            unitValue: 1,
            frequency: 2,
            targetType: 1,
        },
        // Restaurant OK — daily
        {
            customerId: customerIds[8],
            subscriptionId: subIds[13],
            assignedTo: userIds[4],
            title: 'TikTok Engagement',
            category: 1,
            targetValue: '10000.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        {
            customerId: customerIds[8],
            subscriptionId: subIds[13],
            assignedTo: userIds[4],
            title: 'Food Order Clicks',
            category: 1,
            targetValue: '200.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        // Travel Agency — monthly & weekly
        {
            customerId: customerIds[9],
            subscriptionId: subIds[14],
            assignedTo: userIds[1],
            title: 'Video Performance',
            category: 1,
            targetValue: '100000.00',
            unitValue: 0,
            frequency: 1,
            targetType: 0,
        },
        {
            customerId: customerIds[9],
            subscriptionId: subIds[14],
            assignedTo: userIds[1],
            title: 'Booking Leads',
            category: 1,
            targetValue: '10.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        // Photo Studio — monthly
        {
            customerId: customerIds[10],
            subscriptionId: subIds[15],
            assignedTo: userIds[11],
            title: 'Local Pack Visibility',
            category: 1,
            targetValue: '85.00',
            unitValue: 2,
            frequency: 1,
            targetType: 0,
        },
        {
            customerId: customerIds[10],
            subscriptionId: subIds[15],
            assignedTo: userIds[11],
            title: 'Phone Calls',
            category: 1,
            targetValue: '20.00',
            unitValue: 0,
            frequency: 1,
            targetType: 0,
        },
        // Pet Shop — weekly & daily
        {
            customerId: customerIds[11],
            subscriptionId: subIds[16],
            assignedTo: userIds[5],
            title: 'Product Views',
            category: 1,
            targetValue: '3500.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        {
            customerId: customerIds[11],
            subscriptionId: subIds[16],
            assignedTo: userIds[5],
            title: 'DM Inquiries',
            category: 1,
            targetValue: '25.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        // Bar & Grill — weekly & monthly
        {
            customerId: customerIds[12],
            subscriptionId: subIds[17],
            assignedTo: userIds[6],
            title: 'Reservation Clicks',
            category: 1,
            targetValue: '15.00',
            unitValue: 0,
            frequency: 2,
            targetType: 0,
        },
        {
            customerId: customerIds[12],
            subscriptionId: subIds[17],
            assignedTo: userIds[6],
            title: 'ROAS Bar & Grill',
            category: 0,
            targetValue: '4.50',
            unitValue: 3,
            frequency: 1,
            targetType: 0,
        },
        // Beauty Products — daily & weekly
        {
            customerId: customerIds[13],
            subscriptionId: subIds[18],
            assignedTo: userIds[7],
            title: 'Product Sales',
            category: 1,
            targetValue: '500.00',
            unitValue: 0,
            frequency: 3,
            targetType: 0,
        },
        {
            customerId: customerIds[13],
            subscriptionId: subIds[18],
            assignedTo: userIds[7],
            title: 'CPM TikTok',
            category: 1,
            targetValue: '15000.00',
            unitValue: 1,
            frequency: 2,
            targetType: 1,
        },
        // Fitness Nutrition — monthly & weekly
        {
            customerId: customerIds[14],
            subscriptionId: subIds[19],
            assignedTo: userIds[10],
            title: 'Subscription Signups',
            category: 1,
            targetValue: '100.00',
            unitValue: 0,
            frequency: 1,
            targetType: 0,
        },
        {
            customerId: customerIds[14],
            subscriptionId: subIds[19],
            assignedTo: userIds[10],
            title: 'Cost Per Signup',
            category: 1,
            targetValue: '30000.00',
            unitValue: 1,
            frequency: 2,
            targetType: 1,
        },
    ];

    const scorecardIds: number[] = [];
    for (const s of scorecardSeed) {
        const r = await db
            .insert(schema.scorecards)
            .values({
                ...s,
                status: 1,
                pic: 0,
                showOnScorecard: 1,
                greenThreshold: 100,
                yellowThreshold: 80,
            });
        scorecardIds.push(insertId(r));
    }
    console.log(`  ✓ ${scorecardIds.length} scorecards`);

    // ─── 6. SCORECARD DATA ───────────────────────────────────────────
    // frequency 1 = monthly: 3 bulan (Feb, Mar, Apr)
    // frequency 2 = weekly:  12 minggu terakhir (4 minggu × 3 bulan)
    // frequency 3 = daily:   30 hari terakhir
    console.log('📈 Creating scorecard data...');

    function nextVal(prev: number, target: number): number {
        const pct = prev / target;
        // Trend realistis: cenderung naik tapi ada fluktuasi
        const delta = (Math.random() - 0.35) * 0.18;
        return Math.max(prev * (1 + delta), target * 0.3);
    }

    // threshold: 0=green, 1=yellow, 2=red (match scorecardData route)
    // trend: 0=-, 1=turun, 2=stabil, 3=naik
    function calcRow(actual: number, target: number, prev: number | null, targetType: number) {
        // targetType 0 (minimum): higher actual = better → pct = actual/target
        // targetType 1 (maximum): lower actual = better → pct = target/actual
        let pct: number;
        if (targetType === 1) {
            pct = actual > 0 ? (target / actual) * 100 : 999;
        } else {
            pct = (actual / target) * 100;
        }
        const threshold = pct >= 100 ? 0 : pct >= 80 ? 1 : 2;
        const trend = prev === null ? 0 : actual > prev * 1.02 ? 3 : actual < prev * 0.98 ? 1 : 2;
        return { threshold, trend };
    }

    let totalScorecardDataRows = 0;

    for (let idx = 0; idx < scorecardIds.length; idx++) {
        const sid = scorecardIds[idx];
        const s = scorecardSeed[idx];
        const target = parseFloat(s.targetValue);
        const freq = s.frequency;
        // Start value: 70-100% dari target
        let val = target * (0.7 + Math.random() * 0.3);
        let prevVal: number | null = null;

        if (freq === 1) {
            // Monthly: Feb, Mar, Apr 2026 — hanya Apr (terakhir) yang status=1
            const months = [
                { year: 2026, month: 2 },
                { year: 2026, month: 3 },
                { year: 2026, month: 4 },
            ];
            for (let i = 0; i < months.length; i++) {
                const p = months[i];
                const { threshold, trend } = calcRow(val, target, prevVal, s.targetType);
                await db.insert(schema.scorecardData).values({
                    scorecardId: sid,
                    year: p.year,
                    month: p.month,
                    week: null,
                    day: null,
                    actualValue: val.toFixed(2),
                    targetValue: target.toFixed(2),
                    status: i === months.length - 1 ? 1 : 0,
                    threshold,
                    trend,
                    enteredBy: rand(userIds),
                });
                totalScorecardDataRows++;
                prevVal = val;
                val = nextVal(val, target);
            }
        } else if (freq === 2) {
            // Weekly: 12 minggu — hanya minggu terakhir (Apr week 4) yang status=1
            const weeks = [
                { year: 2026, month: 2, week: 1 },
                { year: 2026, month: 2, week: 2 },
                { year: 2026, month: 2, week: 3 },
                { year: 2026, month: 2, week: 4 },
                { year: 2026, month: 3, week: 1 },
                { year: 2026, month: 3, week: 2 },
                { year: 2026, month: 3, week: 3 },
                { year: 2026, month: 3, week: 4 },
                { year: 2026, month: 4, week: 1 },
                { year: 2026, month: 4, week: 2 },
                { year: 2026, month: 4, week: 3 },
                { year: 2026, month: 4, week: 4 },
            ];
            for (let i = 0; i < weeks.length; i++) {
                const p = weeks[i];
                const { threshold, trend } = calcRow(val, target, prevVal, s.targetType);
                await db.insert(schema.scorecardData).values({
                    scorecardId: sid,
                    year: p.year,
                    month: p.month,
                    week: p.week,
                    day: null,
                    actualValue: val.toFixed(2),
                    targetValue: target.toFixed(2),
                    status: i === weeks.length - 1 ? 1 : 0,
                    threshold,
                    trend,
                    enteredBy: rand(userIds),
                });
                totalScorecardDataRows++;
                prevVal = val;
                val = nextVal(val, target);
            }
        } else if (freq === 3) {
            // Daily: 30 hari — hanya hari terakhir (Apr 19) yang status=1
            const startDate = new Date('2026-03-20');
            for (let d = 0; d < 30; d++) {
                const dt = addDays(startDate, d);
                const year = dt.getFullYear();
                const month = dt.getMonth() + 1;
                const day = dt.getDate();
                const { threshold, trend } = calcRow(val, target, prevVal, s.targetType);
                await db.insert(schema.scorecardData).values({
                    scorecardId: sid,
                    year,
                    month,
                    week: null,
                    day,
                    actualValue: val.toFixed(2),
                    targetValue: target.toFixed(2),
                    status: d === 29 ? 1 : 0,
                    threshold,
                    trend,
                    enteredBy: rand(userIds),
                });
                totalScorecardDataRows++;
                prevVal = val;
                val = nextVal(val, target);
            }
        }
    }
    console.log(`  ✓ ${totalScorecardDataRows} scorecard data entries (monthly/weekly/daily)`);

    // ─── 7. TICKET ISSUES ────────────────────────────────────────────
    console.log('🎫 Creating ticket issues...');
    const ticketSeed = [
        {
            title: 'Iklan ditolak platform Meta',
            customerId: customerIds[0],
            subscriptionId: subIds[0],
            assignedTo: userIds[0],
            status: 0,
            pendingOn: 0,
            description:
                'Ada 3 iklan yang ditolak karena melanggar policy terkait klaim produk. Perlu revisi copy iklan.',
        },
        {
            title: 'CTR turun drastis minggu ini',
            customerId: customerIds[1],
            subscriptionId: subIds[2],
            assignedTo: userIds[1],
            status: 1,
            pendingOn: 0,
            description:
                'CTR Google Ads turun dari 4.2% ke 2.8% dalam 1 minggu. Kemungkinan karena kompetitor baru masuk.',
        },
        {
            title: 'Budget habis sebelum akhir bulan',
            customerId: customerIds[3],
            subscriptionId: subIds[6],
            assignedTo: userIds[0],
            status: 2,
            pendingOn: 1,
            description:
                'Budget harian perlu di-adjust. Saat ini terlalu agresif di awal bulan sehingga habis di minggu ke-3.',
        },
        {
            title: 'Pixel Meta tidak tracking konversi',
            customerId: customerIds[0],
            subscriptionId: subIds[0],
            assignedTo: userIds[2],
            status: 0,
            pendingOn: 0,
            description:
                'Pixel tidak merekam event Purchase. Perlu re-install atau debug event manager.',
        },
        {
            title: 'Permintaan tambah platform TikTok',
            customerId: customerIds[1],
            subscriptionId: subIds[2],
            assignedTo: userIds[1],
            status: 3,
            pendingOn: 0,
            description: 'Klien minta ekspansi ke TikTok Ads. Sudah dibuat proposal paket baru.',
        },
        {
            title: 'Landing page lambat load',
            customerId: customerIds[2],
            subscriptionId: subIds[4],
            assignedTo: userIds[2],
            status: 1,
            pendingOn: 1,
            description: 'Page speed score hanya 42/100. Perlu optimasi gambar dan minify JS.',
        },
        {
            title: 'Akun Google Ads suspended',
            customerId: customerIds[4],
            subscriptionId: subIds[8],
            assignedTo: userIds[3],
            status: 0,
            pendingOn: 0,
            description: 'Akun di-suspend Google. Sedang proses appeal.',
        },
        {
            title: 'IG Account Hacked',
            customerId: customerIds[5],
            subscriptionId: subIds[9],
            assignedTo: userIds[7],
            status: 2,
            pendingOn: 0,
            description: 'Akun Instagram terkena hack. Sudah recovery semua aspek akun.',
        },
        {
            title: 'YouTube Channel Limited',
            customerId: customerIds[1],
            subscriptionId: subIds[3],
            assignedTo: userIds[5],
            status: 0,
            pendingOn: 0,
            description: 'Channel di-limited oleh YouTube. Menunggu review dari tim support.',
        },
        {
            title: 'Low Engagement on TikTok',
            customerId: customerIds[2],
            subscriptionId: subIds[5],
            assignedTo: userIds[6],
            status: 1,
            pendingOn: 0,
            description: 'Engagement rate drop 50% dalam 2 minggu. Perlu analyze trending content.',
        },
        {
            title: 'Billing Issue',
            customerId: customerIds[6],
            subscriptionId: subIds[10],
            assignedTo: userIds[8],
            status: 3,
            pendingOn: 0,
            description: 'Invoice tidak sesuai dengan proposal. Sudah resolve dengan klien.',
        },
        {
            title: 'Attribution Tracking Error',
            customerId: customerIds[7],
            subscriptionId: subIds[12],
            assignedTo: userIds[10],
            status: 0,
            pendingOn: 1,
            description: 'UTM parameters tidak tercatat dengan benar di GA4. Debug ongoing.',
        },
        {
            title: 'Competitor Analysis Needed',
            customerId: customerIds[9],
            subscriptionId: subIds[14],
            assignedTo: userIds[1],
            status: 1,
            pendingOn: 0,
            description: 'Klien minta analisis kompetitor di pasar travel. Research in progress.',
        },
        {
            title: 'SEO Audit Required',
            customerId: customerIds[10],
            subscriptionId: subIds[15],
            assignedTo: userIds[11],
            status: 0,
            pendingOn: 0,
            description: 'Website ranking drop. Perlu full SEO audit dan remediation plan.',
        },
        {
            title: 'Creative Asset Production',
            customerId: customerIds[8],
            subscriptionId: subIds[13],
            assignedTo: userIds[4],
            status: 2,
            pendingOn: 0,
            description: 'Sudah deliver 20 creative assets untuk TikTok campaign.',
        },
    ];

    const ticketIds: number[] = [];
    for (const t of ticketSeed) {
        const r = await db.insert(schema.ticketIssues).values(t);
        ticketIds.push(insertId(r));
    }
    console.log(`  ✓ ${ticketIds.length} tickets`);

    // ─── 8. MEETINGS ─────────────────────────────────────────────────
    console.log('📅 Creating meetings...');
    const meetingSeed = [
        {
            type: 0,
            title: 'Review Bulanan - Toko Baju April',
            date: new Date('2026-04-15 10:00:00'),
            customerId: customerIds[0],
            subscriptionId: subIds[0],
            assignedTo: userIds[0],
            description: 'Review performa iklan bulan April dan rencana Mei',
            summary: {
                points: [
                    'ROAS naik ke 5.8',
                    'Purchase target terlampaui',
                    'Perlu scale budget Mei',
                ],
            },
            actionItems: {
                items: ['Scale budget 20%', 'Test creative baru', 'A/B test landing page'],
            },
        },
        {
            type: 1,
            title: 'Onboarding - Rumah Kuliner',
            date: new Date('2026-03-01 09:00:00'),
            customerId: customerIds[1],
            subscriptionId: subIds[2],
            assignedTo: userIds[1],
            description: 'Meeting onboarding pertama dengan klien baru',
            summary: { points: ['Perkenalan tim', 'Bahas target bisnis', 'Setup akun Google Ads'] },
            actionItems: {
                items: ['Buat akun Google Ads', 'Install conversion tracking', 'Riset keyword'],
            },
        },
        {
            type: 2,
            title: 'Quarterly Review - Bengkel Jaya',
            date: new Date('2026-04-10 14:00:00'),
            customerId: customerIds[3],
            subscriptionId: subIds[6],
            assignedTo: userIds[0],
            description: 'Review performa Q1 2026 dan strategi Q2',
            summary: {
                points: ['CTA WA meningkat 40% QoQ', 'CPW turun 15%', 'Audience baru ditemukan'],
            },
            actionItems: {
                items: [
                    'Expand ke audience lookalike',
                    'Test video creative',
                    'Renegosiasi budget',
                ],
            },
        },
        {
            type: 0,
            title: 'Review Mingguan - Salon Cantik',
            date: new Date('2026-04-17 11:00:00'),
            customerId: customerIds[2],
            subscriptionId: subIds[4],
            assignedTo: userIds[2],
            description: 'Check-in mingguan performa TikTok Ads',
            summary: {
                points: [
                    'Leads naik 10%',
                    'CPL masih di atas target',
                    'Creative baru perform lebih baik',
                ],
            },
            actionItems: {
                items: [
                    'Pause creative lama',
                    'Duplicate creative terbaik',
                    'Optimize bid strategy',
                ],
            },
        },
        {
            type: 1,
            title: 'Presentasi Hasil - Apotek Sehat',
            date: new Date('2026-04-05 15:00:00'),
            customerId: customerIds[4],
            subscriptionId: subIds[8],
            assignedTo: userIds[3],
            description: 'Presentasi hasil akhir masa kontrak',
            summary: {
                points: [
                    'Recap 6 bulan performa',
                    'ROI positif meski akun sempat suspended',
                    'Klien minta perpanjang',
                ],
            },
            actionItems: { items: ['Buat proposal renewal', 'Siapkan case study'] },
        },
        {
            type: 0,
            title: 'Strategy Session - Fashion Store',
            date: new Date('2026-04-18 13:30:00'),
            customerId: customerIds[6],
            subscriptionId: subIds[10],
            assignedTo: userIds[8],
            description: 'Diskusi strategi H2 2026 dan scaling plan',
            summary: {
                points: [
                    'Target 2x revenue growth',
                    'Expand ke marketplace baru',
                    'Testing paid partnership',
                ],
            },
            actionItems: {
                items: ['Market research', 'Create 50 new creatives', 'Negotiate vendor deals'],
            },
        },
        {
            type: 1,
            title: 'Onboarding - Gym Fitness',
            date: new Date('2026-04-01 09:00:00'),
            customerId: customerIds[7],
            subscriptionId: subIds[12],
            assignedTo: userIds[10],
            description: 'First meeting dengan klien baru',
            summary: {
                points: [
                    'Target audiens: 25-40 tahun',
                    'Budget Rp 10jt/bulan',
                    'Mulai campaign minggu depan',
                ],
            },
            actionItems: {
                items: [
                    'Setup landing page',
                    'Buat conversion tracking',
                    'Kalibrasi audience targeting',
                ],
            },
        },
        {
            type: 2,
            title: 'Quarterly Review - Restaurant OK',
            date: new Date('2026-04-12 15:00:00'),
            customerId: customerIds[8],
            subscriptionId: subIds[13],
            assignedTo: userIds[4],
            description: 'Review Q1 performance dan plan Q2',
            summary: {
                points: ['TikTok views 500k', 'Order inquiries up 120%', 'CPM harus lower'],
            },
            actionItems: {
                items: [
                    'Optimize bid strategy',
                    'Test new creative format',
                    'Expand organic content',
                ],
            },
        },
        {
            type: 0,
            title: 'Strategy - Travel Agency',
            date: new Date('2026-04-14 10:00:00'),
            customerId: customerIds[9],
            subscriptionId: subIds[14],
            assignedTo: userIds[1],
            description: 'Seasonal campaign planning',
            summary: {
                points: [
                    'Summer package promotion',
                    'Video content strategy',
                    'Influencer collaboration',
                ],
            },
            actionItems: {
                items: [
                    'Produce 10 video content',
                    'Reach out influencers',
                    'Create landing pages',
                ],
            },
        },
        {
            type: 1,
            title: 'Onboarding - Beauty Products',
            date: new Date('2026-03-15 11:00:00'),
            customerId: customerIds[13],
            subscriptionId: subIds[18],
            assignedTo: userIds[7],
            description: 'Welcome meeting dengan brand baru',
            summary: {
                points: ['E-commerce focus', 'Multi-platform strategy', 'Budget Rp 15jt/bulan'],
            },
            actionItems: {
                items: [
                    'Product listing optimization',
                    'Create product videos',
                    'Influencer briefing',
                ],
            },
        },
    ];

    const meetingIds: number[] = [];
    for (const m of meetingSeed) {
        const r = await db.insert(schema.meetings).values({
            ...m,
            members: null,
            newTarget: null,
            newKpi: null,
            checklist: null,
            dataJson: null,
        });
        const mid = insertId(r);
        meetingIds.push(mid);
        // Add meeting members
        const members = new Set([m.assignedTo]);
        for (let j = 0; j < 2; j++) {
            members.add(rand(userIds));
        }
        for (const uid of Array.from(members)) {
            await db.insert(schema.meetingMembers).values({ meetingId: mid, userId: uid });
        }
    }
    console.log(`  ✓ ${meetingIds.length} meetings`);

    // ─── 9. TODOS ────────────────────────────────────────────────────
    console.log('✅ Creating todos...');
    const todoSeed: any[] = [];
    const todoTypes = [
        {
            type: 0,
            titles: [
                'Analisis ROAS',
                'Update data conversion',
                'Audit pixel tracking',
                'Test new audience',
            ],
        },
        {
            type: 1,
            titles: [
                'Kirim MOM meeting',
                'Follow up action items',
                'Update roadmap',
                'Prepare proposal',
            ],
        },
        {
            type: 2,
            titles: [
                'Fix technical issue',
                'Investigate drop',
                'Debug tracking',
                'Resolve account issue',
            ],
        },
        {
            type: 3,
            titles: [
                'Buat laporan bulanan',
                'Update konten creative',
                'Riset kompetitor',
                'Buat proposal',
            ],
        },
    ];

    for (let t = 0; t < 4; t++) {
        for (let i = 0; i < 9; i++) {
            const sub = rand(subIds);
            const cs = customerIds.find((_, idx) =>
                subIds.some((s, si) => s === sub && idx <= Math.floor(si / 1.3))
            );
            todoSeed.push({
                type: t,
                title: rand(todoTypes[t].titles),
                assignedTo: rand(userIds),
                customerId: cs,
                subscriptionId: sub,
                status: randInt(0, 3),
                priority: randInt(1, 3),
                startDate: fmtDate(addDays(today, randInt(-30, 5))),
                dueDate: fmtDate(addDays(today, randInt(1, 30))),
                platform: rand(['Meta Ads', 'Google Ads', 'TikTok', 'Instagram', null]),
                isRecurring: randInt(0, 1),
            });
        }
    }

    const todoIds: number[] = [];
    for (const t of todoSeed) {
        const r = await db.insert(schema.todos).values({
            ...t,
            scorecardId: null,
            meetingId: null,
            ticketIssueId: null,
            scorecardDataId: null,
            pic: 0,
            tags: 'digital-marketing',
            description: `Todo: ${t.title}`,
            subTask: null,
            checklist: null,
            dataJson: null,
        });
        todoIds.push(insertId(r));
    }
    console.log(`  ✓ ${todoIds.length} todos`);

    // ─── 10. REPEAT TASKS ────────────────────────────────────────────
    console.log('🔁 Creating repeat tasks...');
    const repeatTypes = [0, 1, 2];
    const repeatSeed: any[] = [];
    for (let i = 0; i < 9; i++) {
        repeatSeed.push({
            todoId: todoIds[randInt(0, todoIds.length - 1)],
            type: rand(repeatTypes),
            status: randInt(0, 1),
        });
    }

    const repeatIds: number[] = [];
    for (const rp of repeatSeed) {
        const r = await db.insert(schema.repeatTasks).values(rp);
        repeatIds.push(insertId(r));
    }
    console.log(`  ✓ ${repeatIds.length} repeat tasks`);

    // ─── 11. TODO REPEAT HISTORIES ───────────────────────────────────
    console.log('📋 Creating repeat histories...');
    for (let ri = 0; ri < repeatIds.length; ri++) {
        const rpt = repeatSeed[ri];
        const todoIdx = todoIds.indexOf(rpt.todoId);
        const origTodo = todoIdx >= 0 ? todoSeed[todoIdx] : null;
        for (let h = 1; h <= 3; h++) {
            const daysAgo = (3 - h + 1) * (rpt.type === 0 ? 1 : rpt.type === 1 ? 7 : 30);
            await db.insert(schema.todoRepeatHistories).values({
                repeatTaskId: repeatIds[ri],
                occurrenceDate: fmtDate(addDays(today, -daysAgo)),
                type: origTodo?.type ?? 3,
                title: `[History #${h}] ${origTodo?.title ?? 'Task'}`,
                customerId: origTodo?.customerId ?? null,
                subscriptionId: origTodo?.subscriptionId ?? null,
                assignedTo: origTodo?.assignedTo ?? userIds[0],
                pic: 0,
                scorecardId: null,
                scorecardDataId: null,
                meetingId: null,
                ticketIssueId: null,
                description: `Repeat history ke-${h}`,
                status: h < 3 ? 2 : 1,
                subTask: null,
                checklist: null,
                startDate: fmtDate(addDays(today, -daysAgo)),
                dueDate: fmtDate(
                    addDays(today, -daysAgo + (rpt.type === 0 ? 1 : rpt.type === 1 ? 7 : 30))
                ),
                priority: origTodo?.priority ?? 1,
                tags: 'repeat',
                platform: origTodo?.platform ?? null,
                isRecurring: 1,
                dataJson: null,
            });
        }
    }
    console.log(`  ✓ ${repeatIds.length * 3} repeat histories`);

    // ─── Summary ─────────────────────────────────────────────────────
    console.log('\n✅ Seed selesai!');
    console.log('─────────────────────────────────');
    console.log(`Users         : ${userIds.length}`);
    console.log(`Customers     : ${customerIds.length}`);
    console.log(`Products      : ${productIds.length}`);
    console.log(`Subscriptions : ${subIds.length}`);
    console.log(`Scorecards    : ${scorecardIds.length}`);
    console.log(`Scorecard Data: ${totalScorecardDataRows} (monthly/weekly/daily)`);
    console.log(`Tickets       : ${ticketIds.length}`);
    console.log(`Meetings      : ${meetingIds.length}`);
    console.log(`Todos         : ${todoIds.length}`);
    console.log(`Repeat Tasks  : ${repeatIds.length}`);
    console.log(`Repeat Hist.  : ${repeatIds.length * 3}`);
    console.log('\nTest login:');
    console.log('  andi.pratama@vauto.id / password123');
    console.log('  budi.santoso@vauto.id / password123');
    console.log('  indriani.putri@vauto.id / password123');

    await connection.end();
}

main().catch((err) => {
    console.error('❌ Error:', err.message ?? err);
    process.exit(1);
});
