import { copyFileSync } from 'node:fs';
copyFileSync(new URL('../design/tokens.css', import.meta.url), new URL('../public/tokens.css', import.meta.url));
copyFileSync(new URL('../design/art/adg-mark.svg', import.meta.url), new URL('../public/favicon.svg', import.meta.url));
