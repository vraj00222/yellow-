import { readFileSync, existsSync } from 'fs';

const DB_PATH = '.capsule/rag-kb.json';

interface KBEntry {
  id: string;
  text: string;
  source: string;
}

export async function retrieveContext(diff: string, topK = 3): Promise<string[]> {
  if (!existsSync(DB_PATH)) {
    console.log('[rag] no knowledge base found, skipping context');
    return [];
  }

  const db: KBEntry[] = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
  if (db.length === 0) return [];

  const diffWords = new Set(
    diff.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
  );

  const scored = db.map((entry) => {
    const entryWords = entry.text.toLowerCase().split(/\W+/);
    const score = entryWords.filter((w) => diffWords.has(w)).length;
    return { ...entry, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((e) => e.score > 0)
    .map((e) => `[${e.source}]\n${e.text}`);
}