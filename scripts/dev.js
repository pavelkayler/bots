const { spawn } = require('node:child_process');

function run(name, args) {
  const child = spawn('npm', args, {
    stdio: 'inherit',
    shell: true
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dev] ${name} exited via signal ${signal}`);
      return;
    }

    if (code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

const children = [
  run('backend', ['--prefix', 'backend', 'run', 'dev']),
  run('frontend', ['--prefix', 'frontend', 'run', 'dev'])
];

let stopping = false;

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }

  setTimeout(() => process.exit(exitCode), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
