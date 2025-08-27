// Minimal WS runner: g++ compile then run with a PTY, stream I/O
// npm i ws express node-pty tmp
const express = require('express');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const tmp = require('tmp');

const app = express();
const server = app.listen(process.env.PORT || 8080, () => {
  console.log('listening on', server.address().port);
});
const wss = new WebSocketServer({ server, path: '/run' });

function safeFlag(s) { return (s||'').replace(/[^\w+\-=.]/g, ''); }

wss.on('connection', (ws) => {
  let workDir = null;
  let childPty = null;

  function send(obj) { try { ws.send(JSON.stringify(obj)); } catch {} }

  ws.on('message', async (buf) => {
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

    if (msg.type === 'start') {
      // prepare temp dir
      workDir = tmp.dirSync({ unsafeCleanup: true }).name;
      const src = path.join(workDir, 'main.cpp');
      fs.writeFileSync(src, msg.code || '', 'utf8');

      // compile
      const flags = (msg.flags || '').split(/\s+/).filter(Boolean).map(safeFlag);
      const opt   = safeFlag(msg.opt || '');
      const args = ['-x','c++','-std=c++17','-O2', ...flags, src, '-o', 'a.out'];
      if (opt) args.splice(3, 1, opt); // replace -O2 with chosen opt if provided

      const gpp = spawn('g++', args, { cwd: workDir });
      let co = '', ce = '';
      gpp.stdout.on('data', d => { co += d.toString(); });
      gpp.stderr.on('data', d => { ce += d.toString(); });
      gpp.on('close', (code) => {
        send({ type: 'compile', ok: code === 0, code, stdout: co, stderr: ce });
        if (code !== 0) return;

        // run inside a PTY to get line-buffering and real stdin
        childPty = pty.spawn(path.join(workDir, 'a.out'), [], {
          name: 'xterm-color',
          cols: 120, rows: 30,
          cwd: workDir,
          env: process.env
        });
        send({ type: 'ready' });
        childPty.onData(data => send({ type:'stdout', data }));
        childPty.onExit(({ exitCode }) => {
          send({ type:'exit', code: exitCode });
          try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
        });
      });

    } else if (msg.type === 'stdin') {
      if (childPty) childPty.write(String(msg.data || ''));

    } else if (msg.type === 'kill') {
      try { childPty?.kill(); } catch {}
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      send({ type:'exit', code: 137 });
    }
  });

  ws.on('close', () => {
    try { childPty?.kill(); } catch {}
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  });
});
