import { copyFileSync } from 'node:fs';
copyFileSync(new URL('../design/tokens.css', import.meta.url), new URL('../public/tokens.css', import.meta.url));
