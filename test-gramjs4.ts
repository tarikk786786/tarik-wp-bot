import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const apiId = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";
const stringSession = new StringSession("");

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 1,
});

async function main() {
  await client.connect();
  console.log("Connected. Session string:", client.session.save());
}
main().catch(console.error);
