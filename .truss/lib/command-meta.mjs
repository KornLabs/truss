// lib/command-meta.mjs — single source of truth for the CLI command surface.
//
// Both the dispatcher's help text AND the dashboard's action whitelist derive
// from this one list, so "documented but not dispatched" or "whitelisted but
// not implemented" drift (the class of bug that left `tag` half-wired) cannot
// recur. Data only — NO handler imports, so the dashboard can import it cheaply.
//
//   name          dispatch key (process.argv command)
//   display       left column in `truss help`
//   summary       right column in `truss help`
//   dashboardSafe true → reachable via the dashboard /api/action executor
//                 (confined writers + read-only checks only; never init)

export const COMMAND_META = [
  { name: 'status',    display: 'status',            summary: 'show a compact workspace status summary',          dashboardSafe: false },
  { name: 'doctor',    display: 'doctor [flags]',    summary: 'check workspace health (all findings, by severity)', dashboardSafe: true },
  { name: 'render',    display: 'render',            summary: 'sync phase block in AGENTS.md from state/phases.md', dashboardSafe: true },
  { name: 'phase',     display: 'phase [<id>]',      summary: 'show phases, or set the current phase and re-render', dashboardSafe: false },
  { name: 'set',       display: 'set <key> <val>',   summary: 'update a preference in the preferences block',      dashboardSafe: true },
  { name: 'init',      display: 'init [flags]',      summary: 'configure a fresh workspace (flags or interactive)', dashboardSafe: false },
  { name: 'map',       display: 'map',               summary: 'regenerate the state/map.md domain file overview',  dashboardSafe: true },
  { name: 'dashboard', display: 'dashboard [flags]', summary: 'start the local web dashboard',                     dashboardSafe: false },
  { name: 'prompt',    display: 'prompt <cmd> <id>', summary: 'manage custom prompts (save, reset, delete)',       dashboardSafe: true },
  { name: 'help',      display: 'help',              summary: 'show this message',                                 dashboardSafe: false },
]

// Commands the dashboard action executor is allowed to invoke.
export const DASHBOARD_SAFE_COMMANDS = COMMAND_META.filter(c => c.dashboardSafe).map(c => c.name)
