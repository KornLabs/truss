// lib/commands/prompt.mjs — `truss prompt <save|reset|delete> <id> [content]`
//
// The ONLY writer for custom prompts (D-001). Writes EXCLUSIVELY inside
// .truss/prompts/custom/ and never touches base prompts. This is the single
// implementation the dispatcher and the dashboard action API both use — there is
// no second copy (the previous inline duplicate in bin/truss.mjs was removed).
//
// Sub-commands (as invoked by dashboard/ui/api.js):
//   save <id> <content>  → write custom/<id>.md (content from argv, may be empty)
//   reset <id>           → copy base/<id>.md → custom/<id>-custom.md (editable copy)
//   delete <id>          → remove custom/<id>.md
//
// Zero external dependencies — node: built-ins only.

import fs from 'node:fs/promises'
import path from 'node:path'

const validId = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s) && s.length <= 80

export async function runPrompt(root, argv) {
  const [sub, id, content] = argv
  const customDir = path.join(root, '.truss', 'prompts', 'custom')
  const baseDir = path.join(root, '.truss', 'prompts', 'base')

  if (!['save', 'reset', 'delete'].includes(sub)) {
    console.error('Usage: truss prompt <save|reset|delete> <id> [content]'); process.exit(1)
  }
  if (!validId(id)) {
    console.error(`truss prompt: invalid id '${id}' (allowed: a-z 0-9 -)`); process.exit(1)
  }

  // Resolve + confine the target to customDir (defense in depth against traversal).
  const target = path.join(customDir, `${id}.md`)
  if (path.relative(customDir, target).startsWith('..') || path.dirname(target) !== customDir) {
    console.error('truss prompt: refusing to write outside prompts/custom/'); process.exit(2)
  }

  try {
    await fs.mkdir(customDir, { recursive: true })
    if (sub === 'save') {
      await fs.writeFile(target, String(content ?? ''), 'utf8')
      console.log(`truss prompt: saved ${id}`)
    } else if (sub === 'reset') {
      const src = path.join(baseDir, `${id}.md`)
      const body = await fs.readFile(src, 'utf8')
      const dest = path.join(customDir, `${id}-custom.md`)
      await fs.writeFile(dest, body, 'utf8')
      console.log(`truss prompt: reset ${id}-custom from base`)
    } else if (sub === 'delete') {
      await fs.unlink(target)
      console.log(`truss prompt: deleted ${id}`)
    }
  } catch (err) {
    console.error(`truss prompt: ${err.message}`); process.exit(2)
  }
}
