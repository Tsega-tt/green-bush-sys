#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'data', 'menu.json');

console.log('Reading menu.json...');
const menu = JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));

let count = 0;
menu.forEach(item => {
  if (item.name && item.name.includes('የፍስክ')) {
    item.main_category = 'የፍስክ ምግብ';
    item.category = 'የፍስክ ምግብ';
    item.sub_category = 'የፍስክ ምግብ';
    count++;
  }
});

console.log(`Updating ${count} items to main_category: የፍስክ ምግብ`);
fs.writeFileSync(MENU_FILE, JSON.stringify(menu, null, 2), 'utf8');
console.log('✅ Menu updated successfully!');
console.log(`የፍስክ ምግብ is now a main category alongside Restaurant, Cafe, Barista, and የጾም ምግብ`);
