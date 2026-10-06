/** Builds the detached source snapshot; never reaches the website checkout. */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const source = path.join(root, 'src/chess-analysis');
const out = path.join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const entries = {
  core: "export * from './src/chess-analysis/analyze.ts';",
  policy: "export { createKnightsEyePolicy, KNIGHTS_EYE_POLICY } from './src/chess-analysis/knights-eye-policy.ts';",
  'recorded-decision': "export * from './src/chess-analysis/recorded-decision.ts'; export * from './src/chess-analysis/contracts.ts';",
  stockfish: "export { createStockfishAdapter } from './src/chess-analysis/stockfish-adapter.ts';",
};
for (const [name, contents] of Object.entries(entries)) {
  await build({ stdin: { contents, resolveDir: root, sourcefile: `${name}-entry.ts`, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
    outfile: path.join(out, `${name}.js`), logLevel: 'silent' });
}
const config = { compilerOptions: { declaration: true, emitDeclarationOnly: true,
  strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
  lib: ['ES2022', 'DOM'], types: [], skipLibCheck: true,
  rootDir: source, outDir: path.join(out, 'types') },
files: ['analyze.ts', 'stockfish-adapter.ts', 'recorded-decision.ts', 'knights-eye-policy.ts']
  .map(file => path.join(source, file)) };
const configFile = path.join(out, 'declarations.json');
writeFileSync(configFile, JSON.stringify(config));
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', configFile],
  { cwd: root, encoding: 'utf8' });
rmSync(configFile);
if (result.status !== 0) throw new Error(result.stdout + result.stderr);
for (const file of readdirSync(path.join(out, 'types'))) {
  const target = path.join(out, 'types', file);
  writeFileSync(target, readFileSync(target, 'utf8').replace(
    /from (['"])(\.\/[^'"]+)\1/g,
    (_all, quote, specifier) => `from ${quote}${specifier.endsWith('.js') ? specifier : specifier + '.js'}${quote}`));
}
writeFileSync(path.join(out, 'core.d.ts'), "export * from './types/analyze.js';\n");
writeFileSync(path.join(out, 'policy.d.ts'), "export * from './types/knights-eye-policy.js';\n");
writeFileSync(path.join(out, 'stockfish.d.ts'), "export { createStockfishAdapter } from './types/stockfish-adapter.js';\nexport type { EngineAcquire, EnginePort, EngineLine, PositionAnalysis, SearchRequest } from './types/stockfish-adapter.js';\n");
writeFileSync(path.join(out, 'recorded-decision.d.ts'), "export * from './types/recorded-decision.js'; export * from './types/contracts.js';\n");
for (const name of ['analysis-phase2', 'recorded-decision', 'stockfish-admission']) {
  copyFileSync(path.join(root, 'test', `${name}.test.mjs`), path.join(out, `${name}.test.mjs`));
}
