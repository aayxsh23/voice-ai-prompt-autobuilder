import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const rules = await prisma.promptRule.findMany({
      where: {
        category: {
          contains: 'guardrail',
          mode: 'insensitive',
        }
      }
    });
    
    if (rules.length > 0) {
      console.log("Guardrails found in PromptRule:");
      console.log(JSON.stringify(rules, null, 2));
      return;
    }

    // If no guardrails specifically in category, let's just get all rules
    const allRules = await prisma.promptRule.findMany();
    console.log("All Rules in DB:");
    console.log(JSON.stringify(allRules, null, 2));
    
  } catch (error) {
    console.error("Error fetching rules:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();