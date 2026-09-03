/**
 * Object storage behind an interface. Paths are relative keys such as
 * `private/usr_x/ast_y.jpg` or `game/ast_z.png`. The prefix mirrors the
 * Asset.visibility column so a bucket policy can enforce it later.
 */
export interface StorageProvider {
  readonly id: "local" | "supabase" | "db";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
