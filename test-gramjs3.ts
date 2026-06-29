import { StringSession } from "telegram/sessions/index.js";
const stringSession = new StringSession("");
console.log(stringSession.save());
