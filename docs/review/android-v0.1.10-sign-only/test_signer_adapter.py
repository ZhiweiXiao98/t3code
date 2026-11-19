"""Synthetic mocked orchestration tests; never reads inherited signing secrets."""
import base64
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch,Mock
import signer_adapter as s

BADGE="package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000418' versionName='0.1.10-zh.1'\nnative-code: 'arm64-v8a'\n"

class Signer(unittest.TestCase):
    def context(self):
        return s.ReviewedAuthorization('ZhiweiXiao98/t3code',s.SOURCE_SHA,s.RUN_ID,s.ARTIFACT_ID,1,'a'*40,
            'refs/heads/signing/android-bootstrap','android-signing','b'*64,dict(s.SDK_PINS),True,True)
    def test_context_and_badging_guards(self):
        s._authorization(self.context());s._badge(BADGE)
        for change in ({'source_sha':'0'*40},{'candidate_attempt':2},{'operation_ref':'refs/heads/main'},
                       {'environment':'other'},{'activation_reviewed':False},{'recovery_verified':False},
                       {'sdk_tool_sha256':{}},{'artifact_id':1},{'operation_sha':'bad'}):
            with self.subTest(change=change),self.assertRaises(s.SignerError):s._authorization(replace(self.context(),**change))
        with self.assertRaises(s.SignerError):s._authorization(None)
        for text in (BADGE.replace('1000418','1000416'),BADGE.replace('arm64-v8a','x86_64'),BADGE+BADGE):
            with self.assertRaises(s.SignerError):s._badge(text)
    def test_unsigned_tool_guards(self):
        with tempfile.TemporaryDirectory() as d:
            apk=Path(d)/'candidate.apk'
            with zipfile.ZipFile(apk,'w') as z:z.writestr('AndroidManifest.xml',b'SYNTHETIC')
            for status,text,allowed in [(1,'DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF',True),
                                        (0,'Verifies',False),(1,'DOES NOT VERIFY: corrupt',False),(2,'Missing META-INF/MANIFEST.MF',False)]:
                with self.subTest(status=status,text=text),patch.object(s,'_success',return_value=BADGE),patch.object(s,'_run',return_value=(status,text)):
                    if allowed:s._unsigned(apk,Path(d),{})
                    else:
                        with self.assertRaises(s.SignerError):s._unsigned(apk,Path(d),{})
            with zipfile.ZipFile(apk,'a') as z:z.writestr('META-INF/OLD.RSA',b'SYNTHETIC')
            with patch.object(s,'_success',return_value=BADGE),self.assertRaises(s.SignerError):s._unsigned(apk,Path(d),{})

    def exercise(self, fault=None, padded=False):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);original=root/'unsigned.apk'
            with open(original,'wb') as f:f.truncate(s.APK_BYTES)
            tools=root/'tools';tools.mkdir()
            for name in s.TOOLS:
                (tools/name).parent.mkdir(exist_ok=True);(tools/name).write_text('SYNTHETIC TOOL NOT EXECUTABLE')
            output=root/'output';calls=[];work_paths=[]
            def run(args,env):
                args=[str(x) for x in args];calls.append((args,dict(env)))
                self.assertNotIn('ANDROID_KEYSTORE_BASE64',env);self.assertNotIn('ANDROID_KEYSTORE_PASSWORD',env)
                self.assertNotIn('GITHUB_TOKEN',env)
                if args[1]=='sign':
                    self.assertEqual(env.get('T3_REVIEWED_PASSWORD'),'p'*48)
                    self.assertNotIn('p'*48,' '.join(args))
                    key=Path(args[args.index('--ks')+1]);self.assertEqual(key.read_bytes(),b'SYNTHETIC KEY');self.assertEqual(key.stat().st_mode&0o777,0o600);work_paths.append(key.parent)
                    if fault=='sign':return 1,'private diagnostic NEVER expose'
                    Path(args[args.index('--out')+1]).write_bytes(b'SYNTHETIC SIGNED APK')
                else:self.assertNotIn('T3_REVIEWED_PASSWORD',env)
                if args[1]=='verify':return 0,'Signer #1 certificate SHA-256 digest: '+('0'*64 if fault=='cert' else s.CERT_SHA)+'\n'
                if args[1]=='dump':return 0,BADGE
                return 0,''
            def encrypt(payload,key,dest,**kw):
                self.assertEqual(payload,b'SYNTHETIC SIGNED APK')
                if fault=='encrypt':raise ValueError('injected')
                Path(dest).write_bytes(b'SYNTHETIC CIPHER')
                return {'ciphertextSha256':'d'*64,'ciphertextBytes':16,'algorithm':'test','recipientSpkiSha256':'PRIVATE METADATA','plaintextSha256':'PRIVATE HASH'}
            env={'ANDROID_KEYSTORE_BASE64':base64.b64encode(b'SYNTHETIC KEY').decode(),'ANDROID_KEYSTORE_PASSWORD':'p'*48,'GITHUB_TOKEN':'do-not-inherit','PATH':os.environ.get('PATH','')}
            if padded:env['ANDROID_KEYSTORE_BASE64']=' \r\n'+env['ANDROID_KEYSTORE_BASE64']+'\n\t '
            if fault=='password':env['ANDROID_KEYSTORE_PASSWORD']='bad\npassword'
            def pinned_hash(p):
                if fault=='SDK' and Path(p).suffix!='.apk':return '0'*64
                if fault=='preflight' and Path(p).suffix=='.apk':return '0'*64
                return s.APK_SHA if Path(p).suffix=='.apk' else s.SDK_PINS[str(Path(p).relative_to(tools))]
            with patch.dict(os.environ,env,clear=True),patch.object(s,'_hash',side_effect=pinned_hash),patch.object(s,'recipient_key'),patch.object(s,'_unsigned'),patch.object(s,'_run',side_effect=run),patch.object(s,'encrypt_handoff',side_effect=encrypt),patch.object(s.hashlib,'sha256',return_value=Mock(hexdigest=lambda:s.KEYSTORE_SHA if fault!='keyhash' else '0'*64)):
                if fault:
                    with self.assertRaises(s.StageFailure) as caught:s.sign_candidate(original,tools,b'SYNTHETIC PUBLIC',output,authorization=self.context())
                    expected={'SDK':'SDK','preflight':'preflight','sign':'tool','cert':'verify','encrypt':'encrypt','password':'stored-identity','keyhash':'container'}[fault]
                    self.assertEqual(str(caught.exception),'T3_SIGN_STAGE_'+expected)
                    for sensitive in ('private diagnostic','injected','p'*48,'SYNTHETIC',str(root),'PRIVATE HASH'):
                        self.assertNotIn(sensitive,str(caught.exception))
                    self.assertFalse(output.exists())
                else:
                    result=s.sign_candidate(original,tools,b'SYNTHETIC PUBLIC',output,authorization=self.context())
                    self.assertEqual(sorted(p.name for p in output.iterdir()),['handoff.json','public-manifest.json'])
                    public=(output/'public-manifest.json').read_text();self.assertNotIn('PRIVATE',public);self.assertNotIn('recipient',public);self.assertNotIn('plaintext',public)
                    self.assertFalse(result['publicationPerformed']);self.assertFalse(result['deviceAcceptancePerformed'])
            for work in work_paths:self.assertFalse(work.exists())
    def test_mocked_success(self):self.exercise()
    def test_outer_whitespace_base64(self):self.exercise(padded=True)
    def test_mocked_failure_cleanup(self):
        for fault in ('preflight','SDK','sign','cert','encrypt','password','keyhash'):
            with self.subTest(fault=fault):self.exercise(fault)

if __name__=='__main__':unittest.main()
