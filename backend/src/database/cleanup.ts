import prisma from './prisma';

async function main() {
  console.log('--- Database Transaction Reset ---');
  
  // 1. Delete all payments
  const payments = await prisma.payment.deleteMany({});
  console.log(`Deleted ${payments.count} payments.`);

  // 2. Delete all purchase order items
  const poItems = await prisma.purchaseOrderItem.deleteMany({});
  console.log(`Deleted ${poItems.count} purchase order items.`);

  // 3. Delete all purchase orders
  const pos = await prisma.purchaseOrder.deleteMany({});
  console.log(`Deleted ${pos.count} purchase orders.`);

  // 4. Delete all project materials
  const projectMaterials = await prisma.projectMaterial.deleteMany({});
  console.log(`Deleted ${projectMaterials.count} project materials.`);

  // 5. Delete all projects
  const projects = await prisma.project.deleteMany({});
  console.log(`Deleted ${projects.count} projects.`);

  // 6. Delete all stock movements
  const movements = await prisma.stockMovement.deleteMany({});
  console.log(`Deleted ${movements.count} stock movements.`);

  // 7. Reset all product quantities available to 0
  const products = await prisma.product.updateMany({
    data: {
      quantityAvailable: 0,
    },
  });
  console.log(`Reset ${products.count} products to 0 stock.`);

  console.log('--- Reset Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
