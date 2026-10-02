// lib/commands/ci.mjs — truss ci <list|add|remove> [doctor|merge …]
//
// Optional GitHub Actions templates (D-116). Truss runs fully without them;
// they are an addition for workspaces on GitHub:
//   doctor  `truss doctor` on every push and pull request, red only on errors
//   merge   merges a pull request once doctor reports no error (D-115)
//
// The templates ship under .truss/ci/ and are copied to
// .github/workflows/. `add` and `remove` leave a file that differs from its
// template alone — an edited workflow is the human's. `add --force` replaces
// it, which is how a workflow from an older Truss is updated.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export class CiError extends Error {}

const TEMPLATES = {
  doctor: 'truss-doctor.yml',
  merge: 'truss-merge.yml',
}
const WORKFLOW_DIR = '.github/workflows'

const templateDir = () => path.join(fileURLToPath(import.meta.url), '..', '..', '..', 'ci')

// Line endings normalised: with core.autocrlf a checked-out workflow carries
// CRLF and would otherwise never match its template on Windows.
async function readMaybe(p) {
  try { return (await fs.readFile(p, 'utf8')).replace(/\r\n/g, '\n') } catch { return null }
}

/** State of each template in a workspace: absent | installed | modified. */
export async function ciState(root) {
  const out = []
  for (const [name, file] of Object.entries(TEMPLATES)) {
    const tpl = await readMaybe(path.join(templateDir(), file))
    const have = await readMaybe(path.join(root, WORKFLOW_DIR, file))
    out.push({ name, file: `${WORKFLOW_DIR}/${file}`, state: have === null ? 'absent' : have === tpl ? 'installed' : 'modified' })
  }
  return out
}

function pick(names) {
  const list = names.length ? names : []
  for (const n of list) {
    if (!TEMPLATES[n]) throw new CiError(`truss ci: unknown workflow '${n}'. Known: ${Object.keys(TEMPLATES).join(', ')}`)
  }
  if (!list.length) throw new CiError(`truss ci: name at least one workflow: ${Object.keys(TEMPLATES).join(', ')}`)
  return list
}

export async function runCi(root, argv) {
  const force = argv.includes('--force')
  const [sub, ...names] = argv.filter(a => a !== '--force')
  if (sub === 'list' || sub === undefined) {
    console.log('\ntruss ci — optional GitHub Actions workflows\n')
    for (const s of await ciState(root)) console.log(`  ${s.name.padEnd(7)} ${s.state.padEnd(10)} ${s.file}`)
    console.log('\n  doctor  runs `truss doctor` on every push and pull request (red only on errors)')
    console.log('  merge   merges a pull request once doctor reports no error — the team flow (.truss/docs/team.md)\n')
    return
  }
  if (sub === 'add') {
    for (const n of pick(names)) {
      const dest = path.join(root, WORKFLOW_DIR, TEMPLATES[n])
      const tpl = await readMaybe(path.join(templateDir(), TEMPLATES[n]))
      const have = await readMaybe(dest)
      if (have === tpl) { console.log(`  unchanged  ${WORKFLOW_DIR}/${TEMPLATES[n]}`); continue }
      if (have !== null && !force) { console.log(`  kept       ${WORKFLOW_DIR}/${TEMPLATES[n]} — it differs from the template (edited, or from an older Truss); --force replaces it`); continue }
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, tpl)
      console.log(`  ${have === null ? 'added   ' : 'replaced'}   ${WORKFLOW_DIR}/${TEMPLATES[n]}`)
    }
    console.log('\n  Commit and push the workflow files; GitHub runs them from the next push on.')
    return
  }
  if (sub === 'remove') {
    for (const n of pick(names)) {
      const dest = path.join(root, WORKFLOW_DIR, TEMPLATES[n])
      const tpl = await readMaybe(path.join(templateDir(), TEMPLATES[n]))
      const have = await readMaybe(dest)
      if (have === null) { console.log(`  absent     ${WORKFLOW_DIR}/${TEMPLATES[n]}`); continue }
      if (have !== tpl) { console.log(`  kept       ${WORKFLOW_DIR}/${TEMPLATES[n]} — edited by hand; delete it yourself if you mean to`); continue }
      await fs.rm(dest)
      console.log(`  removed    ${WORKFLOW_DIR}/${TEMPLATES[n]}`)
    }
    return
  }
  throw new CiError('Usage: truss ci <list|add|remove> [doctor] [merge] [--force]')
}
