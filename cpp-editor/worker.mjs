// worker_inline_v4.mjs
// Wasmer JS SDK with inline runtime + detailed progress + timeouts.

import { init, Wasmer, Directory } from "https://cdn.jsdelivr.net/npm/@wasmer/sdk@0.9.0/dist/index.mjs";
import wasmerSDKModule from "https://wasmerio.github.io/wasmer-js/wasm-inline.mjs";

let clangPkg = null;

function post(type, data){ self.postMessage(Object.assign({ type }, data || {})); }

async function ensureInit(signal){
  // Phase A: environment
  if (typeof self.crossOriginIsolated !== 'undefined' && !self.crossOriginIsolated) {
    throw new Error("Page is not cross-origin isolated. COOP/COEP required (use coi-serviceworker.js).");
  }
  post('status', { step: 'env-ok' });

  // Phase B: init Wasmer with inline runtime (no CORS .wasm fetch)
  post('status', { step: 'init-start' });
  await init({ module: wasmerSDKModule });
  post('status', { step: 'init-done' });

  // Phase C: fetch clang toolchain from Wasmer registry
  if (!clangPkg){
    post('status', { step: 'fetch-clang' });
    clangPkg = await Wasmer.fromRegistry("clang/clang");
    post('status', { step: 'clang-ready' });
  }
}

function withTimeout(promise, ms, label){
  let t;
  const timeout = new Promise((_, rej)=> t=setTimeout(()=>rej(new Error(label+" timed out after "+ms+"ms")), ms));
  return Promise.race([promise.finally(()=>clearTimeout(t)), timeout]);
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === "compile-run") {
      const { code, stdin = "" } = msg;
      post('status', { step: 'start' });

      await withTimeout(ensureInit(), 30000, "Initialization"); // 30s

      // FS
      post('status', { step: 'fs-write' });
      const project = new Directory();
      await project.writeFile("main.cpp", code);

      // Compile
      post('status', { step: 'compile' });
      const compile = await clangPkg.entrypoint.run({
        args: ["/project/main.cpp", "-O2", "-std=gnu++17", "-o", "/project/a.wasm"],
        mount: { "/project": project },
      });
      const compOut = await withTimeout(compile.wait(), 60000, "Compilation"); // 60s
      if (!compOut.ok) {
        const err = (await compile.stderr) || "";
        post('error', { data: "Clang failed:\n" + err });
        return;
      }
      post('status', { step: 'compile-done' });

      // Execute
      const programWasm = await project.readFile("a.wasm");
      const prog = await Wasmer.fromFile(programWasm);
      post('status', { step: 'run' });
      const run = await prog.entrypoint.run({ stdin, mount: { "/project": project } });
      const result = await withTimeout(run.wait(), 60000, "Program run"); // 60s

      post('done', {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        code: result.code ?? 0
      });
      return;
    }
  } catch (err) {
    post('error', { data: String((err && err.message) || err) });
  }
};
