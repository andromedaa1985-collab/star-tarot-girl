const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const workspace = process.cwd();
const target = path.resolve(workspace, 'dist');

if (!target.toLowerCase().startsWith(workspace.toLowerCase() + path.sep)) {
  throw new Error(`Refusing to clean outside the workspace: ${target}`);
}

if (!fs.existsSync(target)) {
  process.exit(0);
}

if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      [
        '$workspace = [System.IO.Path]::GetFullPath($env:ASTRORAIL_WORKSPACE);',
        '$target = [System.IO.Path]::GetFullPath($env:ASTRORAIL_CLEAN_TARGET);',
        'if (-not $target.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to clean outside workspace: $target" }',
        'if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }',
      ].join(' '),
    ],
    {
      env: {
        ...process.env,
        ASTRORAIL_WORKSPACE: workspace,
        ASTRORAIL_CLEAN_TARGET: target,
      },
      stdio: 'inherit',
    },
  );
} else {
  fs.rmSync(target, { recursive: true, force: true });
}
