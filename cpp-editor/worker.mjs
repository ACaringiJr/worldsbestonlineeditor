// worker.mjs (load with new Worker('worker.mjs', { type: 'module' }))
// Same-origin module worker that pulls Wasmer JS SDK over ESM and runs clang in-browser.
// No websockets. Pauses on stdio only for WASM programs that read from stdin; we simulate
// stdin by buffering lines posted from the main thread.

import { init, Wasmer, Directory } from "https://unpkg.com/@wasmer/sdk@latest/dist/index.mjs";

let clangPkg = null;

async function ensureInit() {
  if (!clangPkg) {
    await init();
    clangPkg = await Wasmer.fromRegistry("clang/clang"); // downloads once, then cached
  }
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === "ping") {
      self.postMessage({ type: "pong" });
      return;
    }
    if (msg.type === "compile-run") {
      const { code, stdin = "" } = msg;
      await ensureInit();

      // Set up a project fs
      const project = new Directory();
      await project.writeFile("main.cpp", code);

      // Compile to wasm
      const compile = await clangPkg.entrypoint.run({
        args: ["/project/main.cpp", "-O2", "-std=gnu++17", "-o", "/project/a.wasm"],
        mount: { "/project": project },
      });
      const compOut = await compile.wait();
      if (!compOut.ok) {
        const err = (await compile.stderr) || "";
        self.postMessage({ type: "error", data: "Clang failed:\n" + err });
        return;
      }

      // Run the produced wasm (batch stdin)
      const programWasm = await project.readFile("a.wasm");
      const prog = await Wasmer.fromFile(programWasm);
      const run = await prog.entrypoint.run({
        stdin,
        mount: { "/project": project },
      });
      const result = await run.wait();
      const stdout = result.stdout || "";
      const stderr = result.stderr || "";
      self.postMessage({ type: "done", stdout, stderr, code: result.code ?? 0 });
      return;
    }
  } catch (err) {
    self.postMessage({ type: "error", data: String(err && err.message || err) });
  }
};
