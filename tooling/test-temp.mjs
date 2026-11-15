import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../.adg-test-tmp/', import.meta.url));
mkdirSync(root, { recursive: true });
process.env.TMPDIR = process.env.TMP = process.env.TEMP = root;
process.env.GIT_CEILING_DIRECTORIES = root;
