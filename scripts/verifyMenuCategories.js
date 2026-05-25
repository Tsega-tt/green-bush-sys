#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'data', 'menu.json');

console.log('Reading menu.json...');
const menu = JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));

const counts = {};
menu.forEach(item => {
  const mc = item.main_category || 'unknown';
  counts[mc] = (counts[mc] || 0) + 1;
});

console.log('\nMain Category Counts:');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count}`);
});

console.log('\nየጾም ምግብ items:');
const fastingItems = menu.filter(item => item.main_category === 'የጾም ምግብ');
console.log(`  Total: ${fastingItems.length}`);
console.log(`  Sample items: ${fastingItems.slice(0, 3).map(i => i.name).join(', ')}`);
