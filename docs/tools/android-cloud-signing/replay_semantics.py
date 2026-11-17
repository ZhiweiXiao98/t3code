"""Reuse original strict supplemental upload/report checks; explicit new UI schema.
Observed log digests are emitted for later review, NOT pre-existing signer pins.
"""
import json,zipfile,hashlib
from pathlib import Path
import verify_supplemental as original
from validate_coverage_manifest import validate_manifest
from verify_ui_partitions import verify_bytes

def replay(plan,receipt,root):
    root=Path(root);jobs={j['id']:j for j in receipt['jobs']};arts={a['api']['name']:a for a in receipt['artifacts']};observed=[]
    for p in plan['artifacts']:
        if not p['require_original_upload_log']:continue
        a=p['api_snapshot'];j=jobs[p['producer_job_id']]['api'];log=jobs[j['id']]
        original.require(log.get('kind')=='original-http-response-bytes','Required original log missing')
        created,updated=map(original.stamp,[a['created_at'],a['updated_at']])
        original.require(original.stamp(j['started_at'])<=created<=updated<=original.stamp(j['completed_at']),'Original proof producer interval')
        steps=[s for s in j['steps'] if s['name']==p['upload_step_name']]
        original.require(len(steps)==1,'Original exact upload step');s=steps[0]
        original.require(s['status']=='completed' and s['conclusion']=='success' and original.stamp(s['started_at'])<=created<=updated<=original.stamp(s['completed_at']),'Original proof upload interval')
        pin={'id':a['id'],'name':a['name'],'size':a['size_in_bytes'],'sha256':a['digest'][7:],'producer_job_id':j['id'],'upload_step_name':p['upload_step_name'],'producer_log_sha256':log['sha256']}
        original.verify_upload_log(None,pin,[j],root)
        observed.append(pin)
    def member(name,filename):
        a=arts[name]
        with zipfile.ZipFile(root/f"artifact-{a['id']}.zip") as z:
            original.require(z.namelist()==[filename],'Original single-member report contract')
            return original.strict_json(z.read(filename).decode())
    m=member('supplemental-coverage-proof','coverage-manifest.json')
    validate_manifest(m,{'source':m['source'],'workflow':m['workflow']})
    original.require(m['source']['sha']==plan['source'] and m['source']['tree']==plan['tree'] and m['workflow']['run_id']==43989361423,'Supplemental frozen identity')
    for lane in m['lanes']:
        original.check_raw_report(member('supplemental-report-'+lane['lane'],'coverage-result.json'),lane)
        lp=member('supplemental-lane-'+lane['lane'],'lane.json')
        original.require(lp['evidence']==lane and lp['source_sha']==plan['source'] and lp['source_tree']==plan['tree'] and lp['run_id']==43989361423,'Lane metadata binding')
    pins=json.loads((Path(__file__).parent/'ui-partition-pins.PROPOSED.json').read_text())
    ui=verify_bytes((root/f"artifact-{pins['artifact']['id']}.zip").read_bytes(),pins)
    return {'supplemental':'original strict manifest + five named raw reports + six original upload logs','ui':ui,'newly_observed_transport_pins':observed,'pin_status':'OBSERVED_NOT_PREAPPROVED','signing_approval':False,'scope':'26 API gate receipts; original supplemental/UI semantics. Other small ZIPs retained, not newly asserted as semantic validation. Android/desktop large bytes remain separate verified receipts.'}
