require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function test() {
    console.log("Environment:");
    console.log("URL:", process.env.SUPABASE_URL);
    // console.log("Anon Key:", process.env.SUPABASE_ANON_KEY.substring(0, 20) + "...");
}
test();
