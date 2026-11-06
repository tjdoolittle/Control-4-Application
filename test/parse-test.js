// Usage: npm install && node test/parse-test.js path/to/one.c4p [more.c4p ...]
// Prints the parsed inventory so parser changes can be checked against real backups.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const { createC4PParser } = require('../app/js/parser.js');

const parser = createC4PParser(JSZip, DOMParser);
(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Give one or more .c4p files.'); process.exit(1); }
  for (const f of files) {
    const r = await parser.parse(fs.readFileSync(f), path.basename(f));
    const rooms = Object.fromEntries(r.rooms.map(x => [x.id, x.name]));
    console.log(`\n${r.project.name}  (OS ${r.project.osVersion}, ${r.devices.length} devices, ${r.connections.length} connections)`);
    for (const d of r.devices) {
      console.log(`  ${(rooms[d.room] || '-').padEnd(16)} ${d.name.padEnd(32)} ${(d.maker + ' ' + d.model).padEnd(32)} ${d.control.padEnd(6)} ${d.ip || d.zigbee || d.addrNote}`);
      d.flags.forEach(fl => console.log(`      ! ${fl.text}`));
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
