import { NextResponse } from 'next/server';
import { compilePromptPackage } from '@/lib/pipeline/promptCompiler';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';

export const POST = apiHandler(async (req: Request) => {
  if (!rateLimit(`generate-review:${clientKey(req)}`, 10, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }
  const body = await req.json();
  const draft = await compilePromptPackage(body);
  return NextResponse.json(draft);
});
