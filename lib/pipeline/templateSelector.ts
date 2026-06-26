import { USE_CASE_TEMPLATES, UseCaseTemplate } from '../templates';

export function selectTemplate(templateIdOrName: string): UseCaseTemplate {
  return (
    USE_CASE_TEMPLATES.find(
      (t) => t.id === templateIdOrName || t.name === templateIdOrName || t.name.toLowerCase().includes(templateIdOrName.toLowerCase())
    ) || USE_CASE_TEMPLATES[0]
  );
}

export function getAllTemplates(): UseCaseTemplate[] {
  return USE_CASE_TEMPLATES;
}
