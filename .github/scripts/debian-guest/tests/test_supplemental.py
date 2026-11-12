import copy,json,pathlib,tempfile,unittest
from test_runtime import Results,common
class Supplemental(unittest.TestCase):
    def test_fail_closed(self):
        for fault in ('missing','sensitive','raw_text','secret_enabled','mutation','bad_digest','overclaim','missing_route','extra_image','traversal'):
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);m,v=Results().fixture(root);c=v['cjk/linux-chinese-ui.json'];a=c['supplemental_settings_audit']
                if fault=='missing':del c['supplemental_settings_audit']
                elif fault=='sensitive':a['not_captured']=[]
                elif fault=='raw_text':a['routes'][0]['body_text']='SYNTHETIC_SENSITIVE_CANARY'
                elif fault=='secret_enabled':a['secrets']['captured']=True
                elif fault=='mutation':a['menus'][0]['value_unchanged']=False
                elif fault=='bad_digest':a['screenshots'][0]['sha256']='0'*64
                elif fault=='overclaim':a['scrolls'][0]['reached_bottom']=False
                elif fault=='missing_route':a['routes'].pop()
                elif fault=='extra_image':a['screenshots'].append(copy.deepcopy(a['screenshots'][0]))
                elif fault=='traversal':a['screenshots'][0]['name']='../secret.png'
                (root/'cjk/linux-chinese-ui.json').write_text(json.dumps(c))
                with self.assertRaises(ValueError):common.validate_results(root,m)
if __name__=='__main__':unittest.main()
