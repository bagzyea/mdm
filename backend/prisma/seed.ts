import { PrismaClient, DeviceStatus, PolicyType, CommandStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting MDM database seed...');

  // ─── Policies ────────────────────────────────────────────────────────────────
  const securityPolicy = await prisma.policy.upsert({
    where: { id: 'seed-policy-security' },
    update: {},
    create: {
      id: 'seed-policy-security',
      name: 'Standard Security Policy',
      description: 'Enforces password requirements, encryption, and screen lock across all devices.',
      type: PolicyType.SECURITY,
      rules: {
        security: {
          passwordRequired: true,
          passwordMinLength: 8,
          passwordComplexity: 'complex',
          passwordExpiry: 90,
          maxFailedAttempts: 5,
          lockoutDuration: 30,
          encryptionRequired: true,
          screenLockTimeout: 5,
          biometricAllowed: true,
          automaticLock: true
        }
      },
      targetDevices: [],
      priority: 10,
      isActive: true
    }
  });

  const networkPolicy = await prisma.policy.upsert({
    where: { id: 'seed-policy-network' },
    update: {},
    create: {
      id: 'seed-policy-network',
      name: 'Corporate Network Policy',
      description: 'Restricts device connectivity to approved networks and requires VPN.',
      type: PolicyType.NETWORK,
      rules: {
        network: {
          wifiRestrictions: {
            allowedNetworks: ['UBOS-Corporate', 'UBOS-Guest'],
            requireCertificate: false,
            allowPersonalHotspot: false
          },
          vpnRequired: false,
          cellularDataAllowed: true,
          roamingAllowed: false,
          bluetoothAllowed: true
        }
      },
      targetDevices: [],
      priority: 8,
      isActive: true
    }
  });

  const appPolicy = await prisma.policy.upsert({
    where: { id: 'seed-policy-app' },
    update: {},
    create: {
      id: 'seed-policy-app',
      name: 'Application Control Policy',
      description: 'Controls which applications can be installed and run on managed devices.',
      type: PolicyType.APPLICATION,
      rules: {
        application: {
          appBlacklist: ['com.facebook.katana', 'com.instagram.android', 'com.twitter.android'],
          allowAppInstallation: false,
          allowUnknownSources: false,
          allowAppUninstall: false,
          kioskMode: {
            enabled: false,
            allowedApps: []
          }
        }
      },
      targetDevices: [],
      priority: 7,
      isActive: true
    }
  });

  const compliancePolicy = await prisma.policy.upsert({
    where: { id: 'seed-policy-compliance' },
    update: {},
    create: {
      id: 'seed-policy-compliance',
      name: 'Device Compliance Policy',
      description: 'Ensures devices meet minimum OS version and security standards.',
      type: PolicyType.COMPLIANCE,
      rules: {
        compliance: {
          requiredOSVersion: '10.0',
          jailbreakDetection: true,
          deviceHealthChecks: true,
          locationServicesRequired: true,
          backupRequired: true,
          updatePolicy: {
            automatic: true,
            delayDays: 7
          }
        }
      },
      targetDevices: [],
      priority: 9,
      isActive: true
    }
  });

  console.log(`✅ Created ${4} policies`);

  // ─── Devices ─────────────────────────────────────────────────────────────────
  const devices = [
    {
      id: 'seed-device-001',
      deviceId: 'UBOS-DEV-001',
      manufacturer: 'Samsung',
      model: 'Galaxy A54',
      androidVersion: '13.0',
      sdkVersion: 33,
      fingerprint: 'samsung/a54/a54:13/TP1A.220624.014/A546BXXU4CWK2:user/release-keys-001',
      status: DeviceStatus.ACTIVE,
      assignedTo: 'John Mukasa',
    },
    {
      id: 'seed-device-002',
      deviceId: 'UBOS-DEV-002',
      manufacturer: 'Samsung',
      model: 'Galaxy A34',
      androidVersion: '13.0',
      sdkVersion: 33,
      fingerprint: 'samsung/a34/a34:13/TP1A.220624.014/A346BXXU3CWJ1:user/release-keys-002',
      status: DeviceStatus.ACTIVE,
      assignedTo: 'Sarah Namukasa',
    },
    {
      id: 'seed-device-003',
      deviceId: 'UBOS-DEV-003',
      manufacturer: 'Tecno',
      model: 'Spark 10 Pro',
      androidVersion: '12.0',
      sdkVersion: 31,
      fingerprint: 'tecno/spark10pro/spark10pro:12/SP1A.210812.016/230301:user/release-keys-003',
      status: DeviceStatus.INACTIVE,
      assignedTo: 'Peter Ssemwanga',
    },
    {
      id: 'seed-device-004',
      deviceId: 'UBOS-DEV-004',
      manufacturer: 'Infinix',
      model: 'Note 30',
      androidVersion: '13.0',
      sdkVersion: 33,
      fingerprint: 'infinix/note30/note30:13/TP1A.220624.014/230601:user/release-keys-004',
      status: DeviceStatus.ACTIVE,
      assignedTo: 'Grace Atuhaire',
    },
    {
      id: 'seed-device-005',
      deviceId: 'UBOS-DEV-005',
      manufacturer: 'Samsung',
      model: 'Galaxy Tab A8',
      androidVersion: '12.0',
      sdkVersion: 31,
      fingerprint: 'samsung/gta8/gta8:12/SP1A.210812.016/X200XXU3BWI1:user/release-keys-005',
      status: DeviceStatus.ENROLLED,
      assignedTo: 'David Ochieng',
    },
    {
      id: 'seed-device-006',
      deviceId: 'UBOS-DEV-006',
      manufacturer: 'Itel',
      model: 'A70',
      androidVersion: '12.0',
      sdkVersion: 31,
      fingerprint: 'itel/a70/a70:12/SP1A.210812.016/230101:user/release-keys-006',
      status: DeviceStatus.SUSPENDED,
      assignedTo: 'Mary Akello',
    },
  ];

  for (const device of devices) {
    await prisma.device.upsert({
      where: { deviceId: device.deviceId },
      update: {},
      create: {
        ...device,
        policies: {
          connect: [
            { id: securityPolicy.id },
            { id: compliancePolicy.id }
          ]
        }
      }
    });
  }

  console.log(`✅ Created ${devices.length} devices`);

  // ─── Device Events ────────────────────────────────────────────────────────────
  const createdDevices = await prisma.device.findMany({ take: 4 });

  for (const device of createdDevices) {
    await prisma.deviceEvent.createMany({
      data: [
        {
          deviceId: device.id,
          eventType: 'ENROLLMENT',
          eventData: { message: 'Device enrolled successfully', enrolledBy: 'admin' }
        },
        {
          deviceId: device.id,
          eventType: 'POLICY_APPLIED',
          eventData: { policyName: 'Standard Security Policy', appliedAt: new Date() }
        }
      ],
      skipDuplicates: true
    });
  }

  console.log(`✅ Created device events`);

  // ─── Sample Commands ──────────────────────────────────────────────────────────
  const firstDevice = await prisma.device.findFirst({ where: { deviceId: 'UBOS-DEV-001' } });
  const secondDevice = await prisma.device.findFirst({ where: { deviceId: 'UBOS-DEV-002' } });

  if (firstDevice && secondDevice) {
    await prisma.remoteCommand.createMany({
      data: [
        {
          deviceId: firstDevice.id,
          command: 'GET_DEVICE_INFO',
          status: CommandStatus.EXECUTED,
          result: { success: true, message: 'Device info retrieved', timestamp: new Date().toISOString() }
        },
        {
          deviceId: firstDevice.id,
          command: 'APPLY_POLICY',
          status: CommandStatus.EXECUTED,
          result: { success: true, message: 'Policy applied successfully', timestamp: new Date().toISOString() }
        },
        {
          deviceId: secondDevice.id,
          command: 'LOCATE_DEVICE',
          status: CommandStatus.EXECUTED,
          result: { success: true, data: { latitude: 0.3476, longitude: 32.5825 }, timestamp: new Date().toISOString() }
        },
        {
          deviceId: secondDevice.id,
          command: 'LOCK_DEVICE',
          status: CommandStatus.PENDING,
          parameters: { message: 'Device locked by admin' }
        }
      ]
    });
  }

  console.log(`✅ Created sample commands`);

  console.log('\n📊 MDM Seed Summary:');
  console.log(`   🔒 Policies: 4`);
  console.log(`   📱 Devices:  ${devices.length}`);
  console.log(`   ⚡ Events:   ${createdDevices.length * 2}`);
  console.log(`   📡 Commands: 4`);
  console.log('\n✅ MDM database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
