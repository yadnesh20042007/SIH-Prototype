/* eslint-disable @typescript-eslint/no-require-imports -- Prisma seed runs directly in Node CommonJS. */
const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const prototypeRuleset = {
  standard: 'OIML R76-1',
  version: '2006',
  effectiveDate: new Date('2006-01-01T00:00:00.000Z'),
  notes: 'Development bootstrap record for the currently implemented prototype ruleset.',
  isActive: true,
};

const developmentTechnician = {
  name: 'Development Lab Technician',
  email: 'dev.lab.technician@nawi-r76.local',
  role: Role.LAB_TECHNICIAN,
  active: true,
  deletedAt: null,
};

const developmentReviewer = {
  name: 'Development Reviewing Officer',
  email: 'dev.reviewing.officer@nawi-r76.local',
  role: Role.REVIEWING_OFFICER,
  active: true,
  deletedAt: null,
};

const developmentApprover = {
  name: 'Development Approving Officer',
  email: 'dev.approving.officer@nawi-r76.local',
  role: Role.APPROVING_OFFICER,
  active: true,
  deletedAt: null,
};

const developmentAdmin = {
  name: 'Development Administrator',
  email: 'dev.admin@nawi-r76.local',
  role: Role.ADMIN,
  active: true,
  deletedAt: null,
};

function requireDemoPassword(name) {
  const password = process.env[name];
  if (!password || password.length < 12) {
    throw new Error(`${name} must be set to a development-only password of at least 12 characters`);
  }
  return password;
}

async function seededUser(user, passwordVariable) {
  return {
    ...user,
    passwordHash: await bcrypt.hash(requireDemoPassword(passwordVariable), 12),
  };
}

async function main() {
  const technician = await seededUser(developmentTechnician, 'DEMO_TECHNICIAN_PASSWORD');
  const reviewer = await seededUser(developmentReviewer, 'DEMO_REVIEWER_PASSWORD');
  const approver = await seededUser(developmentApprover, 'DEMO_APPROVER_PASSWORD');
  const admin = await seededUser(developmentAdmin, 'DEMO_ADMIN_PASSWORD');

  await prisma.rulesetVersion.upsert({
    where: {
      standard_version: {
        standard: prototypeRuleset.standard,
        version: prototypeRuleset.version,
      },
    },
    update: prototypeRuleset,
    create: prototypeRuleset,
  });

  await prisma.user.upsert({
    where: { email: developmentTechnician.email },
    update: technician,
    create: technician,
  });

  await prisma.user.upsert({
    where: { email: developmentReviewer.email },
    update: reviewer,
    create: reviewer,
  });

  await prisma.user.upsert({
    where: { email: developmentApprover.email },
    update: approver,
    create: approver,
  });

  await prisma.user.upsert({
    where: { email: admin.email },
    update: admin,
    create: admin,
  });

  console.log(
    'Development bootstrap complete: prototype ruleset and four role accounts are available.'
  );
}

main()
  .catch((error) => {
    console.error('Development bootstrap failed.');
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
