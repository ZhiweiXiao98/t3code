"""Classifier fixtures: strict JSON shapes, scalar types, ranges and attribution."""
import copy, json, unittest
from run_probe import validate, EXPECTED_CHECKS, unique_object, invalid_constant
class Classification(unittest.TestCase):
    def setUp(self):
        self.single={"mode":"single","stage":"complete","checks":EXPECTED_CHECKS,"checksum":1,"rounds":4096}
        self.parallel={"mode":"parallel","threads":2,"distinctCpuAffinity":True,"stage":["complete"]*2,"checks":[EXPECTED_CHECKS]*2,"checksum":[1,2],"rounds":4096}
        self.mismatch={"mode":"mismatch-fixture","stage":"gather_all_active_value","checks":0,"checksum":0,"rounds":4096}
    def mutate(self, case, field, values):
        for value in values:
            with self.subTest(case=case,field=field,value=value):
                d=copy.deepcopy(getattr(self,case));d[field]=value
                self.assertFalse(validate(case,0,d))
    def test_valid_single(self):self.assertTrue(validate("single",0,self.single))
    def test_valid_parallel(self):self.assertTrue(validate("parallel",0,self.parallel))
    def test_valid_controls(self):
        for case,site in [("negative-scalar","other"),("negative-gather","all_active")]:
            self.assertTrue(validate(case,139,{"signal":"SIGSEGV","gatherSite":site}))
    def test_mismatch_detected(self):self.assertTrue(validate("mismatch-fixture",1,self.mismatch))
    def test_mismatch_cannot_pass(self):self.assertFalse(validate("mismatch-fixture",0,self.mismatch))
    def test_mismatch_masked_not_all_active(self):
        d=copy.deepcopy(self.mismatch);d["stage"]="gather_masked_value";self.assertFalse(validate("mismatch-fixture",1,d))
    def test_partial_counts(self):self.mutate("single","checks",[EXPECTED_CHECKS-1])
    def test_skip_not_pass(self):self.assertFalse(validate("single",77,self.single))
    def test_fault_not_pass(self):self.assertFalse(validate("single",139,{"signal":"SIGSEGV","gatherSite":"all_active"}))
    def test_wrong_stage(self):self.mutate("single","stage",["clamp_index","gather_masked_value","gather_all_active_value",None,1])
    def test_affinity_required(self):self.mutate("parallel","distinctCpuAffinity",[False,1,0,"true",None])
    def test_both_threads_required(self):self.mutate("parallel","checks",[[EXPECTED_CHECKS,0]])
    def test_fault_site_strict(self):
        for site in [True,1,False,0,None,"masked","other",[],{}]:
            with self.subTest(site=site):self.assertFalse(validate("negative-gather",139,{"signal":"SIGSEGV","gatherSite":site}))
    def test_scalar_negative_not_gather(self):self.assertFalse(validate("negative-scalar",139,{"signal":"SIGSEGV","gatherSite":"all_active"}))
    def test_wrong_signal_rejected(self):self.assertFalse(validate("negative-gather",132,{"signal":"SIGILL","gatherSite":"all_active"}))
    def test_old_fault_shape_rejected(self):self.assertFalse(validate("negative-gather",139,{"signal":"SIGSEGV","atExactGather":1}))
    def test_non_dict(self):
        for value in [None,[],[],1,0,True,"single"]:
            with self.subTest(value=value):self.assertFalse(validate("single",0,value))
    def test_unknown_case(self):
        for case in ["unknown","",None,[],1,True]:
            with self.subTest(case=case):self.assertFalse(validate(case,0,self.parallel))
    def test_returncode_type(self):
        for rc in [0.0,False,"0",None,[],{}]:
            with self.subTest(rc=rc):self.assertFalse(validate("single",rc,self.single))
    def test_count_types(self):self.mutate("single","checks",[float(EXPECTED_CHECKS),True,str(EXPECTED_CHECKS),None,[],{}])
    def test_round_types(self):
        for case in ["single","parallel"]:self.mutate(case,"rounds",[4096.0,True,"4096",None,[],{}])
    def test_thread_types(self):self.mutate("parallel","threads",[2.0,True,"2",None,[],{}])
    def test_checksum_range_and_type(self):self.mutate("single","checksum",[-1,2**32,2**100,True,False,1.0,"1",None,[],{}])
    def test_checksum_boundaries(self):
        for value in [0,2**32-1]:
            d=copy.deepcopy(self.single);d["checksum"]=value;self.assertTrue(validate("single",0,d))
    def test_parallel_list_shapes(self):
        for field in ["stage","checks","checksum"]:self.mutate("parallel",field,[None,{},"12",1,True,[],[1],[1,2,3],(1,2)])
    def test_parallel_nested_types(self):
        self.mutate("parallel","checks",[[float(EXPECTED_CHECKS),EXPECTED_CHECKS],[True,EXPECTED_CHECKS]])
        self.mutate("parallel","checksum",[[1,-1],[1,2**32],[1,2**100],[1,True],[1,2.0],[1,None]])
        self.mutate("parallel","stage",[["complete",True],["complete",None]])
    def test_missing_and_extra_keys(self):
        for case in ["single","parallel"]:
            for key in getattr(self,case):
                d=copy.deepcopy(getattr(self,case));del d[key];self.assertFalse(validate(case,0,d))
            d=copy.deepcopy(getattr(self,case));d["extra"]=True;self.assertFalse(validate(case,0,d))
    def test_mismatch_integer_types(self):
        for field in ["checks","checksum","rounds"]:
            d=copy.deepcopy(self.mismatch);d[field]=float(d[field]);self.assertFalse(validate("mismatch-fixture",1,d))
    def test_duplicate_json_key_rejected(self):
        with self.assertRaises(ValueError):json.loads('{"a":1,"a":2}',object_pairs_hook=unique_object)
    def test_nonfinite_json_rejected(self):
        for text in ["NaN","Infinity","-Infinity"]:
            with self.assertRaises(ValueError):json.loads(text,parse_constant=invalid_constant)
if __name__=="__main__":unittest.main()
