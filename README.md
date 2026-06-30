# WhatsApp AI Bot (G0DM0D3)

An autonomous WhatsApp AI Bot powered by Google Gemini and Baileys.

## Features
- **Autopilot Mode**: Replies automatically to all incoming private messages.
- **Gemini Intelligence**: Uses the Gemini 2.5 Flash model for fast, smart replies.
- **Multimodal Support**: Understands and analyzes image and document attachments.
- **Contextual Memory**: Remembers up to the last 40 messages per user for smooth conversation flow.
- **G0DM0D3 Terminal UI**: A sleek, dark-themed terminal UI to monitor logs and scan QR codes.
- **Session Persistence**: Stays logged in even after server restarts.

## Setup Instructions

1. Copy `.env.example` to `.env`, then configure Gemini and a long random admin token.
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ADMIN_TOKEN="a_long_random_password"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm run dev
   ```
4. Open the web interface and sign in as any username with `ADMIN_TOKEN` as the password.
5. Scan the QR code displayed with your WhatsApp app (Linked Devices -> Link a Device).
6. The bot is now online and will reply to incoming messages!

## Project Structure
- `/server/bot/`: Baileys WhatsApp connection and message handlers
- `/server/services/`: Gemini AI integration, memory management, and WebSocket events
- `/server/routes/`: Express API routes
- `/src/`: React Frontend (Terminal UI)

## Production

WhatsApp and Telegram require a persistent process and persistent `DATA_DIR`; do not deploy the bot runtime to Vercel. The included Render blueprint mounts `/var/data`. Telegram additionally requires `TG_API_ID` and `TG_API_HASH` from `my.telegram.org`.

Never commit `.env`, `bot_config.json`, WhatsApp auth data, or Telegram sessions. Rotate any token that has previously appeared in Git history.

## WhatsApp account safety

This project replies only to inbound messages. It does not provide bulk, broadcast, cold-outreach, or ban-evasion features. Conservative pacing, per-chat cooldowns, STOP/START handling, group mention requirements, bounded retries, and a reconnect circuit breaker are enabled by default. A `paused` status requires you to inspect the account/network and manually restart instead of hammering WhatsApp.

Baileys is an unofficial WhatsApp Web client, so no setting can guarantee that WhatsApp will not restrict the account. For business or production automation, migrate to Meta's official WhatsApp Business Platform/Cloud API and follow its opt-in, 24-hour service-window, template, opt-out, and human-escalation rules.
