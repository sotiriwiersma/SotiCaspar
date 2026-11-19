import { defineConfig } from 'vitest/config';

// Windows: a working directory with a lowercase drive letter (`c:\...`, as VS Code terminals open the folder) makes
// vitest load its runner twice, once per spelling of the path, and every test file then fails with "Cannot read
// properties of undefined (reading 'config')". Normalising the drive letter before vitest uses the path avoids that.
if (process.platform === 'win32' && /^[a-z]:/.test(process.cwd())) {
  process.chdir(process.cwd()[0].toUpperCase() + process.cwd().slice(1));
}

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    environment: 'node'
  }
});
