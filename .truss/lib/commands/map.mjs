import fs from 'node:fs/promises';
import path from 'node:path';

// Directories the map skips entirely (engine-internal or summary-managed). A dir
// with one of these names is skipped at any depth. Exported as the single source
// of truth so doctor can reproduce the same file set without a second walk.
export const MAP_SKIP_DIRS = new Set(['.truss', '.git', '.github', 'node_modules', 'packages', 'archive', 'repo']);

// Files the map skips (AI-agent adapter stubs), matched by lowercase basename.
export const MAP_SKIP_FILES = new Set(['claude.md', 'gemini.md', 'roo_code.md', 'cursor.md']);

// Standalone recursive walk for the markdown files the map covers. Used by
// `truss map` and init, where no precomputed path list exists.
async function walkMdFiles(root) {
  const mdFiles = [];
  async function walk(dirRel) {
    const abs = path.join(root, dirRel);
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (MAP_SKIP_DIRS.has(entry.name)) continue;
        const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
        // Sequential traversal avoids EMFILE limits from massive directory trees
        await walk(rel);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (MAP_SKIP_FILES.has(entry.name.toLowerCase())) continue;
        const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
        mdFiles.push(rel);
      }
    }
  }
  await walk('');
  return mdFiles;
}

// Reduce a precomputed disk-path list (from loadWorkspace's single tree walk)
// to the EXACT md-file set walkMdFiles would produce, so doctor/ST-07 can reuse
// that walk instead of running a second one. Same SKIP rules, per path segment.
export function mapMdFilesFromDiskPaths(diskPaths) {
  return diskPaths.filter(rel => {
    if (rel.endsWith('/') || !rel.endsWith('.md')) return false;
    const segs = rel.split('/');
    if (segs.some(s => MAP_SKIP_DIRS.has(s))) return false;
    if (MAP_SKIP_FILES.has(segs[segs.length - 1].toLowerCase())) return false;
    return true;
  });
}

/**
 * Generate map content grouping paths by folder. Pass a precomputed `mdFilesInput`
 * (e.g. from mapMdFilesFromDiskPaths) to skip the standalone walk; omit it to walk.
 * Output is identical either way — files are grouped and sorted deterministically.
 */
export async function generateMapContent(root, mdFilesInput) {
  const mdFiles = mdFilesInput ? [...mdFilesInput] : await walkMdFiles(root);

  if (!mdFiles.includes('state/map.md')) {
    mdFiles.push('state/map.md');
  }

  const validFileData = [];
  const BATCH_SIZE = 50;

  // Process files in batches to combine parallel speed with EMFILE safety
  for (let i = 0; i < mdFiles.length; i += BATCH_SIZE) {
    const batch = mdFiles.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (file) => {
      const abs = path.join(root, file);
      
      if (file === 'state/map.md') {
        validFileData.push({ file, group: '/state', title: 'Truss Map', description: 'Auto-generated overview of domain files. Do not edit manually.' });
        return;
      }

      let fh;
      try {
        fh = await fs.open(abs, 'r');
        const buffer = Buffer.alloc(2048);
        const { bytesRead } = await fh.read(buffer, 0, 2048, 0);
        const topContent = buffer.toString('utf8', 0, bytesRead);

        let title = '';
        let description = '*[No description]*';

        const titleMatch = topContent.match(/^#\s+(.+)$/m);
        if (titleMatch) title = titleMatch[1].trim();
        else title = path.basename(file, '.md'); // Fallback

        const descMatch = topContent.match(/^>\s+(.+)$/m);
        if (descMatch) description = descMatch[1].trim();

        // Escape pipe characters to prevent Markdown table injection
        title = title.replace(/\|/g, '&#124;');
        description = description.replace(/\|/g, '&#124;');
        
        // Strip newlines to prevent markdown breakage
        title = title.replace(/[\r\n]/g, ' ');
        description = description.replace(/[\r\n]/g, ' ');

        // Platform independent group building
        const parts = file.split('/');
        const group = parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : '/';
        
        validFileData.push({ file, group, title, description });
      } catch {
        // Ignore read errors
      } finally {
        if (fh) await fh.close().catch(() => {});
      }
    }));
  }

  // Group by folder
  const grouped = new Map();
  for (const fd of validFileData) {
    if (!grouped.has(fd.group)) grouped.set(fd.group, []);
    grouped.get(fd.group).push(fd);
  }

  // Deterministic sorting
  const sortedGroups = [...grouped.keys()].sort((a, b) => a < b ? -1 : (a > b ? 1 : 0));

  let mdContent = `# Truss Map\n\n> Auto-generated overview of domain files. Do not edit manually.\n\n`;

  for (const group of sortedGroups) {
    mdContent += `## ${group}\n\n`;
    mdContent += `| File | Title | Description |\n`;
    mdContent += `|---|---|---|\n`;
    
    const items = grouped.get(group).sort((a, b) => a.file < b.file ? -1 : (a.file > b.file ? 1 : 0));
    for (const item of items) {
      mdContent += `| \`${item.file}\` | ${item.title} | ${item.description} |\n`;
    }
    mdContent += `\n`;
  }

  return mdContent;
}

export async function runMap(root, args) {
  // Init guard: map is meaningless without a Truss workspace.
  try {
    await fs.access(path.join(root, 'AGENTS.md'));
  } catch {
    console.log('This folder is not a Truss workspace yet. Run `truss init` first.');
    process.exit(0);
  }

  try {
    const content = await generateMapContent(root);
    const stateDir = path.join(root, 'state');
    await fs.mkdir(stateDir, { recursive: true });
    
    const mapPath = path.join(stateDir, 'map.md');
    await fs.writeFile(mapPath, content, 'utf8');
    
    console.log(`truss map: successfully generated state/map.md`);
  } catch (err) {
    console.error(`truss map: failed — ${err.message}`);
    process.exit(2);
  }
}
