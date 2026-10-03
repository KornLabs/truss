# Team mode

> Load when: working in a workspace that has `state/team.md`, or setting one up.
> Optional. Truss is built for one person carrying a project; team mode lets a small team share one workspace, each person on their own machine and their own clone, identified by their GitHub login.

## Switching it on

```sh
node .truss/bin/truss.mjs init --name <project> --lang <language> --team [--as @<your-login>]   # new workspace
node .truss/bin/truss.mjs team enable [--as @<your-login>]                                       # existing workspace
```

Both do the same thing, once (running `enable` again changes nothing):

- they write `state/team.md` with your line;
- they add the routing lines to AGENTS.md: §1 (your focus file and your notes), §2 (`state/team.md`, `state/personal.md`, `state/current/`, `state/links.md`) and §6 (this document);
- they set `auto-commit=on` and `git-flow=team`;
- they add `state/personal.md` to `.gitignore` and create yours;
- they add `state/links.md merge=union` to `.gitattributes`.

A workspace switched on with 1.2.0 gets the new lines by running `team enable` again.

A workspace is in team mode exactly when `state/team.md` exists. Team mode needs the findings channel (`state/truss-findings.md`), so `init --team --findings off` is refused.

Without `--as`, your login comes from `TRUSS_USER`, `git config truss.user`, `git config github.user` or `gh api user`, in that order.

## Who is who — `state/team.md`

```markdown
- @alex — Alex Example · role: product, engineering · domains: backend, infrastructure
- @sam — Sam Example · role: marketing · domains: marketing, sales
```

One line per member; `role:` and `domains:` are optional. **Roles describe, they grant nothing.** They tell an agent whom it works for and whose a domain is, so it loads that person's domains first and knows whom to ask. Nothing in Truss blocks a write by role.

Each clone says once who it is:

```sh
node .truss/bin/truss.mjs team whoami @<your-login>    # stored in git config --local, never committed
```

It also creates this clone's `state/personal.md`, if missing.

`truss status` then opens with `Team: you are @… — …`, names your focus file, and lists what the others committed since the last `status` in this clone. "Others" means a git author email different from your `user.email`. The mark is per clone, so a second session in the same clone sees only what arrived after the first one looked. `status` never calls the network: if your login is only known to `gh`, run `team whoami` once. Git carries authorship: every agent commits under its person's git identity, so there is no `By:` field.

## Your own notes — `state/personal.md`

Each clone has one gitignored file the agent reads every session (§1): how its person likes to work, what they know and what they do not — "new to git, do every git step yourself", "short answers". It is never committed, so nobody else reads it, and it does not travel to a second machine. Team-wide rules stay in `state/profile.md`; "remember this" goes to `personal.md` when it is about this one person.

## Focus: one team file, one file per person

`state/current.md` holds the team's shared focus. Each person also has `state/current/<login>.md`: same keys and limits (`focus:`, `next:` with at most 5 entries, `blockers:`). It is the file you rewrite, so three people never fight over one snapshot. Split work into domains early (`context/<domain>.md`); `domains:` in `state/team.md` says whose each one is.

## Git flow (`git-flow=team`)

Everyone works on `main`. There are no personal branches and no pull requests, so nothing has to be merged back and forth.

```sh
node .truss/bin/truss.mjs sync
```

The agent runs `sync` at session start, after every commit and before it reports done. It:

1. fetches, then rebases your local commits onto what the others pushed (uncommitted work is carried along with `--autostash`);
2. regenerates `state/map.md` and `state/decisions-index.md` when both sides changed them — a conflict there is never a disagreement;
3. pushes, and retries when someone else pushed in the meantime.

It never commits your work for you: the agent commits its own paths (`git commit -- <paths>`), then syncs. It stops, with the rebase paused, on a conflict in a file people write. The agent resolves it — keeps both sides of an appended list, renumbers an entry ID the other side already took, merges two edits that do not contradict — runs `git add`, and syncs again. It asks its person only when the two sides genuinely contradict each other. Exit code 0 means in sync, 1 means it needs attention.

`truss status` shows where the clone stands from the last fetch (`Sync:` line): commits not pushed, new commits on origin, uncommitted paths, a paused rebase. An agent that sees anything there runs `sync` first.

Any member may change anything, decisions included; `current:` in `state/phases.md` changes only on a person's word, never on an agent's own initiative. There is no approval step. The others learn about a change from the feed in `status`, and every change stays in `git log`.

Agent sandboxes that block the network or writes to `.git/` (Codex by default) cannot sync. Allow `git` and `gh` once, permanently, or the work stays on one machine.

## Optional CI

```sh
node .truss/bin/truss.mjs ci add doctor
```

- **`truss-doctor`** runs `doctor` on every push and pull request. It is red only on errors.
- **`truss-merge`** is for teams that do use pull requests (the team flow above does not need it). It merges a pull request from a branch of this repository as soon as `doctor` reports no error. On errors it comments the findings and waits for the next push. It exists because GitHub's own auto-merge is not available for private repositories on GitHub Free.

The merge workflow:

- checks the merge result (`main` plus the pull request), so an ID that another pull request already took on `main` shows up before the merge;
- merges only when `doctor` printed its report with no error — a crashed or missing engine counts as an error;
- does not re-check `main` after its own merge, because merges made with `GITHUB_TOKEN` trigger no further workflows;
- cannot merge a pull request that changes `.github/workflows/`, because `GITHUB_TOKEN` may not write workflows. Merge such a pull request by hand;
- stops when the pull request conflicts with `main`: rebase the branch and push again.

If the repository allows workflows only read access, enable "Read and write permissions" under Settings → Actions → General.

**No run after the first push?** Observed on 2026-10-02: workflows that arrived with the push that created the repository were listed as active but never triggered — not on later pushes, not on pull requests; a workflow added in a later commit ran at once. If that happens, re-add them in two pushes:

```sh
node .truss/bin/truss.mjs ci remove doctor merge && git commit -m "ci: re-register workflows" -- .github/workflows && git push
node .truss/bin/truss.mjs ci add doctor merge && git add .github/workflows && git commit -m "ci: re-register workflows" -- .github/workflows && git push
```

After `truss upgrade`, `truss ci list` shows a workflow from the older Truss as `modified`; `truss ci add <name> --force` replaces it. `truss ci list` shows what is installed. `truss ci remove <name>` deletes a workflow only if it still matches its template.

## What a team cannot see: `state/links.md`

Some work lives in a repository not everyone can access — the code, for instance. Keep it there, in its own Truss workspace. `state/links.md` names it, so an agent that misses it knows the gap is deliberate:

```markdown
## backend

Repo: github.com/acme/backend (private)
Owner: @alex
Holds: the code and its technical decisions

### Requests

- [ ] 2026-10-02 @sam — the signup form needs a "company" field

### Notes

- 2026-10-03 — company field ships with the next deploy
```

**What a link holds is not yours to build here.** If your task needs it, add a request and stop that part of the work. The owner ticks a request off (`[x]`) and answers under Notes.

On the owner's machine, each workspace knows where the other lives:

```sh
node .truss/bin/truss.mjs team link backend ~/src/backend    # in the shared workspace
node .truss/bin/truss.mjs team link team ~/src/team          # in the backend workspace
```

`status` then shows the open requests on both sides: under `Links:` in the shared workspace, and as `Linked: … open requests for you there` in the other.

`merge=union` lets two people append requests at the same time without a conflict (in a local rebase — `sync` uses one; GitHub's server-side merge of a pull request ignores it). Its one side effect: a request that was ticked off while someone appended right below it can survive twice, once open and once done. `doctor` (TM-04) names the duplicate; delete the stale copy.

`HUMAN-TODOS.md` entries may name their doer with an indented `For: @login` line. `status` shows yours first.

## Limits

GitHub enforces exactly one thing on a private repository with GitHub Free: **who can access which repository**. Branch protection, rulesets, CODEOWNERS and native auto-merge need a public repository or a paid plan.

So, inside one shared repository:

- any collaborator can push to `main` directly;
- any collaborator can edit the workflows;
- a local identity is a hint anyone can set; only the server knows who pushed (`github.actor`).

Team mode makes changes visible and keeps the flow consistent. It does not stop a person. What must really stay with one person belongs in a repository only they can access.

Hosts without a shell (chat-only agents) cannot commit or push, so they cannot take part.

## Checks

| ID | What it reports |
|---|---|
| TM-01 | `state/team.md`: a member line does not parse, a login is listed twice, or the team is empty |
| TM-02 | team mode without `auto-commit=on` and `git-flow=team` |
| TM-03 | team mode without the findings channel |
| TM-04 | `state/links.md`: a missing `Repo:`/`Owner:`/`Holds:`, a request that does not parse or is listed twice, a login outside the team |
| TM-05 | a personal focus file breaks the `current.md` contract, or belongs to no member |
| TM-06 | an HT entry is addressed to someone who is not a member |
