"""Inert offline adapter; no CLI, dispatch, recovery, upload or publication.
Authorization is an orchestration contract, not an authorization service. The caller
must independently review its operation and recipient before constructing it.
"""
import base64
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

from encrypted_handoff import encrypt_handoff, recipient_key

APK_SHA='478e905f6a8cf5bbc5194d47f678a36d24b93d3e06c0dfe15e88fd007aba8724'
APK_BYTES=101730516
KEYSTORE_SHA='7e4922f7de02c1c739e627eb3ef87fa1fb639329ed27613dff8b4f0fdad2d397'
CERT_SHA='82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'
SOURCE_SHA='2ed55016b6678ca997f204d9b7af4048ce0307e6'
RUN_ID=44228163780
ARTIFACT_ID=14395695421
SDK_PINS={'aapt2': '1a6a396b9cd071f7040071fdd108718cb98c3c9f4960044f373b288993d19eb7', 'zipalign': 'c5f559e946de5a9e7d58792181db20383b228877812136bc469d97ae00a43b0a', 'apksigner': 'b47549e373b895ce6ca620d0c7887e674d9615ffa837a86ac601dcfd04adb0f0', 'lib/apksigner.jar': '3716d9311e55d2b0918a2fd9d54ba9e406c5f6abeea700b287f11259bc163dec', 'lib64/libLLVM_android.so': 'f35907663f0069916f86aaafceadc55698f02a8f8cfc21bcd91833f849b2dc09', 'lib64/libbcc.so': 'f69fd124a305f6d9774e62759e21f6aeea7f12745189d9d4b4ae99977761d83b', 'lib64/libbcinfo.so': 'ff584620b65dfee59bcb5050c692398cf03fe9326b1e6daf1a92f1f30ac24cc6', 'lib64/libc++.so': '96a19cd2154a4423a61f8444e5d3148a608fa3033bc1a22285d19855a950d05a', 'lib64/libc++.so.1': '7eb2812ec39ab5c31f2fc9f906f412c713e76e0d07d6a6911108c7f886e24945', 'lib64/libclang_android.so': 'f18899cc604a3a1a9b836804cdfeb1ff96b25faff2b75f5ff451037a4308660f'}
TOOLS=tuple(SDK_PINS)


# Fixed categories only: never interpolate exceptions, tools, paths or identity data.
STAGE_CODES=frozenset({'preflight','proof','SDK','stored-identity','container','tool','verify','encrypt'})
class StageFailure(ValueError):
    def __init__(self,code):
        self.stage_code=code if type(code) is str and code in STAGE_CODES else 'preflight'
        super().__init__('T3_SIGN_STAGE_'+self.stage_code)

def failure_code(error, fallback='preflight'):
    code=getattr(error,'stage_code',fallback)
    return code if type(code) is str and code in STAGE_CODES else 'preflight'

class SignerError(ValueError): pass

def need(ok,message):
    if not ok: raise SignerError(message)

@dataclass(frozen=True)
class ReviewedAuthorization:
    repository: str
    source_sha: str
    candidate_run_id: int
    artifact_id: int
    candidate_attempt: int
    operation_sha: str
    operation_ref: str
    environment: str
    recipient_spki_sha256: str
    sdk_tool_sha256: dict
    recovery_verified: bool
    activation_reviewed: bool


def _authorization(context):
    need(type(context) is ReviewedAuthorization,'Reviewed authorization context required')
    need(context.repository=='ZhiweiXiao98/t3code' and context.source_sha==SOURCE_SHA and
         context.candidate_run_id==RUN_ID and context.artifact_id==ARTIFACT_ID and
         context.candidate_attempt==1,'Wrong candidate context')
    need(context.operation_ref=='refs/heads/signing/android-bootstrap' and
         context.environment=='android-signing' and re.fullmatch('[0-9a-f]{40}',context.operation_sha) is not None,
         'Wrong operation context')
    need(context.recovery_verified is True and context.activation_reviewed is True,'Review/recovery approval required')
    need(context.sdk_tool_sha256==SDK_PINS,'Fixed reviewed SDK tool hashes required')


def _hash(path):
    with open(path,'rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()


def _run(args,environment):
    try:
        result=subprocess.run([str(a) for a in args],env=environment,capture_output=True,text=True,timeout=180)
    except Exception:
        raise SignerError('Android tool invocation failed; output withheld') from None
    return result.returncode,result.stdout+result.stderr


def _success(args,environment):
    status,output=_run(args,environment)
    need(status==0,'Android tool failed; output withheld')
    return output


def _badge(text):
    packages=re.findall(r"^package: name='([^']*)' versionCode='([^']*)' versionName='([^']*)'",text,re.M)
    need(packages==[('com.zhiweixiao.t3code.zhcn','1000418','0.1.10-zh.1')],'Package/version mismatch')
    need(re.findall(r'^native-code:\s*(.*)$',text,re.M)==["'arm64-v8a'"],'ABI mismatch')


def _unsigned(path,tools,environment):
    _badge(_success([tools/'aapt2','dump','badging',path],environment))
    with zipfile.ZipFile(path) as archive:
        need(archive.testzip() is None,'APK ZIP integrity failure')
        need(not any(re.match(r'META-INF/[^/]+\.(RSA|DSA|EC|SF)$',n,re.I) for n in archive.namelist()),'Existing v1 signature')
    status,output=_run([tools/'apksigner','verify','--verbose',path],environment)
    need(status==1 and 'DOES NOT VERIFY' in output and 'Missing META-INF/MANIFEST.MF' in output,
         'Expected reviewed unsigned verification result')


def sign_candidate(unsigned_apk,sdk_tools,public_key,output_directory,*,authorization):
    """Create only a new ciphertext directory and allowlisted public manifest.
    No real secrets are used by tests. Output parent must be trusted/private.
    Tools are independently authenticated by the orchestrator before this call.
    Temporary files are removed, not physically erased; Python and environment
    secret memory cannot be reliably scrubbed. This is not a readiness assertion.
    """
    stage='preflight'
    try:
        _authorization(authorization)
        tools=Path(sdk_tools).resolve();original=Path(unsigned_apk)
        need(original.is_file() and not original.is_symlink() and original.stat().st_size==APK_BYTES and _hash(original)==APK_SHA,'Unsigned APK pin mismatch')
        stage='SDK'
        for name in TOOLS:
            tool=tools/name
            need(tool.is_file() and not tool.is_symlink() and _hash(tool)==authorization.sdk_tool_sha256[name],'SDK tool pin mismatch')
        need(not (tools/'apksigner.jar').exists() and not (tools/'apksigner.jar').is_symlink(),'Unexpected alternate signer JAR')
        stage='preflight'
        recipient_key(public_key,authorization.recipient_spki_sha256)
        output=Path(output_directory)
        need(output.parent.is_dir() and not output.exists() and not output.is_symlink(),'New private output directory required')
        # Allowlist, not a copy of CI environment: no workflow tokens or signing secrets.
        clean_env={k:os.environ[k] for k in ('PATH','JAVA_HOME','LANG','LC_ALL','TZ') if k in os.environ}
        clean_env['LC_ALL']='C'
        made_output=False
        try:
            with tempfile.TemporaryDirectory(prefix='t3-reviewed-sign-') as directory:
                work=Path(directory);os.chmod(work,0o700)
                clean_env['HOME']=str(work);clean_env['TMPDIR']=str(work)
                unsigned=work/'unsigned.apk';shutil.copyfile(original,unsigned)
                need(unsigned.stat().st_size==APK_BYTES and _hash(unsigned)==APK_SHA,'Copied APK pin mismatch')
                stage='verify'
                _unsigned(unsigned,tools,clean_env)
                stage='stored-identity'
                password=os.environ.get('ANDROID_KEYSTORE_PASSWORD','')
                encoded=os.environ.get('ANDROID_KEYSTORE_BASE64','').strip()
                need(32<=len(password)<=256 and not any(c in password for c in '\r\n\x00'),'Invalid password shape')
                need(0<len(encoded)<=48000,'Invalid keystore size')
                stage='container'
                try: key_bytes=base64.b64decode(encoded,validate=True)
                except ValueError: raise SignerError('Invalid keystore encoding') from None
                need(hashlib.sha256(key_bytes).hexdigest()==KEYSTORE_SHA,'Keystore container mismatch')
                key=work/'identity.p12'
                with open(key,'xb') as stream:
                    os.fchmod(stream.fileno(),0o600);stream.write(key_bytes)
                stage='tool'
                aligned=work/'aligned.apk';signed=work/'signed.apk'
                _success([tools/'zipalign','-P','16','-f','4',unsigned,aligned],clean_env)
                sign_env=dict(clean_env,T3_REVIEWED_PASSWORD=password)
                try:
                    _success([tools/'apksigner','sign','--ks',key,'--ks-key-alias','t3code-release',
                              '--ks-pass','env:T3_REVIEWED_PASSWORD','--key-pass','env:T3_REVIEWED_PASSWORD',
                              '--out',signed,aligned],sign_env)
                finally: sign_env.clear()
                stage='verify'
                verification=_success([tools/'apksigner','verify','--verbose','--print-certs',signed],clean_env)
                certs=re.findall(r'^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]+)\s*$',verification,re.M)
                need([c.lower() for c in certs]==[CERT_SHA],'Signer certificate mismatch')
                _badge(_success([tools/'aapt2','dump','badging',signed],clean_env))
                _success([tools/'zipalign','-c','-P','16','-v','4',signed],clean_env)
                stage='encrypt'
                output.mkdir(mode=0o700);made_output=True
                envelope=encrypt_handoff(signed.read_bytes(),public_key,output/'handoff.json',allowed_fingerprints=[authorization.recipient_spki_sha256])
                public={'schemaVersion':1,'format':'t3-encrypted-signing-handoff','sourceSha':SOURCE_SHA,
                        'candidateRunId':RUN_ID,'candidateAttempt':1,'artifactId':ARTIFACT_ID,
                        'operationSha':authorization.operation_sha,'ciphertextSha256':envelope['ciphertextSha256'],
                        'ciphertextBytes':envelope['ciphertextBytes'],'algorithm':envelope['algorithm'],
                        'senderAuthenticated':False,'publicationPerformed':False,'deviceAcceptancePerformed':False}
                with open(output/'public-manifest.json','x',encoding='utf8') as stream:
                    os.fchmod(stream.fileno(),0o600);json.dump(public,stream,sort_keys=True)
            need(not work.exists(),'Signing workspace cleanup failed')
            return public
        except BaseException:
            if made_output: shutil.rmtree(output)
            raise
    except Exception:
        raise StageFailure(stage) from None
