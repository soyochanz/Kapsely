const fs = require('fs');
const filePath = 'c:\\Users\\Ochanz\\Desktop\\kaps\\src\\screens\\CapsuleCreationScreen.tsx';

let content = fs.readFileSync(filePath, 'utf-8');

const anchor = 'const flashAnim = useRef(new Animated.Value(0)).current;';

if (content.indexOf(anchor) === -1) {
    console.error('Core anchoring string not found.');
    process.exit(1);
}

const replacement = 'const flashAnim = useRef(new Animated.Value(0)).current;\r\n    const mediaAnims = useRef(Array.from({ length: 3 }).map(() => new Animated.Value(-600))).current;';

content = content.replace(anchor, replacement);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully inserted mediaAnims variable.');
