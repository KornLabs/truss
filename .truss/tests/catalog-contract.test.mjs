import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PREFS_CATALOG } from '../lib/prefs.mjs'
import { CHECK_CATALOG, PREFERENCE_GROUPS } from '../dashboard/ui/catalog-data.js'
import * as st from '../checks/st.mjs'
import * as bl from '../checks/bl.mjs'
import * as rf from '../checks/rf.mjs'
import * as sy from '../checks/sy.mjs'
import * as ph from '../checks/ph.mjs'
import * as cx from '../checks/cx.mjs'
import * as hy from '../checks/hy.mjs'

const ENGINE = path.join(fileURLToPath(import.meta.url), '..', '..')

describe('catalog contracts', () => {
  it('dashboard preference facts match the canonical engine catalog', () => {
    const dashboard = new Map(
      PREFERENCE_GROUPS.flatMap(group => group.items).map(item => [item.key, item]),
    )
    assert.deepEqual(
      [...dashboard.keys()].sort(),
      PREFS_CATALOG.map(item => item.key).sort(),
    )
    for (const pref of PREFS_CATALOG) {
      const shown = dashboard.get(pref.key)
      assert.deepEqual(shown.values, pref.values, `${pref.key} values drifted`)
      assert.equal(shown.def, pref.default, `${pref.key} default drifted`)
      assert.equal(!!shown.free, !!pref.free, `${pref.key} free-value status drifted`)
    }
  })

  it('dashboard check IDs, severities and titles match all check metadata', () => {
    const canonical = [st, bl, rf, sy, ph, cx, hy]
      .flatMap(mod => mod.meta)
      .map(({ id, severity, title }) => ({ id, sev: severity, desc: title }))
      .sort((a, b) => a.id.localeCompare(b.id))
    assert.deepEqual(CHECK_CATALOG, canonical)
  })

  it('CLI preference table covers every canonical key, value and default', async () => {
    const raw = await fs.readFile(path.join(ENGINE, 'docs', 'cli.md'), 'utf8')
    const start = raw.indexOf('### Preference keys')
    const end = raw.indexOf('\n---', start)
    const rows = new Map()
    for (const line of raw.slice(start, end).split('\n')) {
      const match = line.match(/^\| `([^`]+)` \| (.*?) \| (.*?) \|$/)
      if (!match) continue
      rows.set(match[1], {
        values: match[2].replaceAll('`', ''),
        default: match[3].replaceAll('`', '').trim(),
      })
    }

    assert.deepEqual([...rows.keys()].sort(), PREFS_CATALOG.map(item => item.key).sort())
    for (const pref of PREFS_CATALOG) {
      const row = rows.get(pref.key)
      assert.equal(row.default, pref.default, `${pref.key} documented default drifted`)
      for (const value of pref.values) {
        assert.match(row.values, new RegExp(`\\b${value}\\b`), `${pref.key} omits ${value}`)
      }
    }
  })
})
