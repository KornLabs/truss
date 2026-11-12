# Boot-context cleanup

Use this guide when the boot context is over budget (doctor `CX-01`), or when you are asked to clean up a workspace. The goal: every session starts with only what it needs, and no decision, fact or rule gets lost on the way.

It is a guide, not a script. The principles bind. The steps are the usual order; adapt them to what you find, skip what wins nothing, and never commit an empty step.

## Principles

1. **Relocate, never delete.** A line that leaves a boot file lands unchanged in its new home, in the same commit. Shorten only afterwards, in the boot file. An exact duplicate may be dropped if you name the file that still holds it.
2. **Still true goes to a domain file, no longer true goes to the archive.** Current knowledge and task-specific rules move to `context/<domain>.md` (or `docs/` for a working convention), with one trigger line left behind if a task type needs it ("before deploying, read context/deploy.md"). History moves to `archive/`. A rule that still applies never goes to `archive/`.
3. **Rules that steer every session stay in AGENTS.md word for word:** HARD rules (money, pushing, production, secrets, destructive acts, anything irreversible) and rules about how work is done (when work counts as done, what to verify, what to regenerate or commit after a change). Their rationale may move out.
4. **Decisions are moved, never reworded or deleted.** Leave alone: the generated blocks in AGENTS.md, `state/decisions-index.md`, `state/map.md`, the §1 load order, and every line AGENTS.md shares with `.truss/baseline/AGENTS.md` (about 4k tokens in every workspace; not yours to trim).
5. **Unsure means keep.** Ending over budget with a written reason is a good result. Cutting something that still earns its place is not. Once you are under budget, stop.
6. **Ask before** you change a rule from principle 3, change what a decision says, change a phase's `forbidden` or `exit`, or work around a command that fails for reasons outside the workspace (sandbox, permissions).

## Steps

### 1. Prepare

- `git status` clean, branch as in `state/current.md`, and `node .truss/bin/truss.mjs sessions` shows no other active session. Otherwise stop and say so.
- Engine current: `node .truss/bin/truss.mjs update`. If a newer release exists, install it first (`update --install <version>`; on exit `3` follow `rituals/upgrade.md`) and commit it on its own. If the check cannot reach the network, note that and go on.
- Note the start commit (`git rev-parse HEAD`) and measure:

```bash
node .truss/bin/truss.mjs doctor --json >/dev/null 2>&1; node -e 'const b=require("./.truss/out/doctor.json").bootContext;for(const f of b.files)console.log(String(f.tokens).padStart(6),f.file);console.log(String(b.tokens).padStart(6),"TOTAL / budget",b.warnTokens)'
```

Keep the doctor findings too: at the end there must be no new ones.

### 2. Find the weight

The boot is the §1 files plus the current phase's `read:` list. Start where the most tokens are. The usual heavy spots, roughly by how much they tend to win:

- **A phase `read:` list** that loads a whole file every session, worst of all the decision log.
- **`state/current.md`** grown into a diary.
- **The decision index**, about 25 tokens per live decision.
- **Project text in AGENTS.md**, and long rows in its §2 and §6 tables.
- **`state/open-decisions.md`** with research inside the briefings, and **`VISION.md`** with evidence and history.

If a file has broken shape (lines pasted into a header, unknown keys, duplicated sections), repair that first, without shortening anything.

### 3. Trim, area by area

**state/current.md.** A snapshot, one line per item: `focus` says what is being worked on now, `next` holds up to 5 actions (facts are not actions), `recently-done` up to 7 lines (older ones to `archive/state/current-history.md`), `blockers` only what blocks now, with a pointer to the story. Other keys get routed: to a decision if one carries them (otherwise ask), a domain file, or the archive.

**Phase read list.** Keep a file only if nearly every session of the phase needs it; never the decision log or a §1 file. A change to `state/phases.md` needs a short D-NNN that quotes the old `read:` line, then `truss render`. A single `state/decisions.md` is first split with `truss split-decisions` (`--dry-run` first), in a commit of its own.

**Decision index.** Only moving a decision file to `archive/decisions/` shrinks the index. Archive:
- a decision **fully superseded** (no "only" in its status), or
- a **one-off act that was carried out** (a rename, a migration, an upgrade, a tool now configured), once you have opened a file that shows the result.

Keep every decision that limits a future choice ("only", "never", "always", a budget, a scope), is partly superseded, is named in an open item, or that a later one contradicts (then also open an OD for the contradiction). Move with `git mv`; if the archive already holds a body for that id, put the entry on top of it. Record each batch in `archive/decisions/README.md` with a line that does not start with the id (a line starting with `- D-NNN` counts as a definition and RF-03 fires):

```
- Archived 2026-11-12, superseded: D-010, D-014
- Archived 2026-11-12, carried by ops/install/autoinstall.yaml: D-016
```

**Open decisions.** Remove what a D-NNN already `Closes:` and any "was decided" tombstone (to `archive/open-decisions.md`). A briefing keeps the question, the options with one line of trade-off each, the recommendation and what it blocks; research and quotes go to the domain file.

**AGENTS.md project text.** Compare with `.truss/baseline/AGENTS.md`. Keep rules from principle 3. Move task-specific rules to their domain file with a trigger line. Drop what repeats a preference, a hook, a skill, `docs/` or a live decision, naming the carrier. Long table rows keep a short purpose; the detail goes where the row points.

**VISION.md and state/profile.md.** VISION keeps problem, idea, principles and constraints; evidence, history and plans go to `context/`. Profile: one line per entry.

### 4. Check

Commit each area on its own (`state: boot cleanup, <area>`). Before each commit, and once at the end, run the loss check against the start commit:

```bash
git add -A; S=<start-commit>; R=$(mktemp); A=$(mktemp)
git diff --cached --no-renames -U0 $S -- . ':(exclude)state/decisions-index.md' ':(exclude)state/map.md' | grep '^-' | grep -v '^---' | cut -c2- | grep -v '^[[:space:]]*$' | sort -u > "$R"
git diff --cached --no-renames -U0 $S | grep '^+' | grep -v '^+++' | cut -c2- | sort -u > "$A"
comm -23 "$R" "$A"
```

It lists every removed line that exists nowhere else. Allowed leftovers: the regenerated phase block, pieces of a line you split while repairing structure, the cleanup request in `focus`, and duplicates you named. Anything else is a loss: put it back.

At the end: `truss map` if `context/` changed, `truss render`, `truss doctor` with no new findings, measure again, and remove a focus line that asked for this cleanup.

### 5. Report

Short, in chat: Truss version, tokens per file before and after against the budget, what moved where, which decisions were archived and why, which rules left AGENTS.md and where they live now, and anything you stopped to ask about. If you are still over budget, say what is left and why it earns its place, and suggest `truss ack context` to the human instead of cutting further.
