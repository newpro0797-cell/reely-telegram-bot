require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

console.log('SDK Version:', require('@supabase/supabase-js/package.json').version);

async function test() {
    const tokenLine = fs.readFileSync('/tmp/reely-backend.log', 'utf8')
        .split('\n').filter(line => line.includes('Token prefix:')).pop();
    console.log('Token prefix:', tokenLine);

    // Test the API directly
    console.log("Making request to Supabase directly...");
}
test();
