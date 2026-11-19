import { buildExportFiles } from "../src/export-data.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(process.argv[2] || process.env.DATA_DIR || "data");
const outputDirectory = path.resolve(process.argv[3] || "exports");
const db = new DatabaseSync(path.join(dataDirectory, "workshop.sqlite"), { readOnly: true });
const { files, participantCount } = buildExportFiles(db);
db.close();
mkdirSync(outputDirectory, { recursive: true });
for (const [name, content] of Object.entries(files))
  writeFileSync(path.join(outputDirectory, name), content);
console.log(`已导出 ${participantCount} 位参与者至 ${outputDirectory}`);
