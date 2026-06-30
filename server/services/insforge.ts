import { createAdminClient } from '@insforge/sdk';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.INSFORGE_URL || 'https://mkrrq64u.us-east.insforge.app';
const key = process.env.INSFORGE_KEY || 'ik_8e4591ffe92f43534d3c6456f980a230';

if (!key) {
  console.warn('INSFORGE_KEY is not set in environment variables. Database operations will fail.');
}

export const insforge = createAdminClient({ baseUrl: url, apiKey: key });
