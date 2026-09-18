// 발매그룹 대표 발매판 정하기 -> 트랙리스트 채우기. 오래 도는 작업이라 별도 프로세스로 띄운다.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
const TSX = "C:/Users/User/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/tsx/dist/cli.mjs";
const LOG = "C:/Users/User/discogs-dump/mbrg-chain.log";
const say = (s) => appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`);
const stages = [["map", "1500"], ...Array.from({ length: 12 }, () => ["tracks", "1500"])];
for (const args of stages) {
  say(`>>> ${args.join(" ")}`);
  const r = spawnSync(process.execPath, [TSX, "--env-file=.env.local", "scripts/mb-rg-fill.ts", ...args],
    { cwd: "C:/Users/User/Music_Taste", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  say((r.stdout || "").split("\n").slice(-6).join("\n") + (r.stderr || ""));
  say(`<<< exit ${r.status}`);
}
say("done");
