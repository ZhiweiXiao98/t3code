import { createRequire } from 'node:module';
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export function inspectGraphs(projects, paths) {
  const result = {
    schema: 1, host_pid: process.pid, observed: false, qualified: false,
    stock_observed: false, wrapper_observed: false, client_observed: false,
    stock_candidates: 0, wrapper_candidates: 0, client_candidates: 0,
    stock_imports_client: false, wrapper_imports_client: false, same_client: false,
    client_source_sha256: paths.clientHash, wrapper_source_sha256: paths.wrapperHash,
  };
  try {
    if (!Array.isArray(projects) || projects.length > 8) return result;
    const graphs = projects.map(p => p.browser?.vite?.moduleGraph).filter(Boolean);
    if (graphs.length !== 1) return result;
    const graph = graphs[0];
    // getModuleById requires the exact dependency ?v= query. Public file lookup
    // finds the actual graph nodes without resolving or transforming anything.
    const candidate = (file) => {
      const nodes = graph.getModulesByFile(file);
      if (nodes === undefined) return { count: 0, node: undefined };
      if (!(nodes instanceof Set)) throw Error('unavailable module set');
      return { count: Math.min(nodes.size, 9), node: nodes.size === 1 ? nodes.values().next().value : undefined };
    };
    const stockResult = candidate(paths.stock), wrapperResult = candidate(paths.wrapper), clientResult = candidate(paths.client);
    const stock = stockResult.node, wrapper = wrapperResult.node, client = clientResult.node;
    result.stock_candidates = stockResult.count;
    result.wrapper_candidates = wrapperResult.count;
    result.client_candidates = clientResult.count;
    result.observed = true;
    result.stock_observed = Boolean(stock);
    result.wrapper_observed = Boolean(wrapper);
    result.client_observed = Boolean(client);
    result.stock_imports_client = Boolean(client && stock?.clientImportedModules?.has(client));
    result.wrapper_imports_client = Boolean(client && wrapper?.clientImportedModules?.has(client));
    result.same_client = result.stock_imports_client && result.wrapper_imports_client;
    result.qualified = result.stock_observed && result.wrapper_observed && result.client_observed && result.same_client;
  } catch {
    // No internal module IDs, URLs or exception text enter the output.
  }
  return result;
}

function pathsFromWorkspace() {
  const require = createRequire(join(process.cwd(), 'package.json'));
  const wrapper = realpathSync(require.resolve('vite-plus/test/client'));
  const client = realpathSync(createRequire(wrapper).resolve('@vitest/browser/client'));
  const entries = readdirSync(join(dirname(client), 'client', '__vitest_browser__'))
    .filter(name => /^orchestrator-[A-Za-z0-9_-]+\.js$/.test(name));
  if (entries.length !== 1) throw Error('ambiguous installed orchestrator');
  const stock = realpathSync(join(dirname(client), 'client', '__vitest_browser__', entries[0]));
  if (realpathSync(createRequire(stock).resolve('@vitest/browser/client')) !== client) throw Error('different installed client');
  const clientBytes = readFileSync(client), wrapperBytes = readFileSync(wrapper);
  if (clientBytes.length > 256 * 1024 || wrapperBytes.length > 4096) throw Error('module bounds');
  if (wrapperBytes.toString('utf8').trim() !== "export * from '@vitest/browser/client';") throw Error('unexpected wrapper');
  return { wrapper, client, stock,
    clientHash: createHash('sha256').update(clientBytes).digest('hex'),
    wrapperHash: createHash('sha256').update(wrapperBytes).digest('hex') };
}

export default class ModuleIdentityReporter {
  onInit(context) { this.context = context; }
  onTestRunEnd() {
    try {
      const result = inspectGraphs(this.context?.projects, pathsFromWorkspace());
      const output = join(process.env.RUNNER_TEMP, 'v019-private', 'module-identity.json');
      const bytes = JSON.stringify(result) + '\n';
      if (Buffer.byteLength(bytes) > 4096) return;
      writeFileSync(output, bytes, { flag: 'wx', mode: 0o600 });
    } catch {
      // Missing proof fails the separate qualification, never the test reporter path.
    }
  }
}
