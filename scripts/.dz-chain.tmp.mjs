// Deezer 수집 단계를 순서대로 돌린다. Start-Process node.exe 로 띄우면 살아남는다.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const TSX = "C:/Users/User/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/tsx/dist/cli.mjs";
const LOG = "C:/Users/User/discogs-dump/dz-chain.log";
const say = (s) => appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`);

const stages = [
  ["artists", "600"],
  ["albums", "400"],
  ["match"],
  ["albums", "400"],
  ["match"],
];

for (const args of stages) {
  say(`>>> ${args.join(" ")}`);
  const r = spawnSync(process.execPath,
    [TSX, "--env-file=.env.local", "scripts/deezer-catalog.ts", ...args],
    { cwd: "C:/Users/User/Music_Taste", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  say((r.stdout || "") + (r.stderr || ""));
  say(`<<< exit ${r.status}`);
}
say("done");
