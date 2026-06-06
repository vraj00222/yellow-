# Product

## Register

brand

> The artifact is a product surface (the Capsule dashboard: timeline, inspector,
> diff). It is treated through a **brand / showcase** lens by deliberate choice:
> here the design *is* the pitch. The job is to land the "version control for a
> running backend" story in a live demo and make it unforgettable. Workflow
> clarity still matters, but when clarity and spectacle compete, spectacle that
> sells the idea wins.

## Users

Hackathon judges and engineers watching a 2-minute live demo, plus the backend
developers who would actually use Capsule. They are technical: they read diffs,
live in terminals, and trust tools that look like they were built by engineers.
In the demo moment their attention is short and their bar is high — the interface
has to be legible at a glance and visibly impressive in the same breath.

The job to be done: watch backend state get **frozen** into a capsule, **restored**
to an exact earlier moment, and **diffed** to reveal the one bad row that caused a
crash — and immediately grasp that this is git-for-a-running-backend, powered by
InsForge branching.

## Product Purpose

Capsule is version control for a running backend: freeze the whole backend state
(DB + auth + storage), restore that exact state later, and diff two capsules to
see precisely which rows changed. The dashboard is the "time machine" front end —
a timeline of capsules, an inspector (error, redacted request/session, table
counts), and a git-style terminal diff that highlights the deleted row as the
root cause.

Success right now means three things, in order: (1) **wow the judges** with motion
and visuals that make the time-machine idea feel real and impressive; (2) make
**InsForge** usage the visible star — the dashboard runs on InsForge branches and
should say so with confidence; (3) leave behind something that reads as a genuine
debugging instrument, not a mock.

## Brand Personality

Three words: **precise, confident, terminal-native.** The voice is an engineer who
has done the work and isn't selling — value-prop taglines like "freeze the crash,
diff the cause" and "save the bad state, not the bug report." Calm authority over
hype. The aesthetic is a dark control room: pure black, a single decisive mint
signal, a vanishing technical grid, monospace for anything that is data or a
command. Emotionally it should feel like watching a senior engineer reproduce a
production bug in one keystroke — controlled power, a little bit of awe.

## Anti-references

- **Do not drift off the InsForge identity.** Keep the current theme — pure black
  background, mint (`#3DDC97`) as the one accent, the vanishing grid + bloom. The
  brief is "the InsForge theme as it is now, but with better design." Elevate the
  craft; never trade away the identity for a different look.
- **Not a generic SaaS admin panel** — no pastel rounded cards, no Inter-everywhere,
  no charts for the sake of charts. If it could be any dashboard, it has failed.
- **Not cluttered enterprise density** (Datadog / Grafana overload): no tiny gray
  text, no toolbar soup, no zero-breathing-room data walls.
- **Not light corporate** — no bright white shell, no safe stock-blue accent. This
  is a terminal-native tool and reads dark by nature.
- **Not consumer-cute** — the pixel mascot and taglines are seasoning, not the
  meal; playfulness must never undercut the "serious debugging" trust.

## Design Principles

- **The demo is the product.** Every surface is optimized to land the freeze →
  restore → diff story in a 2-minute live demo. Glance-legibility and a clear
  visual climax beat feature density.
- **Perform the value prop, don't describe it.** Motion and state transitions
  carry the time-machine narrative; the interface should *move* like a time
  machine (capsules settling onto a timeline, a diff resolving to the one bad
  row). Motion is core, not decoration.
- **On-theme, elevated.** Stay unmistakably InsForge (black + mint + grid). Raise
  execution — rhythm, hierarchy, choreography — rather than reinventing identity.
- **Terminal-native trust.** The look signals "built by engineers, for engineers":
  monospace for data and commands, precision over ornament, real diffs over
  illustrations.
- **Make the sponsor tech visible.** InsForge branching is the engine under the
  freeze/restore. Surface it as the star of the story, not a footnote.

## Accessibility & Inclusion

Target **WCAG 2.2 AA.** Body text holds ≥4.5:1 contrast (watch the muted grays
`--dim`/`--faint` on near-black — verify, don't assume), large text ≥3:1. Keep the
existing strengths: visible `:focus-visible` rings, complete keyboard navigation
(`j`/`k` move, `d` diff, `i` inspect), `aria` roles on the segmented control and
live error region, and a `prefers-reduced-motion` alternative for every animation
(non-negotiable as motion becomes more ambitious — each new effect ships with its
reduced-motion fallback). Don't rely on color alone to encode state: error/ok/changed
already pair color with icons, dots, and labels — keep that.
