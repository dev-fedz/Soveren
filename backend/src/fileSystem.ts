import fs from 'fs/promises';
import path from 'path';

export async function getProjectStructure(
  rootDir: string,
  visited: Set<string> = new Set(),
  depthInsideHeavy: number = 0,
) {
  const result: any = {
    name: path.basename(rootDir),
    path: rootDir,
    type: 'folder',
    children: []
  };

  try {
    const real = await fs.realpath(rootDir);
    if (visited.has(real)) return result;
    visited.add(real);

    const entries = await fs.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);

      if (entry.isDirectory()) {
        try {
          const isHeavy = [
            'node_modules',
            '.git',
            '.next',
            '.turbo',
            'dist',
            'build',
            '.cache',
            '.venv',
            'venv',
            'env',
            'site-packages',
            '__pycache__',
            '.idea',
            '.vscode',
          ].includes(entry.name);
          if (isHeavy) {
            result.children.push({
              name: entry.name,
              path: fullPath,
              type: 'folder',
              children: []
            });
            continue;
          }

          const node = await getProjectStructure(fullPath, visited, depthInsideHeavy);
          result.children.push(node);
        } catch (err) {
          // If a directory cannot be read (e.g. permission restriction), still show folder in tree
          result.children.push({
            name: entry.name,
            path: fullPath,
            type: 'folder',
            children: []
          });
        }
      } else {
        result.children.push({
          name: entry.name,
          path: fullPath,
          type: 'file'
        });
      }
    }

    // Sort: Folders first, then files. Alphabetical within each group.
    result.children.sort((a: any, b: any) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });
  } catch (err) {
    console.error(`[getProjectStructure] Failed to read ${rootDir}:`, err);
  }

  return result;
}


