import { writeFile, mkdir } from "node:fs/promises";
import { fixtures } from "../.compiled/fixtures.js";
await mkdir("fixtures", { recursive: true });
for (const [name, value] of Object.entries(fixtures()))
  await writeFile("fixtures/" + name, value);
