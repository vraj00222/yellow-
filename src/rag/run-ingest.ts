import { ingestGitHub } from './ingest';

async function main() {
  console.log('[rag] starting ingestion...');
  
  // Ingest your own repo as the knowledge base to start
  await ingestGitHub('https://github.com/aadgaonkar/yellow-');
  
  console.log('[rag] done. knowledge base ready.');
}

main().catch(console.error);