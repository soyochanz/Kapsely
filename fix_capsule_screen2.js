const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\Ochanz\\Desktop\\kaps\\src\\screens\\CapsuleCreationScreen.tsx';

let content = fs.readFileSync(filePath, 'utf-8');

const regex = /<\/View>\s*<\/Animated\.View>\s*<\/Animated\.View>\s*<View style={styles\.heroTextOverlay}>/;

if (!regex.test(content)) {
    console.error('Target string not found via regex');
    process.exit(1);
}

const replacement = `</View>\r\n\r\n                        <View style={styles.heroTextOverlay}>`;

content = content.replace(regex, replacement);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully fixed nested overlays with regex.');
