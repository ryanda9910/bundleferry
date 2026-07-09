/**
 * Self-driving demo for the README recording (VHS). Key-free and deterministic —
 * replays a representative bundleferry run, faithful to the real Parcel→Vite case
 * in CASES.md. Run: node examples/demo.mjs
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", b: "\x1b[1m",
  green: "\x1b[38;5;42m", red: "\x1b[38;5;203m", yellow: "\x1b[38;5;221m",
  grey: "\x1b[90m", cyan: "\x1b[36m", plus: "\x1b[38;5;42m",
};
async function line(s = "", d = 55) { process.stdout.write(s + "\n"); await sleep(d); }
async function type(s, speed = 12) { for (const ch of s) { process.stdout.write(ch); await sleep(speed); } process.stdout.write(C.reset + "\n"); }

async function main() {
  await line(`${C.green}${C.b}  bundleferry${C.reset} ${C.dim}— ferry your project across bundlers without sinking the build${C.reset}\n`, 400);

  // 1) run it on a Parcel app
  await type(`${C.cyan}$${C.reset} ${C.b}bundleferry ./my-parcel-app${C.reset}`, 22);
  await sleep(250);
  await line(`${C.dim}  detecting bundler + rendering mode…${C.reset}`, 600);
  await line();

  // 2) the plan — faithful to CASES.md Case 4 (Parcel → Vite)
  await line(`${C.b}bundleferry${C.reset} ${C.dim}— ./my-parcel-app${C.reset}`, 220);
  await line(`  bundler: ${C.b}parcel${C.reset}   render: ${C.b}csr${C.reset} ${C.dim}(client-rendered SPA)${C.reset}`, 260);
  await line();
  await line(`  ${C.b}Migration plan: Parcel → Vite${C.reset}`, 240);
  await line(`  ${C.green}green:${C.reset}`, 200);
  await line(`    • .parcelrc transformers → @vitejs/plugin-react (native)`, 180);
  await line(`    • index.html already HTML-first with type=module — nothing to move`, 180);
  await line(`  ${C.yellow}yellow:${C.reset}`, 200);
  await line(`    • ${C.b}15 .js files contain JSX${C.reset} → rename .jsx or set esbuild loader`, 200);
  await line(`    • .postcssrc present and ${C.b}Tailwind IS used${C.reset} → re-add deps, config → .cjs`, 200);
  await line(`  ${C.red}red:${C.reset}`, 200);
  await line(`    • custom .parcelrc optimizers with no Vite equivalent`, 180);
  await line();
  await line(`${C.red}${C.b}2 red-tier item(s) — do not say "done" until each is decided.${C.reset}`, 220);
  await line();
  await sleep(300);
  // 3) the honest size delta
  await type(`${C.cyan}$${C.reset} ${C.b}bundleferry --size old/dist new/dist${C.reset}`, 20);
  await sleep(200);
  await line(`  ${C.green}138.8 KB gzip → 126.5 KB gzip (-8.8%, smaller)${C.reset} ${C.dim}(honest total-transfer)${C.reset}`, 300);
  await line();
  await sleep(400);
  await line(`${C.green}  github.com/ryanda9910/bundleferry${C.reset}`, 100);
  await line();
}
main();
