/**
 * Builds standalone binaries with `bun build --compile` into dist/. A binary
 * holds the Bun runtime and OpenTUI's native library, so users need nothing else.
 *
 *   bun run build                      # this machine only
 *   bun run build darwin-arm64 linux-x64
 *   bun run build --all --pack         # every release target, packed for a release
 *
 * Other targets need their native library: install it with
 * `bun install --os="*" --cpu="*"`. With --pack, each binary goes into a
 * .tar.gz (a .zip on Windows) with the README and the license, and dist/SHA256SUMS
 * lists the checksums.
 */

import { $ } from "bun";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "windows-x64"];

const args = process.argv.slice(2);
const pack = args.includes("--pack");
const named = args.filter((a) => !a.startsWith("--"));
const host = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const targets = args.includes("--all") ? TARGETS : named.length ? named : [host];

for (const t of targets) {
  if (!TARGETS.includes(t))
    throw new Error(`unknown target ${t}; use one of ${TARGETS.join(", ")}`);
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

const sums: string[] = [];
for (const target of targets) {
  const exe = target.startsWith("windows") ? "stillwood.exe" : "stillwood";
  const dir = join("dist", target);
  mkdirSync(dir);
  // x64 uses the baseline build, which also runs on older processors.
  const bunTarget = `bun-${target}${target.endsWith("x64") ? "-baseline" : ""}`;
  await $`bun build src/main.ts --compile --minify --target=${bunTarget} --outfile ${join(dir, exe)}`.quiet();
  console.log(`  ${join(dir, exe)}`);
  if (!pack) continue;

  await $`cp README.md LICENSE ${dir}`;
  const archive = `stillwood-${target}${target.startsWith("windows") ? ".zip" : ".tar.gz"}`;
  if (target.startsWith("windows"))
    await $`cd ${dir} && zip -q -9 ../${archive} ${exe} README.md LICENSE`;
  else await $`tar -czf dist/${archive} -C ${dir} ${exe} README.md LICENSE`;
  const hash = new Bun.CryptoHasher("sha256").update(
    await Bun.file(join("dist", archive)).arrayBuffer(),
  );
  sums.push(`${hash.digest("hex")}  ${archive}`);
  console.log(`  dist/${archive}`);
}
if (pack) await Bun.write("dist/SHA256SUMS", sums.join("\n") + "\n");
