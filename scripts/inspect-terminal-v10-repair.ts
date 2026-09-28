import { readFile } from "node:fs/promises";
import { inspectTerminalV10RepairSnapshot } from "./lib/terminal-v10-repair-preflight";

// No environment/DB/container/provider imports and no output files. Operator
// must provide a separately recorded hash, not a self-approving live snapshot.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--snapshot" || args[2] !== "--expected-sha256") {
    throw Error("Usage: inspect-terminal-v10-repair --snapshot <private-json> --expected-sha256 <recorded-hash>");
  }
  const plan = inspectTerminalV10RepairSnapshot(await readFile(args[1]!, "utf8"), args[3]!);
  console.log(JSON.stringify(plan, null, 2));
}
main().catch(error => {
  const reason = error instanceof Error && error.message.startsWith("TERMINAL_V10_PREFLIGHT:")
    ? error.message : "snapshot schema, JSON or file read failed";
  console.error(`Terminal v10 snapshot preflight refused: ${reason}. No changes made.`);
  process.exitCode = 1;
});
