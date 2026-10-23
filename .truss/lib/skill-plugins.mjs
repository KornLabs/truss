// lib/skill-plugins.mjs — the plugin groups' switch in .claude/settings.json (D-126).
//
// A plugin group ships no files. Enabling it writes two entries the host reads:
// the marketplace under `extraKnownMarketplaces` and the plugin under
// `enabledPlugins`. Claude Code installs and updates the plugin from there, so it
// never goes stale the way a copied snapshot does. Everything else in the file
// belongs to the user and is kept as it is.

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from './scaffold.mjs'

export const SETTINGS_REL = '.claude/settings.json'
export class PluginSettingsError extends Error {}

async function readSettings(root) {
  let raw
  try {
    raw = await fs.readFile(path.join(root, SETTINGS_REL), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new PluginSettingsError(`${SETTINGS_REL} is not valid JSON — fix it, then run this again; nothing was changed.`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PluginSettingsError(`${SETTINGS_REL} is not a JSON object; nothing was changed.`)
  }
  return parsed
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Throw before any write when the two keys we edit are not objects — the edit would be lost or crash. */
function assertEditable(settings) {
  for (const key of ['extraKnownMarketplaces', 'enabledPlugins']) {
    if (settings[key] !== undefined && !isPlainObject(settings[key])) {
      throw new PluginSettingsError(`${SETTINGS_REL}: '${key}' is not a JSON object — fix it, then run this again; nothing was changed.`)
    }
  }
  return settings
}

/** Validate the workspace settings before anything else is written (init's preflight). */
export async function checkSettingsEditable(root) {
  const settings = await readSettings(root)
  if (settings) assertEditable(settings)
}

const writeSettings = (root, settings) =>
  writeFileAtomic(path.join(root, SETTINGS_REL), `${JSON.stringify(settings, null, 2)}\n`)

/** True when the workspace settings enable this plugin. */
export async function pluginEnabled(root, plugin) {
  try {
    return (await readSettings(root))?.enabledPlugins?.[plugin.key] === true
  } catch {
    return false
  }
}

/** Enable the plugin and register its marketplace. @returns {Promise<boolean>} whether anything changed */
export async function enablePlugin(root, plugin) {
  const settings = assertEditable((await readSettings(root)) ?? {})
  const before = JSON.stringify(settings)
  settings.extraKnownMarketplaces ??= {}
  settings.extraKnownMarketplaces[plugin.marketplace] ??= { source: { source: 'github', repo: plugin.repo } }
  settings.enabledPlugins ??= {}
  settings.enabledPlugins[plugin.key] = true
  if (JSON.stringify(settings) === before) return false
  await writeSettings(root, settings)
  return true
}

/**
 * Take the plugin out again, and its marketplace once no enabled plugin still
 * comes from it — but only an entry pointing at the repo we would have written;
 * one the user set up differently is theirs. A settings file left empty is removed.
 * @returns {Promise<boolean>} whether anything changed
 */
export async function disablePlugin(root, plugin) {
  const settings = await readSettings(root)
  if (!settings) return false
  assertEditable(settings)
  const before = JSON.stringify(settings)
  if (settings.enabledPlugins) {
    delete settings.enabledPlugins[plugin.key]
    if (!Object.keys(settings.enabledPlugins).length) delete settings.enabledPlugins
  }
  const stillUsed = Object.keys(settings.enabledPlugins ?? {}).some(key => key.endsWith(`@${plugin.marketplace}`))
  const ours = settings.extraKnownMarketplaces?.[plugin.marketplace]?.source?.repo === plugin.repo
  if (settings.extraKnownMarketplaces && !stillUsed && ours) {
    delete settings.extraKnownMarketplaces[plugin.marketplace]
    if (!Object.keys(settings.extraKnownMarketplaces).length) delete settings.extraKnownMarketplaces
  }
  if (JSON.stringify(settings) === before) return false
  if (!Object.keys(settings).length) await fs.unlink(path.join(root, SETTINGS_REL))
  else await writeSettings(root, settings)
  return true
}
