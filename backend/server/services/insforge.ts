import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = process.env.SUPABASE_URL || 'https://yusbeuftotjoxxaquxai.supabase.co';
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

if (!key) {
  console.warn('SUPABASE_SECRET_KEY is not set. Database operations will fail.');
}

const supabase = createClient(url, key);

export const insforge = {
  database: supabase
};
