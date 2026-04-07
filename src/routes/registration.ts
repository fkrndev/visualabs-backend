import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { customers, customerProfiles } from '../db/schema';
import { cleanEmail, cleanPhone } from '../utils/normalizers';
import { hashPassword } from '../utils/security';
import { sendRegistrationEmail } from '../utils/email';

const router = new Hono();

// Schema validasi untuk registrasi
const registrationPayload = z.object({
  name: z.string().min(3, 'Nama minimal 3 karakter'),
  email: z.email('Format email tidak valid'),
  phone: z.string().min(8, 'Nomor HP minimal 8 digit'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
});


/**
 * POST /api/public/registration
 * Endpoint untuk registrasi customer baru (public)
 */
router.post('/', zValidator('json', registrationPayload), async (c) => {
  const payload = c.req.valid('json');

  const { name, email: rawEmail, phone: rawPhone, password } = payload;

  // Normalisasi data
  const email = cleanEmail(rawEmail);
  const phone = cleanPhone(rawPhone);
  const hashedPassword = await hashPassword(password);

  try {
    // Cek apakah email sudah terdaftar
    const existingEmail = await db.query.customers.findFirst({
      columns: { id: true },
      where: eq(customers.email, email),
    });

    if (existingEmail) {
      return c.json(
        {
          success: false,
          message: 'Email sudah terdaftar. Silakan gunakan email lain atau login.',
        },
        409
      );
    }

    // Cek apakah phone sudah terdaftar
    const existingPhone = await db.query.customers.findFirst({
      columns: { id: true },
      where: eq(customers.phone, phone),
    });

    if (existingPhone) {
      return c.json(
        {
          success: false,
          message: 'Nomor HP sudah terdaftar. Silakan gunakan nomor lain atau login.',
        },
        409
      );
    }

    // Insert customer baru
    const [insertResult] = await db.insert(customers).values({
      email,
      phone,
      password: hashedPassword,
      username: null,
      fbid: null,
      googleId: null,
      dataJson: null,
    });

    const insertId = Number(insertResult.insertId);

    // Insert customer profile
    await db.insert(customerProfiles).values({
      customerId: insertId,
      name,
      email: rawEmail,
      phone: rawPhone,
    });

    // Ambil data customer yang baru dibuat
    const createdRows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(eq(customers.id, insertId))
      .limit(1);

    const createdRow = createdRows[0];
    const created = createdRow
      ? {
          id: (createdRow as any).customer.id,
          email: (createdRow as any).customer.email,
          phone: (createdRow as any).customer.phone,
          profile: (createdRow as any).profile ?? null,
        }
      : null;

    // Kirim email notifikasi registrasi (async, tidak perlu menunggu)
    if (email) {
      sendRegistrationEmail(name, rawEmail).catch((error) => {
        console.error('Gagal mengirim email registrasi:', error);
        // Tidak perlu throw error, karena registrasi sudah berhasil
      });
    }

    return c.json(
      {
        success: true,
        message: 'Registrasi berhasil! Silakan login dengan akun Anda.',
        data: created,
      },
      201
    );
  } catch (error: any) {
    console.error('Error saat registrasi:', error);

    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json(
        {
          success: false,
          message: 'Data sudah terdaftar. Silakan gunakan data lain.',
        },
        409
      );
    }

    return c.json(
      {
        success: false,
        message: 'Terjadi kesalahan saat registrasi. Silakan coba lagi.',
      },
      500
    );
  }
});

export default router;
