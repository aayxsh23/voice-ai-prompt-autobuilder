import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Resetting / clearing existing data...');
  await prisma.promptQualityIssue.deleteMany();
  await prisma.testScenario.deleteMany();
  await prisma.promptVersion.deleteMany();
  await prisma.knowledgeBaseNote.deleteMany();
  await prisma.suggestedFunction.deleteMany();
  await prisma.dynamicVariable.deleteMany();
  await prisma.promptProject.deleteMany();
  await prisma.builderSession.deleteMany();
  await prisma.user.deleteMany();

  console.log('Creating default user...');
  const user = await prisma.user.create({
    data: {
      id: 'default-user-id',
      name: 'Alex Rivera (Prompt Architect)',
      email: 'alex.rivera@voiceagentbuilder.ai',
    },
  });

  console.log('Database seed completed (user created; no sample projects added).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
