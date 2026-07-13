# Conventions

> Load when: writing your first D-/HT-/R- entry this session, or creating a new file type.
> Defines ID schemes, entry grammars, and file templates.

## ID schemes

IDs are sequential integers, zero-padded to three digits. Never reused. Issued in the file they belong to.

| Prefix | File | Owner | Meaning |
|---|---|---|---|
| D-NNN | state/decisions.md | A | Decided decision |
| HT-NNN | HUMAN-TODOS.md | A | Human-only todo |
| R-NNN | state/risks.md | A | Risk |
| OD-NNN | state/open-decisions.md | A | Open decision briefing |
| L-NNN | state/learnings.md | A | Learning from systemic agent weakness |

## Entry grammars

### D-NNN — Decided decision

```markdown
## D-NNN — [short decision title]

Date: YYYY-MM-DD
Decision: [what was decided]
Rationale: [why this path]
Consequences: [what changes because of this]
Closes: [OD-MMM or omit when none]
Supersedes: [D-MMM or omit when none]
```

Superseding: add a `Superseded-by: D-MMM` line under the entry and a `> Superseded by D-MMM (YYYY-MM-DD): [reason]` note below. Never delete the original entry.

Keep `Decision:`/`Rationale:`/`Consequences:` to roughly one line each —
state/decisions.md is boot context, read every session; design detail belongs in
the owning domain file, linked from the entry. Once a superseded entry's full
text no longer informs current work, compress it in place to its heading plus
the supersede note and move the body to `archive/decisions.md` — the ID and its
trace never leave state/decisions.md.

`Closes:` is the durable trace of a resolved open decision. Because the OD entry
is removed on decision (see below), anything that referenced the OD finds its
resolution here — never leave a "DECIDED" tombstone in open-decisions.md instead.

### HT-NNN — Human todo

```
- [ ] HT-NNN — [what the human needs to do] — [context or deadline if relevant]
```

Keep it one line, two at most; details live in the owning domain file or OD entry —
link, don't inline. Check off with `[x]` when done; never delete an open entry.
Checked-off entries are working memory, not history: once a `[x]` entry is clearly
settled (rule of thumb: the next session no longer needs it), move its line verbatim
to `archive/human-todos.md` (create on demand). IDs stay sequential and are never
reused — the counter continues across archived entries. doctor nudges when done
entries pile up (SY-07).

### OD-NNN — Open decision briefing

```markdown
## OD-NNN — [question title]

Opened: YYYY-MM-DD
Context: [why this matters now]
Options:
- A: [option]
- B: [option]
Trade-offs: [costs, risks, reversibility]
Leaning: [current recommendation or none]
Needed from human: [decision/input needed]
```

`OD-NNN` is sequential and never reused (its own counter — the question only earns a `D-NNN` once decided). `Opened:` lets doctor age each entry individually (SY-02). When decided: create a D-NNN in state/decisions.md with a `Closes: OD-NNN` line, update any references to the OD to point at the D-NNN, then **remove the entry here in the same change** — no "DECIDED" tombstones; the `Closes:` line is the permanent trace. doctor checks numbering via SY-03 and flags leftover decided entries via SY-06.

### R-NNN — Risk

```markdown
## R-NNN — [risk title]

Opened: YYYY-MM-DD
Severity: low|medium|high
Status: open|mitigated|accepted|closed
Trigger: [what would make this real]
Mitigation: [what reduces likelihood or impact]
Owner: human|agent|shared
```

Use for project, launch, safety, strategy, or blocker risks. Do not turn every
minor uncertainty into an R-entry; lightweight notes can stay in the owning
domain until they affect a decision or gate.

### L-NNN — Learning (Agent System Weakness)

```markdown
## L-NNN — [short learning title]

Date: YYYY-MM-DD
Trigger: [what exposed the weakness]
Systemic cause: [why the framework allowed it]
Adjustment: [what changed in files/process/checks]
Follow-up: [optional]
```

Added only when a systemic agent/framework weakness is identified and
structurally fixed. Ordinary product bugs go to the repo issue tracker, a test,
a local domain task, or `pm/`. If a bug exposes a technical decision, record a
D-NNN; if it creates project, launch, or safety exposure, record an R-NNN.

## File templates

### Domain file (`context/<domain>.md`)

> Domain (topic) files live under `context/` — one canonical home per topic; discovered via `state/map.md`, not individually registered in §2.

```markdown
# [Domain name]

> Belongs here: [short positive scope]. Not here: [only ambiguous exclusions with pointer].

## Tasks

- [ ] [Small local task tied to this domain.]

[Content begins here. Omit ## Tasks when there are no local tasks.]
```

Domain tasks are optional. Use them only for small tasks tied to that domain.
Project-wide planning belongs in `pm/` or the project's planning convention;
human-only tasks belong in `HUMAN-TODOS.md`; undecided questions belong in
`state/open-decisions.md`. Remove or check off completed local tasks and clean
them up promptly. Keep the first blockquote one line so `truss map` can use it.
When a domain file grows beyond ~450 lines or five distinct themes, split it
into a folder or separate domain files.


### N-1 Table Overview (Snippets)

For overviews grouping N items into 1 category (many-to-one), use this table format to compress information compactly:

```markdown
| Category / Group | Items (N) |
|---|---|
| [Category A] | - [Item 1]<br>- [Item 2]<br>- [Item 3] |
| [Category B] | - [Item 4]<br>- [Item 5] |
```

Use this whenever summarizing multiple files, phases, or items mapped to a single parent to maintain readability without deep nesting.

## Naming conventions

- Files: lowercase, hyphens, English. No spaces, no underscores, no CamelCase.
- Folders: same rules. No trailing slash in references.
- Domain files: noun or noun-phrase (e.g. `pricing.md`, `user-research.md`).
- IDs in prose: always include prefix (D-001, not just 001).
