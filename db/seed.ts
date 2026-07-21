import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { products, users } from '../lib/schema';
import { count, eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';

const SEED_PRODUCTS = [
  {
    name: 'Sample Product',
    status: 'active' as const,
    price: '49.00',
    stock: 100,
    availableAt: new Date()
  },
  {
    name: 'Another Product',
    status: 'active' as const,
    price: '99.00',
    stock: 50,
    availableAt: new Date()
  }
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  // Seed products
  const [{ value }] = await db.select({ value: count() }).from(products);
  if (value > 0) {
    console.log(
      `Skipping seed: products table already has ${value} rows.`
    );
  } else {
    console.log('Seeding products...');
    await db.insert(products).values(SEED_PRODUCTS);
    console.log(`Seeded ${SEED_PRODUCTS.length} products.`);
  }

  // Seed admin user (admin@admin.com / password)
  const passwordHash = await hash('password', 12);
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@admin.com'))
    .limit(1);

  if (existingAdmin) {
    await db
      .update(users)
      .set({ passwordHash, role: 'admin' })
      .where(eq(users.email, 'admin@admin.com'));
    console.log('Updated admin user password.');
  } else {
    await db.insert(users).values({
      name: 'Admin',
      email: 'admin@admin.com',
      passwordHash,
      role: 'admin'
    });
    console.log('Seeded admin user (admin@admin.com / password).');
  }

  await client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
