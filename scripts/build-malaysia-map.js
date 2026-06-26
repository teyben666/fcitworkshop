const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'assets', 'malaysia-outline-source.svg'), 'utf8');

const shapes = [];
const re = /<(path|polygon)[^>]*>/gi;
let m;
while ((m = re.exec(src))) {
  shapes.push(m[0].replace(/class="st0"/g, '').replace(/\s*id="[^"]*"/g, ''));
}

const scale = 643 / 915;
const h = 400 * scale;
const ty = (316 - h) / 2;
const body = shapes.join('\n');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 643 316" width="643" height="316">
<defs>
<linearGradient id="ocean" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="#050d18"/>
<stop offset="100%" stop-color="#0a1628"/>
</linearGradient>
<linearGradient id="land" x1="0%" y1="0%" x2="0%" y2="100%">
<stop offset="0%" stop-color="#1e3a5f"/>
<stop offset="100%" stop-color="#122238"/>
</linearGradient>
</defs>
<rect width="643" height="316" fill="url(#ocean)"/>
<g transform="translate(0,${ty.toFixed(2)}) scale(${scale.toFixed(6)})" fill="url(#land)" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="1" stroke-linejoin="round">
${body}
</g>
</svg>`;

fs.writeFileSync(path.join(root, 'malaysia-map.svg'), svg);
console.log('Wrote malaysia-map.svg:', shapes.length, 'shapes,', svg.length, 'bytes');
