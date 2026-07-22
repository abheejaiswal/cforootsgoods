// Pulls the real app HTML out of the "standalone bundler" file's
// <script type="__bundler/template"> block (a JSON string literal).
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const m = src.match(/<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/);
if (!m) { console.error('template block not found'); process.exit(1); }
const html = JSON.parse(m[1]);   // unescape the JSON string → real HTML
fs.writeFileSync(process.argv[3], html);
console.log('extracted', html.length, 'bytes ->', process.argv[3]);
