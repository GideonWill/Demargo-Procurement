import prisma from './prisma';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('Starting database seeding...');

  // 1. Seed Categories
  const categories = [
    { name: 'Curtain Materials', description: 'Fabric rolls, 100% blackout, 80% blackout, voiles, etc.' },
    { name: 'Curtain Accessories', description: 'Tie hooks, curtain runners, tracks, brackets, etc.' },
    { name: 'Blinds', description: 'Wooden, allusion, roman, venetian, zebra, roller, etc.' },
    { name: 'Automation', description: 'Motors, automated reels, remote controls, etc.' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { description: cat.description },
      create: cat,
    });
  }
  console.log('Seeding: Categories successfully seeded.');

  // 1.5. Seed Default Suppliers
  const suppliers = [
    { companyName: 'ANNA', name: 'Anna Representative', phone: '+233240000001', email: 'anna@suppliers.com', address: 'Accra, Ghana' },
    { companyName: 'RCB', name: 'RCB Representative', phone: '+233240000002', email: 'rcb@suppliers.com', address: 'Tema, Ghana' },
    { companyName: 'GARDEN SECRET', name: 'Garden Secret Rep', phone: '+233240000003', email: 'garden@suppliers.com', address: 'East Legon, Ghana' },
  ];

  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { email: s.email },
      update: { companyName: s.companyName, name: s.name, phone: s.phone, address: s.address },
      create: s,
    });
  }
  console.log('Seeding: Suppliers successfully seeded.');

  // 2. Seed Default Admin
  const adminEmail = 'admin@demargo.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'Demargo Administrator',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    console.log(`Seeding: Default Admin created (email: ${adminEmail}, password: admin123).`);
  } else {
    console.log('Seeding: Default Admin user already exists.');
  }

  console.log('Database seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
