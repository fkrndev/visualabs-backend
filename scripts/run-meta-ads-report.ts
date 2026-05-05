import { config } from "dotenv";
config();

import { runMetaAdsDailyReport } from "../src/jobs/metaAdsDailyReport";

runMetaAdsDailyReport()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[MetaAdsJob] Fatal:", e);
    process.exit(1);
  });
