// worker_inline_v3.mjs
// Wasmer JS SDK with inline runtime, plus environment checks.

import { init, Wasmer, Directory } from "https://cdn.jsdelivr.net/npm/@wasmer/sdk@0.9.0/dist/index.mjs";
import wasmerSDKModule from "https://wasmerio.github.io/wasmer-js/wasm-inline.mjs";

let clangPkg = null;

async function ensureInit() {
  if (typeof self.crossOriginIsolated !== 'undefined' && !self.crossOriginIsolated) {
    throw new Error("This page is not cross-origin isolated. Enable COOP/COEP (see coi-serviceworker).");
  }
  if (!clangPkg) {
    await init({ module: wasmerSDKModule });
    clangPkg = await Wasmer.fromRegistry("clang/clang");
  }
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === "compile-run") {
      const { code, stdin = "" } = msg;
      await ensureInit();

      const project = new Directory();
      await project.writeFile("main.cpp", code);

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

      const programWasm = await project.readFile("a.wasm");
      const prog = await Wasmer.fromFile(programWasm);
      const run = await prog.entrypoint.run({ stdin, mount: { "/project": project } });
      const result = await run.wait();
      self.postMessage({
        type: "done",
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        code: result.code ?? 0
      });
      return;
    }
  } catch (err) {
    self.postMessage({ type: "error", data: String((err && err.message) || err) });
  }
};
