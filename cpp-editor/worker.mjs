import { init, Wasmer, Directory } from "https://cdn.jsdelivr.net/npm/@wasmer/sdk@0.9.0/dist/index.mjs";
import wasmerSDKModule from "https://wasmerio.github.io/wasmer-js/wasm-inline.mjs";

let clangPkg = null;

async function ensureInit() {
  if (!clangPkg) {
    await init({ module: wasmerSDKModule });
    clangPkg = await Wasmer.fromRegistry("clang/clang");
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
    self.postMessage({ type: "error", data: String((err && err.message) || err) });
  }
};
