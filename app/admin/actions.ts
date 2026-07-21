'use server';

import { db, users, products } from '@/lib/db';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function deleteUser(id: number) {
  await requireAdmin();
  await db.delete(users).where(eq(users.id, id));
  revalidatePath('/admin/users');
}

export async function deleteProduct(id: number) {
  await requireAdmin();
  await db.delete(products).where(eq(products.id, id));
  revalidatePath('/admin/products');
}

export async function updateUserRole(id: number, role: 'user' | 'admin') {
  await requireAdmin();
  await db.update(users).set({ role }).where(eq(users.id, id));
  revalidatePath('/admin/users');
}
