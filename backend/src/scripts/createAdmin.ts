// Script to create the first admin user
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('Creating first admin user...\n');

    // Check if any users exist
    const existingUsers = await prisma.user.count();
    
    if (existingUsers > 0) {
      console.log('❌ Users already exist in the system. This script should only be run once during initial setup.');
      process.exit(1);
    }

    // Admin user details
    const adminData = {
      username: 'admin',
      email: 'admin@mdm.local',
      password: 'Admin123!@#', // Strong default password
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN' as const
    };

    // Hash password
    const hashedPassword = await bcrypt.hash(adminData.password, 12);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        username: adminData.username,
        email: adminData.email,
        password: hashedPassword,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        isActive: true
      }
    });

    console.log('✅ Admin user created successfully!\n');
    console.log('📋 Admin User Details:');
    console.log(`   👤 Username: ${adminData.username}`);
    console.log(`   📧 Email: ${adminData.email}`);
    console.log(`   🔑 Password: ${adminData.password}`);
    console.log(`   🏷️  Role: ${adminData.role}`);
    console.log(`   🆔 User ID: ${admin.id}\n`);
    
    console.log('🔐 Security Notes:');
    console.log('   • Please change the default password after first login');
    console.log('   • Consider creating additional admin users and deactivating this account');
    console.log('   • Store these credentials securely\n');

    console.log('🚀 Next Steps:');
    console.log('   1. Start the MDM server: npm run dev');
    console.log('   2. Login at: POST /api/auth/login');
    console.log('   3. Create additional users via: POST /api/auth/register');
    console.log('   4. Change default password via: POST /api/auth/change-password\n');

  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createAdminUser();