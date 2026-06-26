# Conventions

> Load when: writing your first D-/HT-/R- entry this session, or creating a new file type.
> Defines ID schemes, entry grammars, and file templates.

## ID schemes

IDs are sequential integers, zero-padded to three digits. Never reused. Issued in the file they belong to.

| Prefix | File | Owner | Meaning |
|---|---|---|---|
| D-NNN | state/decisions.md | A | Decided decision |
| HT-NNN | HUMAN-TODOS.md | A | Human-only todo |
| R-NNN | state/risks.md | A | Risk (create file when first needed) |
| OD-NNN | state/open-decisions.md | A | Open decision briefing |
| L-NNN | state/learnings.md | A | Learning from systemic agent weakness |

## Entry grammars

### D-NNN — Decided decision

```markdown
## D-NNN — [short decision title]

[What was decided, why, and consequences. Format is flexible.]
```

Superseding: add a `Superseded-by: D-MMM` line under the entry and a `> Superseded by D-MMM (YYYY-MM-DD): [reason]` note below. Never delete the original entry.

### HT-NNN — Human todo

```
- [ ] HT-NNN — [what the human needs to do] — [context or deadline if relevant]
```

Check off with `[x]` when done. Never delete.

### OD-NNN — Open decision briefing

```markdown
## OD-NNN — [question title]

Opened: YYYY-MM-DD
[Options, trade-offs, and leanings. Format is flexible.]
```

`OD-NNN` is sequential and never reused (its own counter — the question only earns a `D-NNN` once decided). `Opened:` lets doctor age each entry individually (SY-02). When decided: create a D-NNN in state/decisions.md, then remove the entry here. doctor checks numbering via SY-03.

### R-NNN — Risk

```markdown
## R-NNN — [risk title]

[Severity, status, description, mitigation, trigger. Format is flexible.]
```


### L-NNN — Learning (Agent System Weakness)

```markdown
## L-NNN — [short learning title]

[Trigger, systemic cause, and adjustment. Format is flexible.]
```

Added when a systemic failure is identified and structurally fixed. doctor checks for proper ID sequencing.

## File templates

### Domain file (`context/<domain>.md`)

> Domain (topic) files live under `context/` — one canonical home per topic; discovered via `state/map.md`, not individually registered in §2.

```markdown
# [Domain name]

> [One sentence: what belongs here and what does not.]

[Content begins here. No sub-headings needed until the file grows beyond ~150 lines.]
```


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
