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
const compatibilityNames = ['POSITION_RULES_SOURCE', 'CLASSIFIER_RULES_SOURCE', 'ANALYSIS_CORE_SOURCE'];
function compatibilitySources() {
  const runtime = readFileSync(path.join(source, 'knights-eye-policy-runtime.js'), 'utf8');
  return compatibilityNames.map(name => {
    const begin = `// BEGIN COMPATIBILITY REGION ${name}\n`;
    const end = `// END COMPATIBILITY REGION ${name}\n`;
    const start = runtime.indexOf(begin), finish = runtime.indexOf(end);
    if (start < 0 || finish <= start || runtime.indexOf(begin, start + 1) !== -1 || runtime.indexOf(end, finish + 1) !== -1) {
      throw new Error(`Invalid canonical region ${name}.`);
    }
    return `export const ${name} = ${JSON.stringify(runtime.slice(start + begin.length, finish))};`;
  }).join('\n');
}
const entries = {
  core: "export * from './src/chess-analysis/analyze.ts';",
  policy: "export { createKnightsEyePolicy, KNIGHTS_EYE_POLICY } from './src/chess-analysis/knights-eye-policy.ts';",
  'recorded-decision': "export * from './src/chess-analysis/recorded-decision.ts'; export * from './src/chess-analysis/contracts.ts'; export * from './src/chess-analysis/classifier-decision.ts';",
  compatibility: "export { createKnightsEyePolicyRuntime } from './src/chess-analysis/knights-eye-policy-runtime.js'; export * from './src/chess-analysis/classifier-decision.ts';" + compatibilitySources(),
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
files: ['analyze.ts', 'stockfish-adapter.ts', 'recorded-decision.ts', 'knights-eye-policy.ts', 'classifier-decision.ts']
  .map(file => path.join(source, file)) };
const configFile = path.join(out, 'declarations.json');
writeFileSync(configFile, JSON.stringify(config));
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', configFile],
  { cwd: root, encoding: 'utf8' });
rmSync(configFile);
if (result.status !== 0) throw new Error(result.stdout + result.stderr);
copyFileSync(path.join(source, 'knights-eye-policy-runtime.d.ts'), path.join(out, 'types/knights-eye-policy-runtime.d.ts'));
for (const file of readdirSync(path.join(out, 'types'))) {
  const target = path.join(out, 'types', file);
  writeFileSync(target, readFileSync(target, 'utf8').replace(
    /(?:from |import\()(['"])(\.\/[^'"]+)\1/g,
    (_all, quote, specifier) => `${_all.startsWith('from') ? 'from ' : 'import('}${quote}${specifier.endsWith('.js') ? specifier : specifier + '.js'}${quote}`));
}
writeFileSync(path.join(out, 'core.d.ts'), "export * from './types/analyze.js';\n");
writeFileSync(path.join(out, 'policy.d.ts'), "export * from './types/knights-eye-policy.js';\n");
writeFileSync(path.join(out, 'stockfish.d.ts'), "export { createStockfishAdapter } from './types/stockfish-adapter.js';\nexport type { EngineAcquire, EnginePort, EngineLine, PositionAnalysis, SearchRequest } from './types/stockfish-adapter.js';\n");
writeFileSync(path.join(out, 'recorded-decision.d.ts'), "export * from './types/recorded-decision.js'; export * from './types/contracts.js'; export * from './types/classifier-decision.js';\n");
writeFileSync(path.join(out, 'compatibility.d.ts'), "export { createKnightsEyePolicyRuntime } from './types/knights-eye-policy-runtime.js'; export * from './types/classifier-decision.js';\n" + compatibilityNames.map(name => `export const ${name}: string;\n`).join(''));
for (const name of ['analysis-phase2', 'recorded-decision', 'stockfish-admission']) {
  copyFileSync(path.join(root, 'test', `${name}.test.mjs`), path.join(out, `${name}.test.mjs`));
}
