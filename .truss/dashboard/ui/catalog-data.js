// Browser-facing catalogue facts. Contract tests keep these aligned with the
// engine metadata; labels and descriptions remain curated for the dashboard.

export const PREFERENCE_GROUPS = [
  { title: 'Autonomy & safety', items: [
    { key: 'orchestration', label: 'Orchestration', values: ['low', 'medium', 'high'], def: 'medium', desc: 'How freely the agent orchestrates multi-step tasks (build, analyze) without checking in.' },
    { key: 'phase-lock', label: 'Phase lock', values: ['off', 'advisory'], def: 'advisory', desc: 'If an action violates the phase forbidden list: ignore, or stop and ask.' },
    { key: 'gate-advocate', label: 'Gate advocate', values: ['off', 'on', 'agentic'], def: 'agentic', desc: 'Adversarial review at phase exit: report only (on), or fix agent-fixable findings and re-verify before the single exit HT (agentic).' },
  ]},
  { title: 'Rigor & verification', items: [
    { key: 'criticality', label: 'Criticality', values: ['low', 'medium', 'high'], def: 'high', desc: 'How aggressively it names weaknesses in inputs and plans before executing.' },
    { key: 'input-trust', label: 'Input trust', values: ['open', 'medium', 'critical'], def: 'medium', desc: 'How much it verifies the claims and figures you hand it.' },
    { key: 'clarify', label: 'Clarify', values: ['ask', 'infer'], def: 'ask', desc: 'When intent is unclear: ask first, or infer and state assumptions.' },
    { key: 'source-citation', label: 'Source citation', values: ['off', 'on'], def: 'off', desc: 'Whether the agent cites the sources and references it used.' },
    { key: 'post-task-check', label: 'Post-task check', values: ['off', 'inline', 'subagent'], def: 'inline', desc: 'Run doctor after tasks: never, inline, or via a subagent.' },
  ]},
  { title: 'Subagents & delegation', items: [
    { key: 'research-agent', label: 'Research subagents', values: ['off', 'on'], def: 'on', desc: 'Allow spawning research subagents without an explicit instruction.' },
    { key: 'review-agent', label: 'Review subagents', values: ['off', 'on'], def: 'on', desc: 'Allow spawning critical-review subagents on its own.' },
  ]},
  { title: 'Git & workflow', items: [
    { key: 'scope', label: 'Solution scope', values: ['off', 'minimal', 'balanced', 'thorough'], def: 'off', desc: 'How much solution to build: the smallest thing that works, matched to the problem, or full edge-case coverage. Off imposes no bias.' },
    { key: 'auto-commit', label: 'Auto-commit', values: ['off', 'suggest', 'on'], def: 'suggest', desc: 'After a logical unit: do nothing, propose a message, or commit.' },
    { key: 'branch-guard', label: 'Branch guard', values: ['off', 'warn', 'strict'], def: 'warn', desc: 'Compare the configured code-root branch with state/current.md before work.' },
  ]},
  { title: 'Response & session', items: [
    { key: 'response-style', label: 'Verbosity', values: ['normal', 'compact', 'maxcompact'], def: 'normal', desc: 'How terse responses are: normal prose, compact (no filler), or maxcompact (telegraphic — form compressed, never content). Emojis are always off.' },
    { key: 'control-word', label: 'Control word', values: ['off'], free: true, def: 'TRUSS', suggestions: ['TRUSS'],
      desc: 'Have the agent open every response with `<WORD> — …`. If the marker goes missing, the session may be losing context. Pick Off, a preset, or your own word.' },
  ]},
]

export const CHECK_CATALOG = [
  { id: 'BL-01', sev: 'E', desc: 'Block marker missing, duplicated, or unpaired' },
  { id: 'BL-02', sev: 'E', desc: 'Phase block drifted from state/phases.md' },
  { id: 'BL-03', sev: 'E', desc: 'Preferences block: bad key, value, or grammar' },
  { id: 'CX-01', sev: 'W', desc: 'mandatory Truss boot metadata exceeds the token budget' },
  { id: 'HY-01', sev: 'I', desc: 'archive candidate: context domain file untouched > 90 days' },
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
  { id: 'SY-01', sev: 'W', desc: 'current.md missing a required key or stale (> 7 days)' },
  { id: 'SY-02', sev: 'I', desc: 'open-decisions.md holds an entry open > 30 days' },
  { id: 'SY-03', sev: 'W', desc: 'state entry grammar violated (profile / decisions / open-decisions / risks / learnings / HUMAN-TODOS)' },
  { id: 'SY-05', sev: 'W', desc: 'code-root checkout present but no branch: declared in current.md' },
  { id: 'SY-06', sev: 'W', desc: 'decided open-decision entry still present (tombstone)' },
  { id: 'SY-07', sev: 'I', desc: 'HUMAN-TODOS.md accumulates checked-off entries' },
]
