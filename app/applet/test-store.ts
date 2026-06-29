import { StoreSession } from "telegram/sessions/index.js";
const storeSession = new StoreSession("/tmp/tg_auth_store");
storeSession.setDC(1, "127.0.0.1", 80);
