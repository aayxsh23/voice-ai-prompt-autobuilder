export class PromptCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptCompilationError';
  }
}
