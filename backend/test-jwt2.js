require('dotenv').config({ path: '../.env' });
const fs = require('fs');

async function test() {
    const tokenLine = fs.readFileSync('/tmp/reely-backend.log', 'utf8')
        .split('\n').filter(line => line.includes('Token prefix:')).pop();
    if (!tokenLine) return console.log("No token line found in log");

    // Wait, the log only has prefix (first 15 chars). We need the FULL token.
    console.log("We need the full token to test it.");
}
test();
