import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createFixtures } from "./makeFixtures.mjs";

const base = path.resolve(".cache/migration-probe");
rmSync(base, { recursive: true, force: true });
const profile = path.join(base, "profile");
mkdirSync(profile, { recursive: true });

// Build a pre-rename database the way older builds wrote it: group_id columns,
// detection_* ids, and the old current_group_id setting.
const db = new DatabaseSync(path.join(profile, "image-deduplicator.sqlite"));
db.exec(`
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE duplicate_groups (id TEXT PRIMARY KEY, similarity REAL NOT NULL, sort_index INTEGER NOT NULL, folder_path TEXT NOT NULL);
  CREATE TABLE images (original_path TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL, hash TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, size INTEGER NOT NULL, modified_at REAL NOT NULL);
  CREATE TABLE decisions (group_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE, deleted_images_json TEXT NOT NULL, seen INTEGER NOT NULL);
  INSERT INTO settings VALUES ('scan_root', ''), ('last_file_action', 'idle'), ('current_group_id', 'detection_001');
  INSERT INTO duplicate_groups VALUES ('detection_001', 1.5, 0, '');
`);
db.close();

await createFixtures(path.join(base, "scan-root"));
const fill = new DatabaseSync(path.join(profile, "image-deduplicator.sqlite"));
const insert = fill.prepare("INSERT INTO images VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
for (const file of ["twins/original.jpg", "twins/copy of original.jpg"]) {
   const filePath = path.join(base, "scan-root", file).split(path.sep).join("/");
   insert.run(filePath, "detection_001", file, "0".repeat(16), 900, 700, 1234, 0);
}
fill.close();
console.log("legacy db built at", profile);
