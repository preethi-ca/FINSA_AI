import fs from 'fs';
import path from 'path';

const CONTEXTS_DIR = path.join(process.cwd(), 'contexts');

/** Max number of context files to combine when the user's question spans multiple topics */
const MAX_CONTEXT_FILES = 3;

/** Minimum score for a file to be included (besides the single best one) */
const MIN_SCORE_TO_INCLUDE = 1;

// Map of context filename → keywords that trigger it
const CONTEXT_KEYWORDS: Record<string, string[]> = {
  'recruitment.md': ['hiring', 'apply', 'join', 'recruitment', 'application', 'role', 'position', 'resume', 'résumé', 'interview', 'timeline', 'faq', 'choose portfolio', 'placement', 'tips'],
  'portfolios.md': ['portfolio', 'portfolios', 'different portfolios', 'what portfolios', 'which portfolios', 'finance', 'design', 'technology', 'tech', 'external', 'corporate relations', 'marketing', 'hr', 'human resources', 'events', 'branding', 'sponsor', 'treasury', 'budget'],
  'bulls_cage.md': ["bull's cage", 'bulls cage', 'stock pitch', 'competition', 'pitch', 'valuation'],
  'events.md': ['event', 'events', 'upcoming', 'speaker', 'workshop', 'recap', 'calendar'],
  'exec.md': ['exec', 'executive', 'leadership', 'contact', 'office hours', 'bios', 'team', 'who runs'],
  'general.md': [
    'finsa', 'about', 'who are you', 'what is finsa', 'mission', 'history', 'structure', 'culture',
    'sponsor', 'sponsorship', 'donate', 'partner', 'partnership', 'website', 'link',
    'what', 'tell', 'explain', 'help', 'club', 'know', 'info', 'information', 'guide', 'assist',
    'hello', 'hi', 'question', 'you do', 'can you', 'first', 'start', 'begin',
  ],
};

function scoreFile(query: string, keywords: string[]): number {
  return keywords.reduce((acc, kw) => acc + (query.includes(kw) ? 1 : 0), 0);
}

/**
 * Returns combined context content and the list of source files used.
 * Uses the best-matching file and up to (MAX_CONTEXT_FILES - 1) other files with score >= MIN_SCORE_TO_INCLUDE
 * so that multi-topic questions (e.g. "events and recruitment") get relevant context from both.
 */
export function getContextForQuery(userQuery: string): { content: string; sources: string[] } {
  const query = userQuery.toLowerCase();

  const scored: { filename: string; score: number }[] = [];
  for (const [filename, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
    const score = scoreFile(query, keywords);
    scored.push({ filename, score });
  }

  // Sort by score descending; take up to MAX_CONTEXT_FILES with score >= MIN_SCORE_TO_INCLUDE (or at least the best one)
  scored.sort((a, b) => b.score - a.score);
  let toLoad = scored.filter((s) => s.score >= MIN_SCORE_TO_INCLUDE).slice(0, MAX_CONTEXT_FILES);
  if (toLoad.length === 0) toLoad = scored.filter((s) => s.score > 0).slice(0, 1);
  // Never send empty context: if nothing matched, always include general.md so the model has baseline club info
  if (toLoad.length === 0) {
    const general = scored.find((s) => s.filename === 'general.md');
    if (general) toLoad = [general];
  }

  const parts: string[] = [];
  const sources: string[] = [];

  for (const { filename } of toLoad) {
    const filePath = path.join(CONTEXTS_DIR, filename);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      parts.push(`--- ${filename} ---\n${content}`);
      sources.push(filename);
    } catch {
      console.warn(`[ContextLoader] Could not read ${filename}.`);
    }
  }

  const content = parts.length > 0 ? parts.join('\n\n') : '';
  console.log(`[ContextLoader] Using: ${sources.join(', ')}`);
  return { content, sources };
}

/**
 * Returns context from the single best-matching file (legacy behavior).
 * Prefer getContextForQuery() for multi-topic awareness and source attribution.
 */
export function findBestContext(userQuery: string): string {
  const { content } = getContextForQuery(userQuery);
  return content;
}
