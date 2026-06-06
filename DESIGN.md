---
name: Capsule
description: Version control for a running InsForge backend — freeze, restore, diff.
colors:
  bg: "#1b1b1e"
  chrome: "#202024"
  ink: "#ededee"
  dim: "#adadb5"
  faint: "#8e8e97"
  mint: "#3ddc97"
  mint-bright: "#5cf0b3"
  mint-soft: "#3ddc971f"
  mint-line: "#3ddc9766"
  mint-ink: "#04150d"
  danger: "#ff6b6b"
  danger-soft: "#ff6b6b1a"
  danger-line: "#ff6b6b66"
  amber: "#f5a623"
  amber-soft: "#f5a6231f"
  panel: "#27272d"
  panel-2: "#31313a"
  border: "#3d3d47"
  border-2: "#4e4e5a"
typography:
  display:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.13em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  sm: "10px"
  md: "14px"
  lg: "18px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "22px"
components:
  button-primary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.mint-ink}"
    rounded: "11px"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    rounded: "11px"
    padding: "9px 18px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  input-select:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  timeline-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  chip:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.dim}"
    rounded: "{rounded.pill}"
    padding: "5px 11px"
---

# Design System: Capsule

## 1. Overview

**Creative North Star: "The InsForge state debugger"**

Capsule's dashboard should read like devtools for a running backend, not like a
marketing page. The same way a debugger lets you set a breakpoint and watch a
variable, Capsule lets you freeze backend state, restore it, and diff two moments
to find the one row that broke production. The interface is the instrument: a flat
charcoal surface (`#1b1b1e`, lifted — never pure black), a single mint signal that
means "live / now / healthy," clearly-lined cards that read like an instrument
panel rather than a landing page, and monospace for anything that is data or a
command. A developer should understand what they're looking at in one glance and
trust that it was built by engineers. The whole thing mirrors the InsForge
dashboard: full-width top bar, a sidebar split from the content by one continuous
divider, charcoal cards lifted above the background by a visible border.

Density is calm, not cramped. The shell is a fixed two-pane workspace (timeline
rail + stage) that never scrolls as a whole; only the panes scroll. Color is
rationed hard: black and two greys carry ~90% of every screen, and mint is spent
only where it earns meaning. Motion is part of the build, not a coat of paint:
capsules stagger onto the timeline, the segmented pill slides between Inspect and
Diff, and a diff resolves to the deleted row. The feeling to chase is a senior
engineer reproducing a production bug in one keystroke: controlled power.

This system explicitly rejects the generic SaaS admin look (pastel rounded cards,
Inter everywhere, charts for the sake of charts), cluttered enterprise density
(Datadog/Grafana toolbar soup and tiny grey walls of text), light corporate
shells (bright white, safe stock-blue), and consumer-cute play that would undercut
the "serious debugging" trust. It must always stay unmistakably InsForge: charcoal,
mint `#3ddc97`, clearly-lined cards. Elevate the craft; never trade the identity.

**Key Characteristics:**
- Flat charcoal surface (`#1b1b1e`) with cards lifted by a visible border, plus one rationed mint accent.
- Monospace (JetBrains Mono) for all data, IDs, commands, and diffs; Sora for UI prose.
- Instrument-grade, tactile components: hairline borders, soft lift on hover.
- Motion that performs the freeze → restore → diff narrative.
- Terminal-native trust over decoration; real diffs over illustrations.

## 2. Colors

A near-monochrome black-and-grey field with one decisive mint signal and two
status hues (red for crash, amber for changed). Translucent white overlays — not
solid greys — build every surface, so the black always shows through.

### Primary
- **InsForge Mint** (`#3ddc97`): the one accent and the sponsor's own green. It
  means live / now / healthy / active — the current node on the timeline, the
  active segment, the primary button, the freeze prompt in the terminal, focus
  rings. **Bright Mint** (`#5cf0b3`) is its hover/emphasis sibling (terminal hunk
  headers, brightened states). Mint glows (`0 0 12px #3ddc97`) rather than fills.
- **Mint Ink** (`#04150d`): the near-black text printed *on* mint fills (primary
  button label, active segment). Never put light text on a mint fill.

### Secondary
- **Crash Red** (`#ff6b6b`): error state only — error nodes, the crash panel,
  removed rows in a diff, the topbar error. Paired with `danger-soft` fills
  (`#ff6b6b1a`) and `danger-line` borders (`#ff6b6b66`).
- **Drift Amber** (`#f5c451`): the "changed / warning" middle state — changed rows
  and changed-field counts in a diff, schema-drift banners. Paired with
  `amber-soft` (`#f5c4511f`).

### Neutral
- **Black** (`#000000`): the body and ambient surface. The whole product sits on
  true black; there is no grey "page" color.
- **Ink** (`#f3f4f6`): primary text and headings.
- **Dim** (`#8b9097`): secondary text, sub-labels, dimmed values (~6.5:1 on black — AA-safe for body).
- **Faint** (`#565b62`): micro-labels, timestamps, hints (~3:1 on black — large/incidental text only; see Don'ts).
- **Surfaces** are translucent white: `panel` (`#ffffff06`) and `panel-2`
  (`#ffffff0d`). **Borders** are translucent white too: `border` (`#ffffff14`,
  hairline default) and `border-2` (`#ffffff29`, emphasis / interactive).

### Named Rules
**The One Signal Rule.** Mint is spent on ≤10% of any screen. It marks exactly one
idea — *this is live / healthy / now* — and its rarity is what makes the active
capsule and the primary action read instantly. The moment a second thing turns
mint "to look nice," the signal is gone.

**The Translucent Surface Rule.** Surfaces and borders are white at low alpha, never
opaque grey. The black bleeds through every panel so the grid and bloom stay
visible underneath. Prohibited: solid `#111`-style panel fills.

**The Traffic-Light Rule.** State color is strictly mint (ok) / amber (changed) /
red (removed/crash). Never invent a fourth status hue; never use mint for anything
that isn't healthy/live.

## 3. Typography

**Display / UI Font:** Sora (with -apple-system, system-ui, sans-serif)
**Data / Mono Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo)

**Character:** A geometric, slightly technical sans (Sora) for everything a human
reads, paired with a precise monospace (JetBrains Mono, tabular `zero` feature on)
for everything a machine produced. The pairing *is* the message: prose is Sora,
truth is mono. Headings sit tight (`-0.03em`); body sits at `-0.01em`.

### Hierarchy
- **Display** (Sora 600, 30px, line-height 1, `-0.03em`): the big mint stat number
  in the sidebar ("N capsules captured"). The loudest type on screen.
- **Title** (Sora 600, 26px, line-height 1.1, `-0.03em`): the view header — a
  capsule's label or "Diff". One per stage.
- **Brand** (JetBrains Mono 600, 19px, `-0.03em`): the wordmark "Capsule." Set in
  mono on purpose — the product name reads like a command.
- **Body** (Sora 400, 14px, line-height 1.5, `-0.01em`): default UI copy. Keep
  prose blocks ≤70ch.
- **Label** (Sora 600, 11px, uppercase, `0.13em`): panel titles and eyebrow labels.
  Reserved for ≤4-word labels — never sentences.
- **Mono / Data** (JetBrains Mono 400–500, 12.5px, `0`): capsule IDs, key/value
  values, the terminal diff, the segmented control, code in hints. Anything that is
  data, a path, or a command is mono.

### Named Rules
**The Prose-vs-Truth Rule.** If a human wrote it (labels, descriptions, prompts), it's
Sora. If a machine produced it (IDs, timestamps, row data, diffs, commands), it's
JetBrains Mono. Don't blur the two — the split is how the UI signals what's real.

**The Label Discipline Rule.** Uppercase + `0.13em` tracking is for ≤4-word labels
only. Body copy is never uppercased.

## 4. Elevation

**Lifted, calibrated for black.** Panels are objects that sit slightly above the
surface. The catch: on a true-black background a normal drop shadow is invisible,
so lift is carried by three things working together — a hairline **inset top
highlight** (`inset 0 1px 0 rgba(255,255,255,0.03)`) that catches a "light" edge, a
**hairline border** that defines the object, and large, soft **ambient shadows**
that darken the already-dark ground. Mint/red **glow** does the work a colored
shadow would. Backdrop blur (`8px`) on the sidebar, topbar, and footer separates
chrome from the scrolling stage.

### Shadow Vocabulary
- **Inset highlight** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.03)`): on every
  panel — the top-edge catch that makes a flat surface read as lifted.
- **Ambient** (`box-shadow: 0 18px 50px rgba(0,0,0,0.6)`): the terminal diff and
  tooltips — the strongest lift, reserved for surfaces that float over content.
- **Ambient-sm** (`box-shadow: 0 8px 24px rgba(0,0,0,0.4)`): lighter floating chrome.
- **Mint glow** (`box-shadow: 0 0 12px #3ddc97`): active timeline node, status dots,
  focus emphasis. The colored "shadow" that signals live.
- **Primary lift** (`box-shadow: 0 6px 18px rgba(61,220,151,0.28)`): under the mint
  primary button and the segmented pill — a tinted lift, not a grey one.

### Named Rules
**The Glow-Is-The-Shadow Rule.** Depth and emphasis on black come from glow + inset
highlight + hairline border, not from grey drop shadows (which you can't see).
Reserve the large ambient shadow for genuinely floating surfaces (terminal,
tooltip), not for every card.

## 5. Components

Components feel **tactile and responsive**: hairline-bordered objects on translucent
surfaces that lift a hair and warm their border to mint on hover. Transitions are
quick (`0.18s`) and easing is a soft exponential deceleration.

### Buttons
- **Shape:** gently rounded (11px), hairline border (`border-2`, `#ffffff29`).
- **Primary:** mint fill (`#3ddc97`) with mint-ink text (`#04150d`), tinted lift
  shadow (`0 6px 18px rgba(61,220,151,0.28)`), padding `9px 18px`.
- **Secondary:** translucent `panel-2` fill, ink text, hairline border.
- **Hover:** border warms to `mint-line` and the button lifts `translateY(-1px)`
  (primary also `scale(1.02)` + `brightness(1.06)`). **Disabled:** 40% opacity.
- **Focus:** 1px `mint-line` outline, 2px offset (global `:focus-visible`).

### Chips & Pills
- **Style:** fully rounded (999px), hairline border, `panel-2` fill, dim text.
- **State:** status variants recolor to the traffic-light hues — `chip--add` (mint),
  `chip--ch` (amber), `chip--rm` (red), each with its soft fill + line border. Same
  pattern for the ok/error status **pills** in view headers.

### Cards / Containers (Panels)
- **Corner Style:** 18px (`rounded.lg`); inner data blocks use 10–14px.
- **Background:** translucent `panel` (`#ffffff06`); never opaque grey.
- **Shadow Strategy:** inset top highlight at rest (see Elevation); border warms to
  `border-2` on hover. Error/ok panels add a top-down tinted gradient
  (`danger-soft` / `mint-soft` → transparent) plus the matching line border.
- **Border:** hairline `border` (`#ffffff14`) default.
- **Internal Padding:** `18px 20px`.

### Inputs / Fields
- **Style:** the diff `select` — mono text (12.5px), `panel-2` fill, `border-2`
  hairline, 14px radius, custom mint-grey chevron, `min-width: 232px`.
- **Focus / Hover:** border warms to `mint-line`.

### Navigation (Timeline rail + Segmented control)
- **Timeline:** a vertical rail of capsule cards joined by a mint-to-grey gradient
  line; each card has a gutter **node** (11px ring, mint border, red for error).
  Active node fills mint and glows; hover slides the card `translateX(2px)` and
  warms its border; active card gets a mint top-gradient wash + soft glow.
- **Segmented control (Inspect / Diff):** a 12px-radius track holding a sliding mint
  **pill** (`cubic-bezier(0.22, 1, 0.36, 1)`); the active segment text goes mint-ink.
  Keyboard: `d`/`i` switch modes; `j`/`k` move the selection.

### Terminal Diff (signature component)
The diff renders as a faux terminal: a `#0e0f11` title bar with red/amber/green
traffic dots, a near-black (`#050607`) body in mono at `line-height: 1.75`, a mint
`$` prompt, git-style `@@` hunk headers in bright mint, removed lines in red with an
`inset 2px 0 0` left signal edge, added lines in mint with the same. This is the
emotional climax of the demo — the deleted product row shown as a red `-` line.

## 6. Do's and Don'ts

### Do:
- **Do** keep the surface pure black (`#000000`) with the vanishing grid + mint
  bloom. Identity preservation wins; elevate craft, never swap the look.
- **Do** ration mint to ≤10% of any screen (The One Signal Rule) — one live idea.
- **Do** set all data, IDs, timestamps, paths, commands, and diffs in JetBrains Mono;
  set human prose in Sora (The Prose-vs-Truth Rule).
- **Do** build surfaces from translucent white (`#ffffff06`–`#ffffff29`) so black
  shows through, and lift them with the inset top highlight + hairline border + glow.
- **Do** encode state with both color and a non-color cue (dot, icon, label) —
  mint=ok, amber=changed, red=removed/crash. Never color-only.
- **Do** ship a `prefers-reduced-motion` fallback for every animation, and keep the
  `:focus-visible` mint ring and `j`/`k`/`d`/`i` keyboard nav (WCAG 2.2 AA).
- **Do** keep corner radii in the 10–18px band for panels/cards; 999px only for
  pills and status chips.

### Don't:
- **Don't** ship the generic SaaS admin look: pastel rounded cards, Inter
  everywhere, or charts for the sake of charts. If it could be any dashboard, it failed.
- **Don't** drift toward cluttered enterprise density (Datadog/Grafana toolbar soup,
  tiny grey walls of text) or a light corporate shell (white bg, stock-blue accent).
- **Don't** put essential copy in Faint (`#565b62`) — it clears only ~3:1 on black
  (large/incidental text). Use Dim (`#8b9097`, ~6.5:1) for anything meaningful.
- **Don't** use mint for anything that isn't live/healthy/now, and never invent a
  fourth status hue beyond mint/amber/red.
- **Don't** fill panels with opaque grey or rely on grey drop shadows for depth on
  black — depth comes from glow + inset highlight + border.
- **Don't** over-round (no 24px+ radii on cards), pair a 1px border with a wide soft
  drop shadow as decoration, or let the pixel mascot/taglines tip into consumer-cute.
- **Don't** uppercase body copy; reserve uppercase + tracking for ≤4-word labels.
