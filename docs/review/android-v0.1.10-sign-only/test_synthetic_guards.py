import unittest,urllib.request
from unittest.mock import patch
import synthetic_sign_test as s
import verify_live as v
class Guards(unittest.TestCase):
    def test_real_identity_env_rejected_before_file_read(self):
        for name in ('ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD'):
            with self.subTest(name=name),patch.dict(s.os.environ,{name:'synthetic-sentinel'}):
                with self.assertRaisesRegex(RuntimeError,'Refuse real-signing'):s.demo('/not/read','/not/run')
    def test_redirect_rejected(self):
        with self.assertRaisesRegex(ValueError,'redirects forbidden'):
            v.NoRedirect().redirect_request(urllib.request.Request(v.BASE),None,302,'Moved',{},'https://example.com')
    def test_package_and_abi(self):
        good="package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000418' versionName='0.1.10-zh.1'\nnative-code: 'arm64-v8a'\n"
        s.badging(good)
        for bad in (good.replace('1000418','1000417'),good.replace('arm64-v8a','x86_64'),good.replace('com.zhiweixiao','com.example')):
            with self.assertRaises(RuntimeError):s.badging(bad)
    def test_tool_output_not_exposed(self):
        class Result:
            returncode=1;stdout='synthetic-sensitive-output';stderr='synthetic-sensitive-output'
        with patch.object(s.subprocess,'run',return_value=Result()):
            with self.assertRaisesRegex(RuntimeError,'output withheld') as cm:s.run(['unused'])
            self.assertNotIn('sensitive-output',str(cm.exception))
if __name__=='__main__':unittest.main()
