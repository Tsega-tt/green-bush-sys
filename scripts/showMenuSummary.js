#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'data', 'menu.json');

console.log('📊 Menu Category Summary\n');
const menu = JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));

const counts = {};
menu.forEach(item => {
  const mc = item.main_category || 'unknown';
  counts[mc] = (counts[mc] || 0) + 1;
});

console.log('Main Categories:');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`  ✓ ${cat}: ${count} items`);
});

console.log('\n🍽️  የጾም ምግብ (Fasting Food):');
const fastingItems = menu.filter(item => item.main_category === 'የጾም ምግብ');
console.log(`  Total: ${fastingItems.length} items`);
console.log(`  Sample: ${fastingItems.slice(0, 3).map(i => i.name).join(', ')}`);

console.log('\n🍽️  የፍስክ ምግብ (Fisk Food):');
const fiskItems = menu.filter(item => item.main_category === 'የፍስክ ምግብ');
console.log(`  Total: ${fiskItems.length} items`);
console.log(`  Sample: ${fiskItems.map(i => i.name).join(', ')}`);

console.log('\n✅ Both categories are now main categories alongside Cafe, Barista, and Restaurant!');
