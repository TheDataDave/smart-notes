// usage: node scripts/check-ico.js icons/icon.ico
const fs = require('node:fs');

const buf = fs.readFileSync(process.argv[2] || 'icons/icon.ico');
if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
  console.log('NOT a real .ico file. Re-export it with a converter.');
  process.exit(1);
}
const count = buf.readUInt16LE(4);
const sizes = [];
for (let i = 0; i < count; i++) {
  const w = buf[6 + i * 16] || 256; // a stored 0 means 256
  const h = buf[7 + i * 16] || 256;
  sizes.push(`${w}x${h}`);
}
console.log('Sizes inside:', sizes.join(', '));
if (!sizes.includes('256x256')) {
    console.log('Missing 256x256, which electron-builder requires.') 
} else {
    console.log('256x256 is present, good.')
};