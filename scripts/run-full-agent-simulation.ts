import { spawnSync } from 'node:child_process';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function run(cmd: string, args: string[], cwd: string): { ok: boolean; code: number; out: string } {
  const isWin = process.platform === 'win32';
  const cmdLine = [cmd, ...args]
    .map((p) => {
      const s = String(p);
      return /\s|"/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(' ');

  const res = spawnSync(isWin ? 'cmd.exe' : cmd, isWin ? ['/d', '/s', '/c', cmdLine] : args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    timeout: 10 * 60 * 1000,
    windowsHide: true
  });

  const err = res.error ? (res.error instanceof Error ? res.error.stack || res.error.message : String(res.error)) : '';
  const meta = JSON.stringify(
    {
      status: res.status,
      signal: res.signal,
      pid: (res as any).pid,
      timedOut: Boolean((res as any).error && String((res as any).error?.code || '') === 'ETIMEDOUT')
    },
    null,
    2
  );
  const out = `${err ? `spawn error: ${err}\n` : ''}${meta}\n${String(res.stdout || '')}${String(res.stderr || '')}`;
  return { ok: res.status === 0, code: res.status ?? 1, out };
}

async function main() {
  const repoRoot = env('PHOENIX_ZERO_REPO_ROOT') || process.cwd();

  console.log('🚀 Iniciando simulação completa de agente externo...');
  console.log(JSON.stringify({ repoRoot }, null, 2));

  console.log('\n🔧 Rodando cliente externo (scripts/external-agent-client.ts)...');

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log(JSON.stringify({ command: [npx, 'tsx', './scripts/external-agent-client.ts'] }, null, 2));

  const r = run(npx, ['tsx', './scripts/external-agent-client.ts'], repoRoot);
  process.stdout.write(r.out);

  if (!r.ok) {
    console.error(`\n❌ Simulação falhou (exit code ${r.code}).`);
    if (!r.out.trim()) {
      console.error('Sem saída do processo. Isso geralmente indica que o executável não foi encontrado ou não iniciou corretamente.');
    }
    process.exitCode = r.code;
    return;
  }

  console.log('\n✅ Simulação finalizada com sucesso.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exitCode = 1;
});
