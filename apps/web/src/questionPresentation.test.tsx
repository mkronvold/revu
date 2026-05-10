import { foundationSnapshotExample } from '@revu/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { toQuestionSetDraft } from './reviewAdmin';
import { buildQuestionCategorySuggestions, MarkdownContent } from './questionPresentation';

describe('question presentation helpers', () => {
  it('deduplicates persisted and draft categories for autocomplete suggestions', () => {
    const draft = toQuestionSetDraft(
      foundationSnapshotExample.reviewPeriods[0]!.id,
      'self',
      foundationSnapshotExample.questionSets[0],
    );
    draft.questions.push({
      id: 'new-question',
      order: 99,
      type: 'narrative',
      category: 'growth',
      prompt: 'What should grow next?',
    });

    expect(buildQuestionCategorySuggestions(['Teamwork', 'Growth', 'teamwork'], draft)).toEqual([
      'Growth',
      'Impact',
      'Teamwork',
    ]);
  });

  it('renders markdown with preserved line breaks', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent markdown={'**Strengths**\nSecond line'} className="markdown-content" />,
    );

    expect(markup).toContain('<strong>Strengths</strong>');
    expect(markup).toContain('<br/>');
    expect(markup).toContain('Second line');
  });

  it('renders markdown tables with header and body cells', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        markdown={'| Role | Action |\n| --- | --- |\n| Employee | Submit assessment |\n| Manager | Review submission |'}
        className="markdown-content"
      />,
    );

    expect(markup).toContain('<table>');
    expect(markup).toContain('<thead>');
    expect(markup).toContain('<th>Role</th>');
    expect(markup).toContain('<td>Submit assessment</td>');
    expect(markup).toContain('<td>Review submission</td>');
  });
});
