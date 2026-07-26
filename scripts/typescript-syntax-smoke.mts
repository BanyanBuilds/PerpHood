import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const ts = require(join(globalRoot, "typescript")) as typeof import("typescript");
const root = new URL("../", import.meta.url);
const rootPath = root.pathname;
const failures: string[] = [];
let checked = 0;

async function walk(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".next", "contracts", "dist", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (!entry.name.endsWith(".d.ts") && /\.(ts|tsx|mts)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      const output = ts.transpileModule(source, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          isolatedModules: true,
        },
      });
      const diagnostics = output.diagnostics ?? [];
      for (const diagnostic of diagnostics) {
        if (diagnostic.category === ts.DiagnosticCategory.Error) {
          failures.push(`${path}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
        }
      }
      checked += 1;
    }
  }
}

await walk(rootPath);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`TypeScript/TSX syntax smoke passed for ${checked} files.`);
