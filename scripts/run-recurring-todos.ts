import { config } from 'dotenv';
config();

import { runRecurringTodoGeneration } from '../src/jobs/recurringTodos';

// Opsional: argumen tanggal acuan (YYYY-MM-DD) untuk testing/catch-up manual.
const refDate = process.argv[2];

async function main() {
    await runRecurringTodoGeneration(refDate);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[RecurringTodos] Fatal:', e);
        process.exit(1);
    });
