import fs from 'fs';
import path from 'path';

const CONTEXTS_DIR = path.join(process.cwd(), 'contexts');


// Map of context filename → keywords that trigger it
const CONTEXT_KEYWORDS: Record<string, string[]> = {
  'recruitment.md': ['hiring', 'apply', 'join', 'recruitment', 'application', 'role', 'position', 'resume', 'interview', 'timeline', 'faq', 'choose portfolio', 'placement'],
  'portfolios.md': ['portfolio', 'equity', 'fixed income', 'quantitative', 'invest', 'fund', 'asset', 'public equity', 'private equity', 'operations'],
  'bulls_cage.md': ["bull's cage", 'bulls cage', 'stock pitch', 'competition', 'pitch', 'valuation'],
  'events.md': ['event', 'events', 'upcoming', 'speaker', 'workshop', 'recap', 'calendar'],
  'exec.md': ['exec', 'executive', 'leadership', 'contact', 'office hours', 'bios', 'team', 'who runs'],
  'general.md': ['finsa', 'about', 'who are you', 'what is finsa', 'mission', 'history', 'structure', 'culture'],
};

export function findBestContext(userQuery: string): string {
  const query = userQuery.toLowerCase();

  let bestFile = 'general.md';
  let bestScore = 0;

  for (const [filename, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => {
      return acc + (query.includes(kw) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestFile = filename;
    }
  }

  const filePath = path.join(CONTEXTS_DIR, bestFile);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`[ContextLoader] Using: ${bestFile} (score: ${bestScore})`);
    return content;
  } catch {
    console.warn(`[ContextLoader] Could not read ${bestFile}, using empty context.`);
    return '';
  }
}