import { NextResponse } from 'next/server';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';

/** 500 KB — generous for text-heavy documents, blocks multi-MB scans. */
const MAX_FILE_BYTES = 500 * 1024;

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const POST = apiHandler(async (req: Request) => {
  if (!rateLimit(`parse-file:${clientKey(req)}`, 20, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) throw new ApiError(400, 'Expected multipart/form-data');

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new ApiError(400, 'Missing "file" field');
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError(413, `File too large (${Math.round(file.size / 1024)} KB). Maximum is 500 KB.`);
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ApiError(
      415,
      `Unsupported file type "${file.type}". This endpoint handles PDF and DOCX only.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = '';

  if (file.type === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = (result.text || '').trim();
    await parser.destroy();
  } else {
    // DOCX → plain text via mammoth
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = (result.value || '').trim();
  }

  if (!text) {
    throw new ApiError(422, 'Could not extract any text from this file. It may be image-only or empty.');
  }

  return NextResponse.json({
    text,
    filename: file.name,
    chars: text.length,
  });
});
