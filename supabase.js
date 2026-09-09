const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("PERINGATAN: Supabase URL atau Key belum terdeteksi di Environment Variables!");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

module.exports = { supabase };