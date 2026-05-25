import { config } from "dotenv";
config();

import { runWeeklySummary } from "../src/jobs/notificationSummaries";

runWeeklySummary()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[WeeklySummary] Fatal:", e);
    process.exit(1);
  });
