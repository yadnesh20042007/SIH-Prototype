/* eslint-disable @typescript-eslint/no-require-imports -- Prisma seed runs directly in Node CommonJS. */
const { PrismaClient, Role } = require('@prisma/client');

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
  passwordHash: 'DEVELOPMENT_ONLY_NO_AUTHENTICATION_CONFIGURED',
  role: Role.LAB_TECHNICIAN,
  active: true,
  deletedAt: null,
};

const developmentReviewer = {
  name: 'Development Reviewing Officer',
  email: 'dev.reviewing.officer@nawi-r76.local',
  passwordHash: 'DEVELOPMENT_ONLY_NO_AUTHENTICATION_CONFIGURED',
  role: Role.REVIEWING_OFFICER,
  active: true,
  deletedAt: null,
};

const developmentApprover = {
  name: 'Development Approving Officer',
  email: 'dev.approving.officer@nawi-r76.local',
  passwordHash: 'DEVELOPMENT_ONLY_NO_AUTHENTICATION_CONFIGURED',
  role: Role.APPROVING_OFFICER,
  active: true,
  deletedAt: null,
};

async function main() {
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
    update: developmentTechnician,
    create: developmentTechnician,
  });

  await prisma.user.upsert({
    where: { email: developmentReviewer.email },
    update: developmentReviewer,
    create: developmentReviewer,
  });

  await prisma.user.upsert({
    where: { email: developmentApprover.email },
    update: developmentApprover,
    create: developmentApprover,
  });

  console.log(
    'Development bootstrap complete: prototype ruleset, lab technician, reviewer, and approver are available.'
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
