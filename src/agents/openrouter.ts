import OpenAI from 'openai';
import type { CapsuleMeta, Row, StateDiff } from '../core/types';
import type { AgentRunner } from './replicas';

/**
 * A working {@link AgentRunner} backed by InsForge's Model Gateway (OpenRouter).
 *
 * It receives a crash capsule + the healthy→crash diff and asks a model to name
 * the root cause and a fix, grounded in the actual rows that moved. The project
 * OpenRouter key is provisioned by `npx @insforge/cli ai setup` into `.env` and
 * read here server-side only — it is never shipped to the browser.
 */
export class OpenRouterAgent implements AgentRunner {
  async proposeFix(
    capsule: CapsuleMeta,
    diff: StateDiff,
    extra?: string,
  ): Promise<{ explanation: string; patch?: string }> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set — run `npx @insforge/cli ai setup`.');
    }
    const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey });
    const completion = await client.chat.completions.create({
      // Overridable via OPENROUTER_CHAT_MODEL. Default is one the project's
      // InsForge Model Gateway key actually routes (verified): gpt-4o gives the
      // sharpest root-cause text; claude-3-haiku / llama-3.3-70b also work.
      model: process.env.OPENROUTER_CHAT_MODEL ?? 'openai/gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(capsule, diff, extra) },
      ],
      max_completion_tokens: 600,
    });
    const explanation = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!explanation) throw new Error('The model returned an empty response.');
    return { explanation };
  }
}

const SYSTEM_PROMPT = `You are Capsule's backend debugging assistant. Capsule froze the backend's exact \
state at the moment a request crashed. You are given the captured error, the request that triggered it, \
and a diff of the database between the last healthy snapshot and the crash (the rows that changed).

Name the ROOT CAUSE in 2-3 sentences, grounded in the specific rows shown — not generic advice. Then give \
a concrete FIX (code-level or data-level). Be direct and specific about the tables and rows involved. \
Plain text only: no markdown headings, no bullet symbols, no preamble.`;

function buildPrompt(capsule: CapsuleMeta, diff: StateDiff, extra?: string): string {
  const { error, request } = capsule.context;
  const lines: string[] = [];
  if (error) lines.push(`ERROR: ${error.name}: ${error.message}`);
  if (request) {
    const body = request.body === undefined ? '' : ` body=${safe(request.body)}`;
    lines.push(`REQUEST: ${request.method ?? ''} ${request.url ?? ''}${body}`.trim());
  }
  lines.push('', 'DATABASE CHANGES (last healthy snapshot → crash):');
  const changes = describeDiff(diff);
  lines.push(changes.length ? changes.join('\n') : '(no row-level changes detected)');
  if (extra && extra.trim()) {
    lines.push('', `DEVELOPER FOLLOW-UP: ${extra.trim()}`, 'Address this follow-up directly.');
  }
  return lines.join('\n');
}

function describeDiff(diff: StateDiff): string[] {
  const out: string[] = [];
  for (const [table, t] of Object.entries(diff.tables)) {
    for (const r of t.removed) out.push(`- ${table}: REMOVED ${row(r)}`);
    for (const r of t.added) out.push(`- ${table}: ADDED ${row(r)}`);
    for (const c of t.changed)
      out.push(`- ${table}: CHANGED ${row(c.before)} (fields: ${c.changedFields.join(', ')})`);
  }
  return out;
}

function row(r: Row): string {
  return Object.entries(r)
    .map(([k, v]) => `${k}=${safe(v)}`)
    .join(' ');
}

function safe(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}
