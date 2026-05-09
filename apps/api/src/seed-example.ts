import { closePool } from "./db.js";
import { resetDemoData } from "./test-reset.js";

async function main(): Promise<void> {
  process.stdout.write("Resetting to example dataset...\n");
  await resetDemoData();
  process.stdout.write("Example dataset loaded successfully.\n");
  process.stdout.write("\nCredentials:\n");
  process.stdout.write("  ada.admin        / AdminPass123!\n");
  process.stdout.write("  manny.manager    / ManagerPass123!\n");
  process.stdout.write("  elliot.employee  / EmployeePass123!\n");
  process.stdout.write("  pat.peer         / PeerPass123!\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Failed to reset example dataset: ${String(error)}\n`);
    process.exit(1);
  })
  .finally(() => closePool());
