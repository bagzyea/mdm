// Script to create admin user from environment variables
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function createEnvAdminUser() {
  try {
    console.log('Creating admin user from environment variables...\n');

    // Admin user details from environment
    const adminData = {
      username: 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@mdm.local',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
      lastName: process.env.ADMIN_LAST_NAME || 'User',
      role: 'SUPER_ADMIN' as const
    };

    console.log(`Admin credentials from environment:`);
    console.log(`Username: ${adminData.username}`);
    console.log(`Password: ${adminData.password}`);
    console.log(`Email: ${adminData.email}`);

    // Check if admin user already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { username: adminData.username }
    });

    let admin;
    
    if (existingAdmin) {
      // Update existing user with environment password
      const hashedPassword = await bcrypt.hash(adminData.password, 12);
      
      admin = await prisma.user.update({
        where: { username: adminData.username },
        data: {
          password: hashedPassword,
          email: adminData.email,
          firstName: adminData.firstName,
          lastName: adminData.lastName,
          role: adminData.role,
          isActive: true
        }
      });
      
      console.log('✅ Admin user updated with environment credentials!');
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminData.password, 12);
      
      admin = await prisma.user.create({
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
      
      console.log('✅ Admin user created with environment credentials!');
    }

    console.log(`\n🆔 User ID: ${admin.id}`);
    console.log(`🚀 You can now login with:`);
    console.log(`   Username: ${adminData.username}`);
    console.log(`   Password: ${adminData.password}\n`);

  } catch (error) {
    console.error('❌ Failed to create/update admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createEnvAdminUser();