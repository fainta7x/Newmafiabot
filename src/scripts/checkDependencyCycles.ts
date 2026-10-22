// Guard against new circular imports and imports against the layer direction.
//
// Only static runtime imports count: `import type`, `export type` and dynamic
// `import()` do not create module-initialisation cycles. Tests are excluded.
// Existing cyclic edges are listed in config/dependency-cycles-baseline.json;
// the check fails when a new import joins a cycle, and also when a listed edge
// is gone but still in the baseline, so a removed cycle cannot quietly return.
//
//   npx tsx src/scripts/checkDependencyCycles.ts            check against baseline
//   npx tsx src/scripts/checkDependencyCycles.ts --update   rewrite the baseline
//   npx tsx src/scripts/checkDependencyCycles.ts --json     machine-readable summary
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const baselinePath = 'config/dependency-cycles-baseline.json';
const aliases: Record<string, string> = {
  '#components/': 'src/components/',
  '#lib/': 'src/lib/',
  '#hooks/': 'src/hooks/',
};

const isTestFile = (file: string) =>
  /(^|\/)(tests?)\//.test(file) || /\.test\.(ts|tsx)$/.test(file) || /\.d\.ts$/.test(file);

const sources = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'src', 'server.ts'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => /\.(ts|tsx)$/.test(file) && !isTestFile(file) && existsSync(file));
const known = new Set(sources);

const resolve = (from: string, specifier: string): string | null => {
  let base: string | null = null;
  if (specifier.startsWith('.')) base = path.posix.join(path.posix.dirname(from), specifier);
  for (const [alias, target] of Object.entries(aliases)) {
    if (specifier.startsWith(alias)) base = target + specifier.slice(alias.length);
  }
  if (base === null) return null;
  // TypeScript resolves `./x.js` to `./x.ts` / `./x.tsx`.
  const stem = base.replace(/\.jsx?$/, '');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, `${stem}.ts`, `${stem}.tsx`]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
};

const runtimeImports = (file: string): string[] => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      const onlyTypeSpecifiers = clause && !clause.name && named && ts.isNamedImports(named)
        && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly);
      if (onlyTypeSpecifiers) continue;
      if (ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      const clause = statement.exportClause;
      const onlyTypeSpecifiers = clause && ts.isNamedExports(clause)
        && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly);
      if (onlyTypeSpecifiers) continue;
      if (ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers.map((specifier) => resolve(file, specifier)).filter((target): target is string => target !== null);
};

const graph = new Map<string, string[]>();
for (const file of sources) graph.set(file, [...new Set(runtimeImports(file))]);

// Tarjan's strongly connected components (iterative to stay safe on deep chains).
const index = new Map<string, number>();
const low = new Map<string, number>();
const onStack = new Set<string>();
const stack: string[] = [];
const components: string[][] = [];
let counter = 0;
for (const root of graph.keys()) {
  if (index.has(root)) continue;
  const work: Array<{ node: string; next: number }> = [{ node: root, next: 0 }];
  index.set(root, counter); low.set(root, counter); counter += 1;
  stack.push(root); onStack.add(root);
  while (work.length > 0) {
    const frame = work[work.length - 1];
    const edges = graph.get(frame.node) || [];
    if (frame.next < edges.length) {
      const target = edges[frame.next++];
      if (!index.has(target)) {
        index.set(target, counter); low.set(target, counter); counter += 1;
        stack.push(target); onStack.add(target);
        work.push({ node: target, next: 0 });
      } else if (onStack.has(target)) {
        low.set(frame.node, Math.min(low.get(frame.node)!, index.get(target)!));
      }
      continue;
    }
    work.pop();
    if (work.length > 0) {
      const parent = work[work.length - 1].node;
      low.set(parent, Math.min(low.get(parent)!, low.get(frame.node)!));
    }
    if (low.get(frame.node) === index.get(frame.node)) {
      const component: string[] = [];
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); component.push(member); } while (member !== frame.node);
      const selfLoop = (graph.get(frame.node) || []).includes(frame.node);
      if (component.length > 1 || selfLoop) components.push(component.sort());
    }
  }
}

const componentOf = new Map<string, number>();
components.forEach((component, i) => component.forEach((file) => componentOf.set(file, i)));
const cyclicEdges: string[] = [];
for (const [from, targets] of graph) {
  for (const to of targets) {
    if (componentOf.has(from) && componentOf.get(from) === componentOf.get(to)) cyclicEdges.push(`${from} -> ${to}`);
  }
}
cyclicEdges.sort();

// Layer direction: shared/lib -> db -> server services -> server routes; UI never imports server or db code at runtime.
const layerRules: Array<{ from: RegExp; to: RegExp; rule: string }> = [
  { from: /^src\/(lib|shared)\//, to: /^src\/(server|db|components)\//, rule: 'lib/shared must not depend on server, db or UI' },
  { from: /^src\/components\//, to: /^src\/(server|db)\//, rule: 'UI must not import server or db code' },
  { from: /^src\/db\//, to: /^src\/server\//, rule: 'db must not depend on server code' },
  { from: /^src\/server\/services\//, to: /^src\/server\/routes\//, rule: 'services must not depend on routes' },
];
const layerViolations: string[] = [];
for (const [from, targets] of graph) {
  for (const to of targets) {
    const broken = layerRules.find((rule) => rule.from.test(from) && rule.to.test(to));
    if (broken) layerViolations.push(`${from} -> ${to}`);
  }
}
layerViolations.sort();

const args = new Set(process.argv.slice(2));
const summary = {
  modules: graph.size,
  cyclicGroups: components.length,
  modulesInCycles: componentOf.size,
  cyclicEdges: cyclicEdges.length,
  largestGroup: Math.max(0, ...components.map((component) => component.length)),
  layerViolations: layerViolations.length,
};

if (args.has('--update')) {
  writeFileSync(baselinePath, `${JSON.stringify({ ...summary, edges: cyclicEdges, layers: layerViolations }, null, 2)}\n`);
  console.log(`Wrote ${baselinePath}: ${cyclicEdges.length} cyclic edges in ${components.length} groups, ${layerViolations.length} layer violations.`);
  process.exit(0);
}

const stored = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8')) as { edges?: string[]; layers?: string[] }
  : {};
const diff = (current: string[], known: string[] = []) => ({
  added: current.filter((edge) => !known.includes(edge)),
  removed: known.filter((edge) => !current.includes(edge)),
});
const cycles = diff(cyclicEdges, stored.edges);
const layers = diff(layerViolations, stored.layers);

if (args.has('--json')) {
  console.log(JSON.stringify({ ...summary, cycles, layers }, null, 2));
} else {
  console.log(`Dependency cycles: ${summary.cyclicGroups} groups, ${summary.modulesInCycles} modules, ${summary.cyclicEdges} cyclic edges (largest group ${summary.largestGroup}). Layer violations: ${summary.layerViolations}.`);
  const removed = [...cycles.removed, ...layers.removed];
  if (removed.length > 0) {
    console.error(`\n${removed.length} baseline edge(s) are gone — shrink the baseline with --update and commit it:`);
    removed.forEach((edge) => console.error(`  - ${edge}`));
  }
  if (cycles.added.length > 0) {
    console.error(`\nNew import(s) inside a dependency cycle (${cycles.added.length}). Move the shared code to a lower layer instead:`);
    cycles.added.forEach((edge) => console.error(`  + ${edge}`));
  }
  if (layers.added.length > 0) {
    console.error(`\nNew import(s) against the layer direction (${layers.added.length}):`);
    layers.added.forEach((edge) => console.error(`  + ${edge} (${layerRules.find((rule) => rule.from.test(edge.split(' -> ')[0]) && rule.to.test(edge.split(' -> ')[1]))?.rule})`));
  }
}
if (cycles.added.length + layers.added.length + cycles.removed.length + layers.removed.length > 0) process.exit(1);
