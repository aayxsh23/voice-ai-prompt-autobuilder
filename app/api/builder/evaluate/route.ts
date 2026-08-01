import { NextResponse } from 'next/server';
import { llmClient } from '@/lib/llm/llmProvider';

export async function POST(req: Request) {
  try {
    const { form, sessionId } = await req.json();

    const systemPrompt = `You are a critical Prompt Architect Judge.
Your job is to review the user's initial configuration for an AI Voice Agent and identify if there are any ambiguous or incomplete areas before we generate the final system prompt.

Here is the data provided by the user:
\`\`\`json
${JSON.stringify(form, null, 2)}
\`\`\`

Analyze the data. If the workflow description is vague, or if there are logical gaps in how the agent should handle edge cases, list up to 3 clarifying questions you need to ask the user.
Return your answer in the following JSON format ONLY:
{
  "questions": ["Question 1?", "Question 2?"]
}
If the data is perfectly sufficient and detailed enough to write a production-grade system prompt, return an empty array for questions.`;

    const response = await llmClient.generate({
      systemInstruction: "You are an expert AI Voice Agent Architect.",
      prompt: systemPrompt,
      responseMimeType: "application/json"
    });

    let result = { questions: [] as string[] };
    try {
      if (response.text) {
        result = JSON.parse(response.text);
      }
    } catch (e) {
      console.error("Failed to parse LLM evaluation response:", e);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in evaluate route:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
