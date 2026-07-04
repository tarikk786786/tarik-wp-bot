import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

if (!url || !key) {
  console.error('CRITICAL ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in your .env file.');
  console.error('The server cannot start without a database connection.');
  process.exit(1); // Fail-fast
}

const supabase = createClient(url, key);

export const insforge = {
  database: supabase
};
