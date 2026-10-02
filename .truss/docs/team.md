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
- they add the routing lines to AGENTS.md: §1 (your focus file), §2 (`state/team.md`, `state/current/`, `state/links.md`) and §6 (this document);
- they set `auto-commit=on` and `git-flow=team`;
- they add `state/links.md merge=union` to `.gitattributes`.

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

`truss status` then opens with `Team: you are @… — …`, names your focus file, and lists what the others committed since the last `status` in this clone. "Others" means a git author email different from your `user.email`. The mark is per clone, so a second session in the same clone sees only what arrived after the first one looked. `status` never calls the network: if your login is only known to `gh`, run `team whoami` once. Git carries authorship: every agent commits under its person's git identity, so there is no `By:` field.

## Focus: one team file, one file per person

`state/current.md` holds the team's shared focus. Each person also has `state/current/<login>.md`: same keys and limits (`focus:`, `next:` with at most 5 entries, `blockers:`). It is the file you rewrite, so three people never fight over one snapshot. Split work into domains early (`context/<domain>.md`); `domains:` in `state/team.md` says whose each one is.

## Git flow (`git-flow=team`)

- Ordinary work goes straight to `main`: `git pull --rebase`, then push, after every logical unit (`auto-commit=on`).
- These paths go through a pull request on a branch `team/<login>/<topic>`, so the others see them arrive:
  - `current:` in `state/phases.md`
  - the preferences and phase definitions
  - `state/team.md`
  - a link's `Repo:`, `Owner:` or `Holds:` in `state/links.md`
  - `VISION.md`

  Requests and notes in `state/links.md` go straight to `main`. Their union merge only works in your local `git pull --rebase`; GitHub's server-side merge of a pull request does not apply it.
- **Rebase conflicts:**
  - In a generated file, regenerate it (`truss render`, `truss map`) instead of merging it.
  - In an appended list, keep both sides.
  - When two clones took the same entry ID, renumber yours before you push. `doctor` reports a duplicate as RF-03.
  - When the conflict is a disagreement between people, ask.

Any member may change a decision; `current:` in `state/phases.md` changes only on a person's word, never on an agent's own initiative. There is no approval step. The others learn about it from the feed in `status`.

## Optional CI

```sh
node .truss/bin/truss.mjs ci add doctor merge
```

- **`truss-doctor`** runs `doctor` on every push and pull request. It is red only on errors.
- **`truss-merge`** merges a pull request from a branch of this repository as soon as `doctor` reports no error. On errors it comments the findings and waits for the next push. It exists because GitHub's own auto-merge is not available for private repositories on GitHub Free.

The merge workflow:

- checks the merge result (`main` plus the pull request), so an ID that another pull request already took on `main` shows up before the merge;
- merges only when `doctor` printed its report with no error — a crashed or missing engine counts as an error;
- does not re-check `main` after its own merge, because merges made with `GITHUB_TOKEN` trigger no further workflows;
- cannot merge a pull request that changes `.github/workflows/`, because `GITHUB_TOKEN` may not write workflows. Merge such a pull request by hand.

If the repository allows workflows only read access, enable "Read and write permissions" under Settings → Actions → General.

**No run after the first push?** Observed on 2026-10-02: workflows that arrived with the push that created the repository were listed as active but never triggered — not on later pushes, not on pull requests; a workflow added in a later commit ran at once. If that happens, re-add them in two pushes:

```sh
node .truss/bin/truss.mjs ci remove doctor merge && git commit -m "ci: re-register workflows" -- .github/workflows && git push
node .truss/bin/truss.mjs ci add doctor merge && git add .github/workflows && git commit -m "ci: re-register workflows" -- .github/workflows && git push
```

`truss ci list` shows what is installed. `truss ci remove <name>` deletes a workflow only if it still matches its template.

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

`merge=union` lets two people append requests at the same time without a conflict. Its one side effect: a request that was ticked off while someone appended right below it can survive twice, once open and once done. `doctor` (TM-04) names the duplicate; delete the stale copy.

`HUMAN-TODOS.md` entries may name their doer with an indented `For: @login` line. `status` shows yours first.

## Limits

GitHub enforces exactly one thing on a private repository with GitHub Free: **who can access which repository**. Branch protection, rulesets, CODEOWNERS and native auto-merge need a public repository or a paid plan.

So, inside one shared repository:

- any collaborator can push to `main` directly;
- any collaborator can edit the workflows;
- a local identity is a hint anyone can set; only the pull request author and `github.actor` are authenticated.

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
