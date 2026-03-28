const fs = require('fs');
const { parse } = require('@babel/parser');
const code = fs.readFileSync('ventes.js', 'utf8');
try {
    parse(code, {
      sourceType: "module",
      plugins: ["topLevelAwait"]
    });
    console.log("ventes.js: No syntax errors found.");
} catch (e) {
    console.error("ventes.js: Syntax error found:", e.message);
    process.exit(1);
}
