"""Modify only a disposable diagnostic controller, never the packaged application."""
import argparse, hashlib, json, pathlib
EXPECTED = 'f74353fcb8e406756a70a6af0dfc4a5069acd577e35ec9d923ccf36ac009c2f5'
START = 'let electronArguments = ["--inspect=0", "--remote-debugging-port=0", ...options2.args || []];'
BOUNDARY = '          debuggerDisconnectPromise.then(() => {\n'
def transform(raw, hook):
    if hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError('Unreviewed Playwright bundle')
    text = raw.decode()
    if text.count(START) != 1 or text.count(BOUNDARY) != 1:
        raise ValueError('Ambiguous startup boundary')
    injection = '''          const diagnosticPaused = new Promise((resolve) => nodeConnection.rootSession.once("Debugger.paused", resolve));
          await nodeConnection.rootSession.send("Debugger.enable");
          await nodeConnection.rootSession.send("Runtime.runIfWaitingForDebugger");
          const diagnosticPause = await progress2.race(diagnosticPaused);
          if (diagnosticPause.reason !== "Break on start")
            throw new Error("Unexpected diagnostic startup pause");
          const diagnostic = await nodeConnection.rootSession.send("Runtime.evaluate", {
            expression: HOOK, includeCommandLineAPI: true, returnByValue: true
          });
          if (diagnostic.exceptionDetails || diagnostic.result?.value?.localOnly !== true ||
              diagnostic.result?.value?.beforeReady !== true || diagnostic.result?.value?.windowCount !== 0)
            throw new Error("Local-only early crash hook failed; refusing resume");
          await nodeConnection.rootSession.send("Debugger.resume");
          await nodeConnection.rootSession.send("Debugger.disable");
'''.replace('HOOK', json.dumps(hook))
    text = text.replace(START, START.replace('--inspect=0', '--inspect-brk=0'))
    return text.replace(BOUNDARY, injection + BOUNDARY).encode()
if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('bundle');p.add_argument('output');a=p.parse_args()
    output=pathlib.Path(a.output)
    if output.exists():raise ValueError('Output must be a new disposable copy')
    output.write_bytes(transform(pathlib.Path(a.bundle).read_bytes(),pathlib.Path(__file__).with_name('early-hook.cjs').read_text()))
