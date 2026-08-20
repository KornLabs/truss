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
//   flags         every flag the command accepts, `value: true` when the flag
//                 consumes the following token. The dispatcher rejects anything
//                 else and routes `--help` at ANY position to the help text, so
//                 a typo can never fall through into a writing command (D-060).
//   literalFrom   index in the command's argument list from which tokens are
//                 user payload, not CLI syntax (prompt bodies, preference
//                 values). Nothing at or past it is inspected.

export const COMMAND_META = [
  {
    name: 'status', display: 'status', dashboardSafe: false,
    summary: 'show a compact workspace status summary',
    flags: {},
  },
  {
    name: 'doctor', display: 'doctor [flags]', dashboardSafe: true,
    summary: 'check workspace health (all findings, by severity)',
    flags: { '--gate': {}, '--html': {}, '--json': {}, '--fix-prompt': {} },
  },
  {
    name: 'render', display: 'render', dashboardSafe: true,
    summary: 'sync phase block in AGENTS.md from state/phases.md',
    flags: {},
  },
  {
    name: 'phase', display: 'phase [<id>] [--override-gate]', dashboardSafe: false,
    summary: 'show phases, or gate and set the current phase',
    flags: { '--override-gate': {} },
  },
  {
    name: 'set', display: 'set <key> <val>', dashboardSafe: true,
    summary: 'update a preference in the preferences block',
    flags: {}, literalFrom: 1,
  },
  // ack writes only .truss/out/ (gitignored runtime state) and never touches
  // workspace content, but it records a human judgement — so it stays off the
  // dashboard action executor: nothing should be able to quiet a budget warning
  // without someone deciding to.
  {
    name: 'ack', display: 'ack context [flags]', dashboardSafe: false,
    summary: 'record that the boot context was reviewed at its current size',
    flags: { '--clear': {}, '--note': { value: true, equals: false } },
  },
  {
    name: 'init', display: 'init [flags]', dashboardSafe: false,
    summary: 'configure a fresh workspace (flags or interactive)',
    flags: {
      '--name': { value: true }, '--lang': { value: true },
      '--overlay': {}, '--code-root': { value: true },
      '--adopt-agents': {}, '--root': { value: true },
      '--skills': { value: true },
    },
  },
  {
    name: 'skills', display: 'skills <list|add|remove> [group]',
    dashboardSafe: false,
    summary: 'manage baseline skill groups',
    flags: {},
  },
  {
    name: 'upgrade', display: 'upgrade [flags]', dashboardSafe: false,
    summary: 'lift an existing workspace to this engine version',
    flags: { '--force': {}, '--dry-run': {}, '-n': {}, '--root': { value: true } },
  },
  {
    name: 'map', display: 'map', dashboardSafe: true,
    summary: 'regenerate the state/map.md domain file overview',
    flags: {},
  },
  {
    name: 'dashboard', display: 'dashboard [flags]', dashboardSafe: false,
    summary: 'start the local web dashboard',
    flags: { '--port': { value: true, equals: false }, '--no-open': {}, '--read-only': {} },
  },
  {
    name: 'prompt', display: 'prompt <cmd> <id>', dashboardSafe: true,
    summary: 'manage custom prompts (save, reset, delete)',
    flags: {}, literalFrom: 2,
  },
  {
    name: 'help', display: 'help', dashboardSafe: false,
    summary: 'show this message',
    flags: {},
  },
]

// Commands the dashboard action executor is allowed to invoke.
export const DASHBOARD_SAFE_COMMANDS = COMMAND_META.filter(c => c.dashboardSafe).map(c => c.name)

export const COMMAND_BY_NAME = new Map(COMMAND_META.map(c => [c.name, c]))

const HELP_FLAGS = new Set(['--help', '-h'])

/**
 * Inspect one command's arguments against its declared flag surface.
 *
 * Returns `{ help: true }` when `--help`/`-h` appears anywhere the command reads
 * as syntax, `{ unknown: '<flag>' }` for anything not declared, else `{}`.
 * Values of value-taking flags and everything from `literalFrom` on are payload
 * and never inspected — a prompt body may legitimately start with a dash.
 */
export function inspectArgs(meta, args) {
  const literalFrom = meta.literalFrom ?? Infinity
  for (let i = 0; i < args.length && i < literalFrom; i++) {
    const arg = args[i]
    if (typeof arg !== 'string' || !arg.startsWith('-') || arg === '-') continue
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
    if (HELP_FLAGS.has(name)) return { help: true }
    const spec = meta.flags[name]
    if (!spec) return { unknown: arg }
    if (arg.includes('=') && spec.equals === false) return { unknown: arg }
    // Skip the value token so `--note --clear` keeps "--clear" as the note.
    if (spec.value && !arg.includes('=')) i++
  }
  return {}
}
