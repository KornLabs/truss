// lib/scaffold.mjs — The single writer for WHOLE files (GE-9, A3).
//
// Division of responsibility (GE-9):
//   - writer.mjs   → the only writer of the two GENERATED BLOCKS in AGENTS.md.
//   - scaffold.mjs → the only writer of WHOLE files (init baseline skeletons).
// No third write site exists. init never touches the filesystem except through here.
//
// Contract (A3):
//   - Atomic: temp file + rename, with a direct-write fallback for restricted
//     sandboxes — exactly the strategy writer.mjs uses for the blocks.
//   - Never overwrites: if the destination already exists, it is left untouched
//     and reported as 'skipped-exists'. No silent clobbering of existing work.
//   - Returns a status per file so callers can build a bundled conflict report.
//
// Zero external dependencies — node: built-ins only.

import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Write a whole file atomically, never overwriting an existing destination.
 *
 * Creates parent directories as needed. Writes to `<absPath>.tmp` then renames
 * onto the destination; if rename fails (cross-device, restricted sandbox) it
 * falls back to a direct write. The no-overwrite guard is checked first via
 * fs.access — there is an inherent TOCTOU window, but truss init/add run
 * single-threaded against a quiescent workspace, so a concurrent creator is out
 * of scope (one root agent at a time, STRUKTUR §8 "Concurrent Agents").
 *
 * @param {string} absPath  Absolute path of the destination file.
 * @param {string} content  Full file contents to write.
 * @returns {Promise<{status: 'written'|'skipped-exists'|'error', path: string, error?: string}>}
 *   - 'written'        the file did not exist and was created.
 *   - 'skipped-exists' the file already existed and was left untouched.
 *   - 'error'         the write failed; `error` carries the message.
 */
export async function writeFileSafe(absPath, content) {
  // No-overwrite guard (A3): an existing destination is a conflict, never clobbered.
  try {
    await fs.access(absPath)
    return { status: 'skipped-exists', path: absPath }
  } catch {
    // Does not exist — proceed to write.
  }

  try {
    await fs.mkdir(path.dirname(absPath), { recursive: true })
  } catch (err) {
    return { status: 'error', path: absPath, error: err.message }
  }

  // Atomic write via temp + rename, mirroring writer.mjs's strategy.
  const tmpPath = absPath + '.tmp'
  try {
    await fs.writeFile(tmpPath, content, 'utf8')
    await fs.rename(tmpPath, absPath)
    return { status: 'written', path: absPath }
  } catch {
    // rename may fail across devices or in restricted sandboxes — direct write fallback.
    try { await fs.unlink(tmpPath) } catch {}
    try {
      await fs.writeFile(absPath, content, 'utf8')
      return { status: 'written', path: absPath }
    } catch (err) {
      return { status: 'error', path: absPath, error: err.message }
    }
  }
}

/**
 * Recursively copy every file under `srcDir` into `destDir`, mirroring the
 * relative layout. Each file goes through writeFileSafe, so existing files in
 * the destination are never overwritten — they are collected as `skipped`.
 *
 * Directories are created implicitly by writeFileSafe (an empty source
 * directory produces no destination directory — truss has no empty-folder
 * concept, AGENTS.md §5).
 *
 * @param {string} srcDir   Absolute path of the source tree (e.g. the baseline).
 * @param {string} destDir  Absolute path of the destination root (e.g. the workspace root).
 * @returns {Promise<{written: string[], skipped: string[], errors: Array<{path: string, error: string}>}>}
 *   Paths are absolute destination paths. `errors` pairs each failed path with its message.
 */
export async function applyTree(srcDir, destDir) {
  const result = { written: [], skipped: [], errors: [] }

  /** @param {string} relDir  path relative to srcDir, '' at the root */
  const walk = async (relDir) => {
    const absSrcDir = path.join(srcDir, relDir)
    let entries
    try {
      entries = await fs.readdir(absSrcDir, { withFileTypes: true })
    } catch (err) {
      result.errors.push({ path: absSrcDir, error: err.message })
      return
    }

    for (const entry of entries) {
      const rel = relDir ? path.join(relDir, entry.name) : entry.name
      if (entry.isDirectory()) {
        await walk(rel)
      } else if (entry.isFile()) {
        const absSrc = path.join(srcDir, rel)
        const absDest = path.join(destDir, rel)
        let content
        try {
          content = await fs.readFile(absSrc, 'utf8')
        } catch (err) {
          result.errors.push({ path: absSrc, error: err.message })
          continue
        }
        const r = await writeFileSafe(absDest, content)
        if (r.status === 'written') result.written.push(r.path)
        else if (r.status === 'skipped-exists') result.skipped.push(r.path)
        else result.errors.push({ path: r.path, error: r.error })
      }
      // Symlinks and other entry types are intentionally ignored — the baseline
      // is a plain file tree.
    }
  }

  await walk('')
  return result
}
