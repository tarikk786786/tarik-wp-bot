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

1. Configure your Gemini API Key in the `.env` file (or AI Studio Secrets panel).
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm run dev
   ```
4. Open the web interface.
5. Scan the QR code displayed with your WhatsApp app (Linked Devices -> Link a Device).
6. The bot is now online and will reply to incoming messages!

## Project Structure
- `/server/bot/`: Baileys WhatsApp connection and message handlers
- `/server/services/`: Gemini AI integration, memory management, and WebSocket events
- `/server/routes/`: Express API routes
- `/src/`: React Frontend (Terminal UI)
