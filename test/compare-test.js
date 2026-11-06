// Usage: node test/compare-test.js older.c4p newer.c4p
// Prints the same change summary the app's Changes tab copies to the clipboard.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const { createC4PParser } = require('../app/js/parser.js');
const C = require('../app/js/compare.js');

const parser = createC4PParser(JSZip, DOMParser);
(async () => {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) { console.error('Give two .c4p backups of the same project.'); process.exit(1); }
  const pa = await parser.parse(fs.readFileSync(a), path.basename(a));
  const pb = await parser.parse(fs.readFileSync(b), path.basename(b));
  const r = C.compare(pa, pb);
  if (!r.sameProject) console.log('Note: these backups come from different projects.\n');
  console.log(C.summaryText(r));
})().catch(e => { console.error(e); process.exit(1); });
