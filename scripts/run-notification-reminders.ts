import { config } from "dotenv";
config();

import {
  runMeetingReminders,
  runTodoReminders,
  runTicketFollowupReminders,
  runScorecardInputReminders,
  runScorecardAlertCheck,
  runAllReminders,
} from "../src/jobs/notificationReminders";

const mode = process.argv[2] ?? "all";

async function main() {
  switch (mode) {
    case "meetings":
      await runMeetingReminders();
      break;
    case "todos":
      await runTodoReminders();
      break;
    case "tickets":
      await runTicketFollowupReminders();
      break;
    case "scorecards":
      await runScorecardInputReminders();
      await runScorecardAlertCheck();
      break;
    case "all":
    default:
      await runAllReminders();
      break;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[Reminders] Fatal:", e);
    process.exit(1);
  });
