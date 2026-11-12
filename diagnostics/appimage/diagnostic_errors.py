"""Fixed failure categories only. Never export exception text, argv or paths."""
import subprocess
KINDS={'timeout','subprocess-failed','invalid-evidence','io-error','schema-error','unexpected-error'}
def failure_kind(error):
 if isinstance(error,(TimeoutError,subprocess.TimeoutExpired)):return 'timeout'
 if isinstance(error,subprocess.CalledProcessError):return 'subprocess-failed'
 if isinstance(error,(ValueError,AssertionError)):return 'invalid-evidence'
 if isinstance(error,(KeyError,TypeError)):return 'schema-error'
 if isinstance(error,OSError):return 'io-error'
 return 'unexpected-error'
def observe(run,command,timeout,**kw):
 try:run(command,timeout,**kw);return {'exitCode':0}
 except (subprocess.CalledProcessError,TimeoutError,subprocess.TimeoutExpired) as error:
  result={'failureCode':failure_kind(error)}
  if isinstance(error,subprocess.CalledProcessError) and type(error.returncode) is int and -255<=error.returncode<=255:result['exitCode']=error.returncode
  return result
