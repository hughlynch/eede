// Pure logic for parsing Code Editor scripts into
// notebook cells. No VS Code dependencies — testable
// standalone.

export interface ParsedCell {
  language: string;
  source: string;
  kind: 'code' | 'markup';
}

export function parseCodeEditorScript(
  source: string
): ParsedCell[] {
  const trimmed = source.trim();
  if (!trimmed) {
    return [
      {
        language: 'javascript',
        source: '// Empty script',
        kind: 'code',
      },
    ];
  }

  const sections = splitIntoSections(trimmed);

  return sections.map((section) => {
    if (isPureComment(section)) {
      return {
        language: 'markdown',
        source: commentToMarkdown(section),
        kind: 'markup' as const,
      };
    }
    return {
      language: 'javascript',
      source: section,
      kind: 'code' as const,
    };
  });
}

function splitIntoSections(
  source: string
): string[] {
  const lines = source.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\s*\/\/\s*[-=]{3,}\s*$/.test(line)) {
      if (current.length > 0) {
        sections.push(current.join('\n').trim());
        current = [];
      }
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }

  if (sections.length <= 1) {
    const gapSections = source.split(/\n{3,}/);
    if (gapSections.length > 1) {
      return gapSections
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }

  return sections.filter((s) => s.length > 0);
}

function isPureComment(section: string): boolean {
  const lines = section.split('\n');
  return lines.every(
    (l) =>
      l.trim() === '' ||
      l.trim().startsWith('//') ||
      l.trim().startsWith('*') ||
      l.trim().startsWith('/*') ||
      l.trim().startsWith('*/')
  );
}

function commentToMarkdown(section: string): string {
  return section
    .split('\n')
    .map((l) => {
      let s = l.trim();
      if (s.startsWith('//')) s = s.slice(2).trim();
      else if (s.startsWith('/**')) s = s.slice(3).trim();
      else if (s.startsWith('*/')) s = '';
      else if (s.startsWith('*')) s = s.slice(1).trim();
      return s;
    })
    .join('\n')
    .trim();
}
