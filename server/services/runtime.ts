import path from 'path';

function flag(name: string) {
  return ['1', 'true'].includes((process.env[name] || '').toLowerCase());
}

export const isVercel = flag('VERCEL');
export const isProduction = process.env.NODE_ENV === 'production';
export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : isVercel ? path.join('/tmp', 'tarik-wp-bot') : process.cwd();
export const whatsappAuthDir = path.join(dataDir, 'baileys_auth_info');
export const telegramAuthDir = path.join(dataDir, 'tg_auth_info');
export const configFile = path.join(dataDir, 'bot_config.json');

export function validateEnvironment() {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') warnings.push('GEMINI_API_KEY is not configured; AI replies will be unavailable.');
  if (isProduction && !process.env.ADMIN_TOKEN) errors.push('ADMIN_TOKEN is required in production.');
  if (isVercel) warnings.push('Vercel cannot host persistent bot connections; use Render, Railway, or a VM.');
  return { errors, warnings };
}
