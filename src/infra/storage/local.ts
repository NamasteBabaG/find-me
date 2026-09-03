import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageProvider } from "./types";

/** Dev storage on disk (gitignored `storage/`). Never served directly — only through /api/assets. */
export class LocalDiskStorage implements StorageProvider {
  readonly id = "local" as const;
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const safe = key.replace(/\\/g, "/").replace(/\.\.+/g, "");
    const full = path.resolve(this.rootDir, safe);
    if (!full.startsWith(path.resolve(this.rootDir))) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
