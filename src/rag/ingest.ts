import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const DB_PATH = '.capsule/rag-kb.json';

interface KBEntry {
  id: string;
  text: string;
  source: string;
}

function loadDB(): KBEntry[] {
  if (!existsSync(DB_PATH)) return [];
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
}

function saveDB(entries: KBEntry[]): void {
  mkdirSync('.capsule', { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(entries, null, 2));
}

export async function ingestGitHub(repoUrl: string): Promise<void> {
  const parts = repoUrl.replace('https://github.com/', '').split('/');
  const owner = parts[0];
  const repo = parts[1];

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`);
  const tree = await res.json();

  const mdFiles = tree.tree.filter((f: any) => f.path.endsWith('.md'));
  const db = loadDB();

  for (const file of mdFiles) {
    const content = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${file.path}`);
    const text = await content.text();
    const chunks = chunkText(text);

    for (let i = 0; i < chunks.length; i++) {
      db.push({ id: `${file.path}-${i}`, text: chunks[i], source: file.path });
    }
    console.log(`[rag] ingested ${file.path} → ${chunks.length} chunks`);
  }

  saveDB(db);
  console.log(`[rag] saved ${db.length} total chunks to ${DB_PATH}`);
}

export async function ingestConfluence(spaceUrl: string): Promise<void> {
  const res = await fetch(spaceUrl);
  const html = await res.text();
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const chunks = chunkText(text);
  const db = loadDB();

  for (let i = 0; i < chunks.length; i++) {
    db.push({ id: `confluence-${Date.now()}-${i}`, text: chunks[i], source: spaceUrl });
  }

  saveDB(db);
  console.log(`[rag] ingested confluence → ${chunks.length} chunks`);
}

function chunkText(text: string, size = 500): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(' '));
  }
  return chunks.filter((c) => c.length > 50);
}