// Browser-facing catalogue facts. Contract tests keep these aligned with the
// engine metadata; labels and descriptions remain curated for the dashboard.

export const PREFERENCE_GROUPS = [
  { title: 'Autonomy & safety', items: [
    { key: 'subagents', label: 'Subagents', values: ['off', 'research', 'full'], def: 'off', desc: 'Delegation the agent may start on its own: none, research only, or full (research, review and parallel task agents).' },
    { key: 'gate-advocate', label: 'Gate advocate', values: ['off', 'on', 'agentic'], def: 'off', desc: 'Adversarial review at phase exit: report only (on), or fix agent-fixable findings and re-verify before the single exit HT (agentic).' },
  ]},
  { title: 'Rigor & verification', items: [
    { key: 'verify-inputs', label: 'Verify inputs', values: ['off', 'on'], def: 'off', desc: 'Independently validate the claims, figures and prior results you hand it, instead of taking them at face value. Naming weaknesses in a plan is already a fixed rule in AGENTS.md §3.' },
    { key: 'clarify', label: 'Clarify', values: ['off', 'ask', 'infer'], def: 'off', desc: 'When intent is unclear: ask first, or infer and state assumptions. Naming the assumption is already a fixed rule in AGENTS.md §4.' },
  ]},
  { title: 'Git & workflow', items: [
    { key: 'scope', label: 'Solution scope', values: ['off', 'minimal', 'balanced', 'thorough'], def: 'off', desc: 'How much solution to build: the smallest thing that works, matched to the problem, or full edge-case coverage. Off imposes no bias.' },
    { key: 'auto-commit', label: 'Auto-commit', values: ['off', 'suggest', 'on'], def: 'off', desc: 'After a logical unit: do nothing, propose a message, or commit.' },
    { key: 'branch-guard', label: 'Branch guard', values: ['off', 'strict'], def: 'off', desc: 'Refuse to work while the code-root branch differs from state/current.md. Reporting the mismatch is already a fixed rule in AGENTS.md §4.' },
  ]},
  { title: 'Response & session', items: [
    { key: 'response-style', label: 'Verbosity', values: ['off', 'compact', 'maxcompact'], def: 'off', desc: 'How terse responses are: compact (no filler) or maxcompact (telegraphic — form compressed, never content). Off leaves your AI tool its own style.' },
    { key: 'control-word', label: 'Control word', values: ['off'], free: true, def: 'off', suggestions: ['TRUSS'],
      desc: 'Have the agent open every response with `<WORD> — …`. If the marker goes missing, the session may be losing context. Pick Off, a preset, or your own word.' },
  ]},
]

export const CHECK_CATALOG = [
  { id: 'BL-01', sev: 'E', desc: 'Block marker missing, duplicated, or unpaired' },
  { id: 'BL-02', sev: 'E', desc: 'Phase block drifted from state/phases.md' },
  { id: 'BL-03', sev: 'E', desc: 'Preferences block: bad key, value, or grammar' },
  { id: 'CX-01', sev: 'W', desc: 'mandatory Truss boot metadata exceeds the token budget' },
  { id: 'PH-01', sev: 'E', desc: 'phases.md grammar violated' },
  { id: 'PH-02', sev: 'E', desc: 'current: points to an unknown phase' },
  { id: 'PH-03', sev: 'W', desc: 'forbidden-globs match changed paths' },
  { id: 'PH-04', sev: 'E', desc: 'Phase exit criteria unmet' },
  { id: 'PH-05', sev: 'E', desc: 'phases.md present but defines no phases' },
  { id: 'PH-06', sev: 'W', desc: 'Exit file:/section: target unresolved (any phase)' },
  { id: 'PH-07', sev: 'I', desc: 'Forbidden-path evidence is incomplete' },
  { id: 'RF-01', sev: 'E', desc: 'Relative markdown link does not resolve' },
  { id: 'RF-02', sev: 'W', desc: 'Referenced ID has no definition' },
  { id: 'RF-03', sev: 'E', desc: 'ID defined more than once' },
  { id: 'RF-04', sev: 'W', desc: 'prompts: reference not found in library' },
  { id: 'ST-01', sev: 'E', desc: 'Structure-table path missing on disk' },
  { id: 'ST-02', sev: 'W', desc: 'New file — not yet in structure table (hint, not error)' },
  { id: 'ST-03', sev: 'W', desc: 'Empty table-managed directory' },
  { id: 'ST-04', sev: 'W', desc: 'Adapter stub does not point to AGENTS.md' },
  { id: 'ST-05', sev: 'I', desc: 'File exceeds growth-rule line limit (450)' },
  { id: 'ST-06', sev: 'E', desc: 'AGENTS.md or its §2 structure table could not be parsed' },
  { id: 'ST-07', sev: 'W', desc: 'Truss map is outdated' },
  { id: 'ST-08', sev: 'W', desc: 'AGENTS.md is missing a numbered top-level section' },
  { id: 'SY-01', sev: 'W', desc: 'current.md missing a required key' },
  { id: 'SY-03', sev: 'W', desc: 'state entry grammar violated (profile / decisions / open-decisions / risks / learnings / HUMAN-TODOS)' },
  { id: 'SY-05', sev: 'W', desc: 'code-root checkout present but no branch: declared in current.md' },
  { id: 'SY-06', sev: 'W', desc: 'decided open-decision entry still present (tombstone)' },
  { id: 'SY-07', sev: 'I', desc: 'HUMAN-TODOS.md accumulates checked-off entries' },
  { id: 'SY-08', sev: 'W', desc: 'ritual drift — workspace state changed after current.md was last updated' },
  { id: 'SY-09', sev: 'I', desc: 'decisions.md read cost is growing large' },
  { id: 'SY-10', sev: 'I', desc: 'open decision has been waiting a long time' },
  { id: 'SY-11', sev: 'W', desc: 'Challenged-by: points at an open decision that does not exist' },
]
