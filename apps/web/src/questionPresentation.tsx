import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import type { QuestionSetDraft } from './reviewAdmin';

export const questionCategorySuggestionsId = 'question-category-suggestions';

function compareCategories(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' }) || left.localeCompare(right);
}

export function buildQuestionCategorySuggestions(
  persistedCategories: string[],
  questionSetDraft: QuestionSetDraft | null,
) {
  const suggestions = new Map<string, string>();

  for (const category of [
    ...persistedCategories,
    ...(questionSetDraft?.questions.map((question) => question.category) ?? []),
  ]) {
    const trimmed = category.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = trimmed.toLocaleLowerCase();
    if (!suggestions.has(normalized)) {
      suggestions.set(normalized, trimmed);
    }
  }

  return Array.from(suggestions.values()).sort(compareCategories);
}

type MarkdownContentProps = {
  markdown: string;
  className?: string;
};

export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{markdown}</ReactMarkdown>
    </div>
  );
}
