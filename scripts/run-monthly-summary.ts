import { config } from "dotenv";
config();

import { runMonthlySummary } from "../src/jobs/notificationSummaries";

runMonthlySummary()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[MonthlySummary] Fatal:", e);
    process.exit(1);
  });
