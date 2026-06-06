import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockEngine } from '../src/telegram/mock-engine';
import { cardFor } from '../src/telegram/notify';
import type { EngineEvent } from '../src/telegram/engine';

describe('cardFor', () => {
  it('renders the crash alert with no buttons', () => {
    const card = cardFor({
      type: 'incident.frozen',
      incidentId: 'inc-1',
      capsuleId: 'checkout-1a9f',
      title: 'Crash in checkout',
      summary: 'boom',
      affected: ['products: REMOVED id=p2'],
    });
    expect(card.text).toContain('Crash in checkout');
    expect(card.buttons).toBeUndefined();
  });

  it('puts approve/deny on the proposal and encodes the incident in callback data', () => {
    const card = cardFor({
      type: 'proposal.ready',
      incidentId: 'inc-1',
      rootCause: 'rc',
      proposedFix: 'fix',
      attempt: 1,
    });
    const data = card.buttons?.flat().map((b) => b.data) ?? [];
    expect(data).toContain('approvePlan:inc-1');
    expect(data).toContain('denyPlan:inc-1');
  });

  it('shows the real diff verbatim on the build card', () => {
    const card = cardFor({
      type: 'build.complete',
      incidentId: 'inc-1',
      diff: 'if (!product) continue;',
      filesChanged: ['demo/checkout.ts'],
      branch: 'fix/x',
      validation: { ranAgainstFrozenState: true, crashGone: true, testsPassed: true },
    });
    expect(card.text).toContain('if (!product) continue;');
    expect(card.buttons?.flat().map((b) => b.data)).toContain('approveCode:inc-1');
  });

  it('escapes HTML-significant characters in event text', () => {
    const card = cardFor({
      type: 'error',
      incidentId: 'inc-1',
      stage: 'build',
      message: '<script> & </script>',
    });
    expect(card.text).toContain('&lt;script&gt; &amp; &lt;/script&gt;');
    expect(card.text).not.toContain('<script>');
  });
});

describe('MockEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function collect(engine: MockEngine): EngineEvent[] {
    const events: EngineEvent[] = [];
    engine.onEvent((e) => events.push(e));
    return events;
  }

  it('drives the full happy path: crash → proposal → build → merge', async () => {
    const engine = new MockEngine();
    const events = collect(engine);
    const id = engine.simulateCrash();

    expect(events[0].type).toBe('incident.frozen');
    await vi.advanceTimersByTimeAsync(3000);
    expect(events.at(-1)?.type).toBe('proposal.ready');

    await engine.send({ type: 'approvePlan', incidentId: id });
    expect(events.at(-1)?.type).toBe('build.started');
    await vi.advanceTimersByTimeAsync(3500);
    const build = events.at(-1);
    expect(build?.type).toBe('build.complete');
    if (build?.type === 'build.complete') expect(build.validation.crashGone).toBe(true);

    await engine.send({ type: 'approveCode', incidentId: id });
    await vi.advanceTimersByTimeAsync(2500);
    expect(events.at(-1)?.type).toBe('merge.complete');
  });

  it('re-investigates on denyPlan and bumps the attempt number', async () => {
    const engine = new MockEngine();
    const events = collect(engine);
    const id = engine.simulateCrash();
    await vi.advanceTimersByTimeAsync(3000);

    await engine.send({ type: 'denyPlan', incidentId: id, feedback: 'check the cart row' });
    await vi.advanceTimersByTimeAsync(3000);

    const last = events.at(-1);
    expect(last?.type).toBe('proposal.ready');
    if (last?.type === 'proposal.ready') expect(last.attempt).toBe(2);
  });

  it('ignores commands for unknown incidents', async () => {
    const engine = new MockEngine();
    const events = collect(engine);
    await engine.send({ type: 'approvePlan', incidentId: 'nope' });
    expect(events).toHaveLength(0);
  });
});
