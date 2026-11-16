import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LogFn } from './events';

const RENAME_RETRIES = 5;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Renames over an existing file; on Windows this transiently fails while antivirus or indexers hold the target. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= RENAME_RETRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      await wait(20 * attempt);
    }
  }
}

/** Writes `text` so that readers see either the old or the new content, never a partial file. */
export async function writeFileAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, text, 'utf8');
    await renameWithRetry(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** A JSON document on disk. Writes are serialized and atomic; unreadable files are set aside and read as missing. */
export class JsonFile {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly log: LogFn
  ) {}

  async read(): Promise<unknown> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.log('warn', `Cannot read ${this.path}: ${String(error)}`);
      return undefined;
    }

    try {
      return JSON.parse(text);
    } catch {
      this.log('warn', `${this.path} is corrupt, moving it aside`);
      await rm(`${this.path}.corrupt`, { force: true });
      await rename(this.path, `${this.path}.corrupt`).catch(() => undefined);
      return undefined;
    }
  }

  write(value: unknown): Promise<void> {
    const text = JSON.stringify(value, null, 2);
    const run = this.tail.then(() => writeFileAtomic(this.path, text));
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Resolves when all writes issued so far have settled. */
  flush(): Promise<void> {
    return this.tail;
  }
}
