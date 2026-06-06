/**
 * A stand-in for Vraj's orchestrator engine. Implements {@link OrchestratorEngine}
 * in-process and scripts the full incident lifecycle on timers, so the entire
 * Telegram experience can be built and demoed with the real engine at 0%.
 *
 * When Vraj's engine is ready it implements the same interface over HTTP and this
 * file is swapped out — no Telegram code changes. The data here is canned around
 * the canonical demo bug (checkout → a cart references a deleted product).
 */
import type { Command, EngineEvent, IncidentId, OrchestratorEngine } from './engine';

type Handler = (event: EngineEvent) => void;

interface Incident {
  id: IncidentId;
  capsuleId: string;
  proposalAttempt: number;
  buildAttempt: number;
}

const DELAY = {
  investigate: 2500,
  build: 3000,
  merge: 2000,
  answer: 1500,
} as const;

export class MockEngine implements OrchestratorEngine {
  private handlers: Handler[] = [];
  private incidents = new Map<IncidentId, Incident>();
  private seq = 0;

  onEvent(handler: Handler): void {
    this.handlers.push(handler);
  }

  /** Kick off a fake crash → the channel should light up within ~a second. */
  simulateCrash(): IncidentId {
    const n = ++this.seq;
    const id = `inc-${n}`;
    this.incidents.set(id, { id, capsuleId: `checkout-${n}a9f`, proposalAttempt: 0, buildAttempt: 0 });

    this.emit({
      type: 'incident.frozen',
      incidentId: id,
      capsuleId: `checkout-${n}a9f`,
      title: 'Crash in checkout — TypeError',
      summary: "Cannot read properties of undefined (reading 'price') while totaling the cart.",
      affected: ['products: REMOVED id=p2 name="Aero Mug"', 'carts: c1 still references item p2'],
      dashboardUrl: 'http://localhost:4000/#/capsules/checkout',
    });

    this.after(DELAY.investigate, () => this.sendProposal(id));
    return id;
  }

  async send(command: Command): Promise<void> {
    const inc = this.incidents.get(command.incidentId);
    if (!inc) return;
    switch (command.type) {
      case 'approvePlan':
        this.emit({ type: 'build.started', incidentId: inc.id });
        this.after(DELAY.build, () => this.sendBuild(inc));
        break;
      case 'denyPlan':
        // Re-investigate: a new, "feedback-aware" proposal.
        this.after(DELAY.investigate, () => this.sendProposal(inc.id, command.feedback));
        break;
      case 'approveCode':
        this.after(DELAY.merge, () =>
          this.emit({
            type: 'merge.complete',
            incidentId: inc.id,
            mergedTo: 'main',
            prUrl: `https://github.com/yellow/demo/pull/${this.seq}`,
            commitSha: 'a1b2c3d',
          }),
        );
        break;
      case 'denyCode':
        // Rebuild against the feedback.
        this.after(DELAY.build, () => this.sendBuild(inc, command.feedback));
        break;
      case 'ask':
        this.after(DELAY.answer, () =>
          this.emit({
            type: 'answer.ready',
            incidentId: inc.id,
            question: command.question,
            answer: this.fakeAnswer(command.question),
          }),
        );
        break;
      case 'takeover':
        this.emit({
          type: 'answer.ready',
          incidentId: inc.id,
          question: '(takeover)',
          answer: `You're driving. Branch ready: fix/${inc.capsuleId}. Open it in your IDE — the frozen crash state is restored locally.`,
        });
        break;
    }
  }

  private sendProposal(id: IncidentId, feedback?: string): void {
    const inc = this.incidents.get(id);
    if (!inc) return;
    inc.proposalAttempt += 1;
    const refined = feedback
      ? `Reworked after your note ("${feedback}"). The cart row, not the product, is the real owner of the bug: `
      : '';
    this.emit({
      type: 'proposal.ready',
      incidentId: id,
      attempt: inc.proposalAttempt,
      rootCause:
        'Product p2 was hard-deleted while cart c1 still held a line item pointing at it. checkout() maps the cart and dereferences product.price on the now-missing product, throwing a TypeError.',
      proposedFix: `${refined}Make checkout() skip-and-log line items whose product no longer exists, and add a guard so deleting a product first detaches it from open carts.`,
    });
  }

  private sendBuild(inc: Incident, feedback?: string): void {
    inc.buildAttempt += 1;
    const guardLine = feedback
      ? `\n+    // ${feedback}\n+    logger.warn('dropped orphaned cart item', { itemId: item.id });`
      : '';
    this.emit({
      type: 'build.complete',
      incidentId: inc.id,
      branch: `fix/${inc.capsuleId}`,
      filesChanged: ['demo/checkout.ts'],
      diff: [
        '--- a/demo/checkout.ts',
        '+++ b/demo/checkout.ts',
        '@@ function checkout(cart, products) @@',
        '   for (const item of cart.items) {',
        '-    const product = products.find((p) => p.id === item.productId);',
        '-    total += product.price * item.qty;',
        '+    const product = products.find((p) => p.id === item.productId);',
        '+    if (!product) continue; // orphaned line item — product was deleted' + guardLine,
        '+    total += product.price * item.qty;',
        '   }',
      ].join('\n'),
      validation: { ranAgainstFrozenState: true, crashGone: true, testsPassed: true },
    });
  }

  private fakeAnswer(question: string): string {
    const q = question.toLowerCase();
    if (q.includes('test')) return 'Re-ran the frozen crash request against the patched code: it returns 200 instead of throwing. The 30 existing tests still pass.';
    if (q.includes('why') || q.includes('auth')) return 'Only demo/checkout.ts changed. The fix is scoped to the cart-totaling loop; nothing touches auth or the schema.';
    return 'The patch guards the cart-totaling loop against deleted products and detaches products from open carts on delete. Validated against the exact frozen state from this crash.';
  }

  private emit(event: EngineEvent): void {
    for (const h of this.handlers) h(event);
  }

  private after(ms: number, fn: () => void): void {
    setTimeout(fn, ms).unref?.();
  }
}
