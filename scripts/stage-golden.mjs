// Puts the golden where the browser can fetch it.
//
// The reference lives with the example, which is the copy the test reads and the
// only one worth reviewing. Next serves `public/`, so the page needs it there
// too — copied on every dev and build rather than committed twice, because two
// committed copies drift and the stale one is the one that gets served.
import fs from "node:fs";
import path from "node:path";

const dir = path.join("examples", "two-renderers");
const found = fs.readdirSync(dir).filter((f) => /^golden@mesa-.*\.bin$/.test(f));
if (found.length !== 1) {
  throw new Error(`Expected exactly one golden in ${dir}, found ${found.length}: ${found}`);
}

fs.mkdirSync("public", { recursive: true });
const to = path.join("public", found[0]);
fs.copyFileSync(path.join(dir, found[0]), to);
console.log(`staged ${to}`);
