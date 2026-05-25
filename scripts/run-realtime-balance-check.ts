import { config } from "dotenv";
config();

import { runRealtimeBalanceCheck } from "../src/jobs/realtimeBalanceCheck";

runRealtimeBalanceCheck()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[RealtimeBalanceCheck] Fatal:", e);
    process.exit(1);
  });
