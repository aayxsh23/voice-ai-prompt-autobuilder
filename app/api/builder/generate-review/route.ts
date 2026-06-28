import { NextResponse } from 'next/server';
import { compilePromptPackage } from '@/lib/pipeline/promptCompiler';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const draft = await compilePromptPackage(body);
    return NextResponse.json(draft);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
