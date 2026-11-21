"""Offline demo only: ephemeral synthetic identity, never a community signing entry point."""
import argparse, hashlib, json, os, pathlib, re, secrets, subprocess, tempfile, zipfile

APK_SHA = '478e905f6a8cf5bbc5194d47f678a36d24b93d3e06c0dfe15e88fd007aba8724'
ZIP_SHA = 'a76c289908aef9a7b46a284b73f0cfb284337ec6e874d6d42e679b8ecee98414'
MEMBER = 'T3-Code-zh-CN-Android-0.1.10-zh.1-arm64-UNSIGNED-NOT-INSTALLABLE.apk'
COMMUNITY_CERT = '82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'

def run(args, env=None):
    p = subprocess.run([str(x) for x in args], capture_output=True, text=True, env=env, timeout=180)
    if p.returncode: raise RuntimeError('Android tool failed; output withheld')
    return p.stdout + p.stderr

def badging(text):
    if "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000418' versionName='0.1.10-zh.1'" not in text:
        raise RuntimeError('Wrong package/version')
    if re.findall(r'^native-code:\s*(.*)$', text, re.M) != ["'arm64-v8a'"]:
        raise RuntimeError('Wrong ABI')

def demo(archive, sdk):
    # No caller-supplied identity/key path or community secret is accepted.
    if os.environ.get('ANDROID_KEYSTORE_BASE64') or os.environ.get('ANDROID_KEYSTORE_PASSWORD'):
        raise RuntimeError('Refuse real-signing environment')
    raw = pathlib.Path(archive).read_bytes()
    if len(raw) != 47480291 or hashlib.sha256(raw).hexdigest() != ZIP_SHA:
        raise RuntimeError('Wrong original archive')
    tool = pathlib.Path(sdk).resolve()
    for name in ('aapt2','apksigner','zipalign'):
        if not (tool/name).is_file(): raise RuntimeError('Reviewed SDK tools required')
    with tempfile.TemporaryDirectory(prefix='t3-synthetic-sign-') as tmp:
        work = pathlib.Path(tmp); os.chmod(work,0o700)
        with zipfile.ZipFile(archive) as z:
            if sorted(z.namelist()) != sorted([MEMBER,'SIGNING-BLOCKER.txt']): raise RuntimeError('Wrong members')
            apk = z.read(MEMBER)
        if len(apk)!=101730516 or hashlib.sha256(apk).hexdigest()!=APK_SHA: raise RuntimeError('Wrong APK')
        unsigned=work/'original.apk'; unsigned.write_bytes(apk)
        badging(run([tool/'aapt2','dump','badging',unsigned]))
        p=subprocess.run([str(tool/'apksigner'),'verify','--verbose',str(unsigned)],capture_output=True,text=True,timeout=180)
        if p.returncode!=1 or 'DOES NOT VERIFY' not in p.stdout+p.stderr: raise RuntimeError('Expected unsigned candidate')
        aligned=work/'aligned.apk'; signed=work/'SYNTHETIC-DO-NOT-DISTRIBUTE.apk'; key=work/'synthetic.p12'
        # Cryptographically random temporary password stays only in child process environment.
        env=os.environ.copy(); env['T3_SYNTHETIC_PASSWORD']=secrets.token_urlsafe(48)
        run(['keytool','-genkeypair','-alias','synthetic-only','-keyalg','RSA','-keysize','2048','-validity','1','-dname','CN=SYNTHETIC TEST ONLY','-storetype','PKCS12','-keystore',key,'-storepass:env','T3_SYNTHETIC_PASSWORD','-keypass:env','T3_SYNTHETIC_PASSWORD'],env)
        os.chmod(key,0o600)
        run([tool/'zipalign','-P','16','-f','4',unsigned,aligned])
        run([tool/'apksigner','sign','--ks',key,'--ks-key-alias','synthetic-only','--ks-pass','env:T3_SYNTHETIC_PASSWORD','--key-pass','env:T3_SYNTHETIC_PASSWORD','--out',signed,aligned],env)
        verification=run([tool/'apksigner','verify','--verbose','--print-certs',signed])
        certs=re.findall(r'^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]+)\s*$',verification,re.M)
        if len(certs)!=1 or certs[0].lower()==COMMUNITY_CERT: raise RuntimeError('Must be one non-community synthetic signer')
        run([tool/'zipalign','-c','-P','16','4',signed]); badging(run([tool/'aapt2','dump','badging',signed]))
        result={'synthetic_signature_verified':True,'package_version_abi_verified':True,'page_alignment_verified':True,'original_key_used':False,'installed_app_acceptance':False,'publication_performed':False,'signed_output_retained':False,'unsigned_apk_sha256':APK_SHA}
    # Both key and signed APK are removed before any success result is returned.
    if work.exists(): raise RuntimeError('Temporary cleanup failed')
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--sdk-tools',required=True);a=p.parse_args()
    print(json.dumps(demo(a.archive,a.sdk_tools),indent=2))
