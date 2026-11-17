"""Pure data handoff for signed-candidate acceptance; never signs or publishes."""
import hashlib,json,re
SOURCE='74039745b1b44834c30dd9cb275f1c224072dd96'
UNSIGNED='bb6e519ad4a6fbab7985c860444c0fbbd5778c44c03a15418ccb66017157598e'
ZIP='0b6bf435e1ace45f4fe50701aff952022931c36211a697f3dd9c9fbb5baddc6e'
CERT='82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'
NAME='T3-Code-zh-CN-Android-0.1.9-zh.2-arm64-v8a.apk'
def need(v,m):
 if not v:raise ValueError(m)
def check_candidate(apk,provenance,certificate,package,version,code,abis):
 need(type(apk)is bytes and bool(apk),'Candidate bytes required')
 p=provenance
 expected={'source_sha':SOURCE,'candidate_source_sha':SOURCE,'candidate_run_id':43901004126,'candidate_artifact_id':14246066879,'candidate_unsigned_apk_sha256':UNSIGNED,'candidate_artifact_sha256':ZIP,'certificate_sha256':CERT,'apk_signature_verified':True,'distribution_state':'signed-candidate-not-published','installed_app_acceptance':False,'publication_performed':False}
 need(all(p.get(k)==v for k,v in expected.items()),'Candidate chain/identity/state changed')
 need(p.get('signed_apk_sha256')==hashlib.sha256(apk).hexdigest() and p.get('signed_apk_size')==len(apk),'Exact signed bytes differ')
 need(certificate==CERT and package=='com.zhiweixiao.t3code.zhcn' and version=='0.1.9-zh.2' and code==1000417 and abis==['arm64-v8a'],'Installed candidate must retain original certificate/package/ABI')
 return {'source':SOURCE,'signed_apk_sha256':hashlib.sha256(apk).hexdigest(),'signed_apk_size':len(apk),'certificate_sha256':CERT,'scope':'Exact staged bytes checked; not install/open/page acceptance or publication approval'}
def validate_install_input(p):
 need(p.get('ready')is True,'BLOCKED: signed candidate does not yet exist')
 for k in ['signed_run_id','signed_artifact_id','signed_job_id','signed_apk_size']:
  need(type(p.get(k))is int and p[k]>0,'Unreviewed '+k)
 for k in ['signed_artifact_sha256','signed_apk_sha256','signer_commit']:
  need(isinstance(p.get(k),str) and re.fullmatch('[0-9a-f]{'+str(40 if k=='signer_commit' else 64)+'}',p[k]),'Unreviewed '+k)
 need(p.get('source')==SOURCE and p.get('certificate_sha256')==CERT and p.get('abi')=='arm64-v8a','Wrong signed candidate identity')
 return p
