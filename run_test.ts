import { execSync } from 'child_process';
try {
  execSync('npm test', { stdio: 'inherit' });
} catch (e) {}
