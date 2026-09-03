import type { Db } from "@/infra/db/prisma";
import type { StorageProvider } from "./types";

/**
 * Blobs in the database (Postgres bytea / SQLite blob). Zero extra services,
 * good for a pilot: photos and stickers are a few hundred KB each. Swap for
 * object storage behind the same interface when volume grows.
 */
export class DbStorage implements StorageProvider {
  readonly id = "db" as const;
  constructor(private readonly db: Db) {}

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    await this.db.fileBlob.upsert({ where: { key }, create: { key, data: bytes, contentType }, update: { data: bytes, contentType } });
  }

  async get(key: string): Promise<Buffer> {
    const row = await this.db.fileBlob.findUnique({ where: { key } });
    if (!row) throw new Error(`storage: missing ${key}`);
    return Buffer.from(row.data);
  }

  async delete(key: string): Promise<void> {
    await this.db.fileBlob.deleteMany({ where: { key } });
  }

  async exists(key: string): Promise<boolean> {
    return (await this.db.fileBlob.count({ where: { key } })) > 0;
  }
}
