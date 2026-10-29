import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORLD_TEST_FILE = "src/services/generation/__tests__/detectives-single-review-world.test.ts";
export const WORLD_TEST_SHARDS = 4;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Collect the actual expanded it.each names. Every case belongs to exactly one
 * isolated runner; a new case is included automatically rather than skipped. */
export function planWorldShard(records, shard) {
  if (!Number.isInteger(shard) || shard < 1 || shard > WORLD_TEST_SHARDS || !Array.isArray(records) || !records.length)
    throw Error("A nonempty world-test inventory and a valid shard are required");
  const names = records.map(record => {
    if (!record || typeof record.name !== "string" || !record.name.trim() || typeof record.file !== "string"
      || !record.file.replaceAll("\\", "/").endsWith("/" + WORLD_TEST_FILE))
      throw Error("World inventory contains a foreign file or an unnamed test");
    return record.name;
  }).sort();
  if (new Set(names).size !== names.length) throw Error("Duplicate world-test names cannot be partitioned safely");
  const selected = names.filter((_, index) => index % WORLD_TEST_SHARDS === shard - 1);
  if (!selected.length) throw Error("An empty world-test shard cannot pass");
  const testNamePattern = "^(?:" + selected.map(escapeRegex).join("|") + ")$";
  const pattern = new RegExp(testNamePattern);
  if (names.some(name => pattern.test(name) !== selected.includes(name))) throw Error("World-test partition does not match its inventory");
  return { file: WORLD_TEST_FILE, shard, shards: WORLD_TEST_SHARDS, totalTests: names.length, selected, testNamePattern };
}

function main(args) {
  const listOnly = args.length === 1 && args[0] === "--list";
  if (!listOnly && !(args.length === 2 && args[0] === "--shard" && /^[1-4]\/4$/.test(args[1])))
    throw Error("Usage: node scripts/ci-detective-worlds.mjs --list | --shard 1/4");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const vitest = path.join(root, "node_modules/vitest/vitest.mjs");
  const collect = extra => JSON.parse(execFileSync(process.execPath, [vitest, "list", WORLD_TEST_FILE, "--json", ...extra],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  const records = collect([]);
  const plans = Array.from({ length: WORLD_TEST_SHARDS }, (_, index) => planWorldShard(records, index + 1));
  if (plans.flatMap(plan => plan.selected).length !== records.length) throw Error("Incomplete world-test partition");
  if (listOnly) { console.log(JSON.stringify(plans, null, 2)); return; }
  const plan = plans[Number(args[1].split("/")[0]) - 1];
  const collectedSelection = collect(["--testNamePattern", plan.testNamePattern]);
  if (JSON.stringify(collectedSelection.map(record => record.name).sort()) !== JSON.stringify(plan.selected))
    throw Error("Vitest did not collect the exact selected shard; refusing an empty or incomplete pass");
  console.log(JSON.stringify({ shard: plan.shard, shards: plan.shards, totalTests: plan.totalTests, selected: plan.selected }));
  const result = spawnSync(process.execPath, [vitest, "run", WORLD_TEST_FILE, "--maxWorkers=1", "--testNamePattern", plan.testNamePattern],
    { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
