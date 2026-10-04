import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "frontend");
const publicRoot = path.join(projectRoot, "apps", "web", "public");
await mkdir(publicRoot, { recursive: true });
await Promise.all(["index.html", "css", "js"].map((name) => cp(path.join(sourceRoot, name), path.join(publicRoot, name), { recursive: true, force: true })));
console.info("Synced the supplied UniDash frontend into the deployable Next.js public directory.");
