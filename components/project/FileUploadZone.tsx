'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   TYPES & CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

export interface UploadedFile {
  id: string;
  name: string;
  sizeBytes: number;
  status: 'parsing' | 'done' | 'error';
  text: string;
  error?: string;
}

/** Max individual file size in bytes (500 KB). */
const MAX_FILE_BYTES = 500 * 1024;

/** Max number of files the user can attach. */
const MAX_FILES = 3;

/** Extensions readable client-side (no server round-trip). */
const CLIENT_EXTENSIONS = new Set(['.txt', '.md', '.csv']);

/** Extensions that need the server parse-file endpoint. */
const SERVER_EXTENSIONS = new Set(['.pdf', '.docx']);

const ALL_EXTENSIONS = new Set([...CLIENT_EXTENSIONS, ...SERVER_EXTENSIONS]);

const ACCEPT_STRING = [
  'text/plain',
  'text/markdown',
  'text/csv',
  '.md',
  '.csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

interface FileUploadZoneProps {
  files: UploadedFile[];
  onFilesChange: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  onTextExtracted: (text: string, filename: string) => void;
  onFileRemoved?: (file: UploadedFile) => void;
  disabled?: boolean;
}

export function FileUploadZone({
  files,
  onFilesChange,
  onTextExtracted,
  onFileRemoved,
  disabled = false,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileToRemove, setFileToRemove] = useState<UploadedFile | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      const ext = fileExtension(file.name);

      // Validation — rejected files are shown as error entries
      if (!ALL_EXTENSIONS.has(ext)) {
        const entry: UploadedFile = {
          id: uid(),
          name: file.name,
          sizeBytes: file.size,
          status: 'error',
          text: '',
          error: `Unsupported file type "${ext}". Use TXT, MD, CSV, PDF, or DOCX.`,
        };
        onFilesChange((prev) => [...prev, entry]);
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        const entry: UploadedFile = {
          id: uid(),
          name: file.name,
          sizeBytes: file.size,
          status: 'error',
          text: '',
          error: `File too large (${formatSize(file.size)}). Maximum is 500 KB.`,
        };
        onFilesChange((prev) => [...prev, entry]);
        return;
      }

      // Create a "parsing" entry
      const entryId = uid();
      const parsingEntry: UploadedFile = {
        id: entryId,
        name: file.name,
        sizeBytes: file.size,
        status: 'parsing',
        text: '',
      };

      onFilesChange((prev) => [...prev, parsingEntry]);

      try {
        let extractedText = '';

        if (CLIENT_EXTENSIONS.has(ext)) {
          // Read text files client-side — no server round-trip
          extractedText = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || '');
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsText(file);
          });
        } else {
          // Send PDF/DOCX to the server for extraction
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/builder/parse-file', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `Server error (${res.status})`);
          }

          const body = await res.json();
          extractedText = body.text || '';
        }

        extractedText = extractedText.trim();

        if (!extractedText) {
          throw new Error('No text could be extracted from this file.');
        }

        // Update the parsing entry → done
        const doneEntry: UploadedFile = {
          id: entryId,
          name: file.name,
          sizeBytes: file.size,
          status: 'done',
          text: extractedText,
        };
        onFilesChange((prev) =>
          prev.map((f) => (f.id === entryId ? doneEntry : f)),
        );

        onTextExtracted(extractedText, file.name);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to parse file';
        const errorEntry: UploadedFile = {
          id: entryId,
          name: file.name,
          sizeBytes: file.size,
          status: 'error',
          text: '',
          error: errorMsg,
        };
        onFilesChange((prev) =>
          prev.map((f) => (f.id === entryId ? errorEntry : f)),
        );
      }
    },
    [onFilesChange, onTextExtracted],
  );

  const handleFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      const remaining = MAX_FILES - files.length;
      const toProcess = arr.slice(0, Math.max(0, remaining));

      toProcess.forEach((f) => {
        void processFile(f);
      });
    },
    [files.length, processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || files.length >= MAX_FILES) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, files.length, handleFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleFiles(e.target.files);
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [handleFiles],
  );

  const removeFile = useCallback(
    (file: UploadedFile) => {
      setFileToRemove(file);
    },
    [],
  );

  const confirmRemove = useCallback(() => {
    if (!fileToRemove) return;
    onFilesChange((prev) => prev.filter((f) => f.id !== fileToRemove.id));
    if (onFileRemoved) {
      onFileRemoved(fileToRemove);
    }
    setFileToRemove(null);
  }, [fileToRemove, onFilesChange, onFileRemoved]);

  const atLimit = files.length >= MAX_FILES;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled || atLimit ? -1 : 0}
        aria-label="Upload files"
        aria-disabled={disabled || atLimit}
        onClick={() => !disabled && !atLimit && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !atLimit) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !atLimit) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center gap-2
          rounded-lg border-2 border-dashed px-4 py-6
          transition-colors cursor-pointer
          ${dragOver
            ? 'border-accent bg-accent/5'
            : disabled || atLimit
              ? 'border-line bg-subtle cursor-not-allowed opacity-60'
              : 'border-line-strong hover:border-accent hover:bg-accent/[0.02]'
          }
        `}
      >
        <Upload
          className={`w-6 h-6 ${dragOver ? 'text-accent' : 'text-faint'}`}
          aria-hidden="true"
        />
        <p className="text-[13px] text-graphite text-center">
          {atLimit
            ? `Maximum ${MAX_FILES} files reached`
            : 'Drop files here or click to browse'}
        </p>
        <p className="text-[11px] text-faint text-center">
          PDF, DOCX, TXT, MD, CSV · Max 500 KB each · Up to {MAX_FILES} files
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_STRING}
          multiple
          className="sr-only"
          onChange={handleInputChange}
          disabled={disabled || atLimit}
          tabIndex={-1}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-1.5" aria-label="Uploaded files">
          {files.map((f) => (
            <li
              key={f.id}
              className={`
                flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px]
                ${f.status === 'error'
                  ? 'border-warning/30 bg-warning-soft'
                  : 'border-line bg-subtle'
                }
              `}
            >
              {/* Icon */}
              {f.status === 'parsing' ? (
                <Loader2
                  className="w-4 h-4 text-graphite animate-spin shrink-0"
                  aria-hidden="true"
                />
              ) : f.status === 'error' ? (
                <AlertCircle
                  className="w-4 h-4 text-warning shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle
                  className="w-4 h-4 text-success shrink-0"
                  aria-hidden="true"
                />
              )}

              {/* Name & meta */}
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {f.name}
                </span>
                {f.status === 'error' && f.error ? (
                  <span className="block text-[11px] text-warning">
                    {f.error}
                  </span>
                ) : f.status === 'done' ? (
                  <span className="block text-[11px] text-faint">
                    {formatSize(f.sizeBytes)} · {f.text.length.toLocaleString()} chars extracted
                  </span>
                ) : (
                  <span className="block text-[11px] text-faint">
                    Parsing…
                  </span>
                )}
              </div>

              {/* Remove */}
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f);
                }}
                className="p-1 text-faint hover:text-ink transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Confirmation Modal */}
      {fileToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lg">
            <h3 className="text-[15px] font-semibold text-ink mb-2">Remove file?</h3>
            <p className="text-[13px] text-graphite mb-5">
              Removing this file will also delete its extracted text from the content box below.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setFileToRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary !bg-warning !border-warning !text-white hover:!bg-warning/90"
                onClick={confirmRemove}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
