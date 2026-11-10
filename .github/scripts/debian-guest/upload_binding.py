import hashlib,re
from live_contract import require
def validate_upload_logs(m,job,log_text,artifacts=None):
    from datetime import datetime,timedelta
    def date(text):return datetime.fromisoformat(text.replace('Z','+00:00'))
    require(hashlib.sha256(log_text.encode()).hexdigest()==m['producerLogSha256'],'Producer log digest mismatch')
    for number,name,aid,digest in [(m['packageUploadStepNumber'],'client-linux-x64',m['artifactId'],m['artifactZipSha256']),(m['proofUploadStepNumber'],'linux-build-proof',m['proofArtifactId'],m['proofZipSha256'])]:
        steps=[s for s in job.get('steps',[]) if s.get('number')==number]
        require(len(steps)==1 and steps[0].get('conclusion')=='success','Upload step is not successful')
        step=steps[0];require('upload-artifact' in step.get('name',''),'Wrong producer step')
        start=date(step['started_at'])-timedelta(seconds=1);end=date(step['completed_at'])+timedelta(seconds=1)
        lines=[]
        for line in log_text.splitlines():
            parts=line.split(' ',1)
            try:stamp=date(parts[0])
            except (ValueError,IndexError):continue
            if start<=stamp<=end:lines.append(line)
        block='\n'.join(lines)
        # Disambiguate adjacent upload steps even when timestamp resolution overlaps.
        groups=list(re.finditer(r'(?m)^.*##\[group\]Run actions/upload-artifact@[^\n]*\n',log_text))
        candidates=[]
        for group in groups:
            next_group=re.search(r'(?m)^.*##\[group\]',log_text[group.end():])
            stop=group.end()+next_group.start() if next_group else len(log_text)
            candidate=log_text[group.start():stop]
            if re.search(r'\bname:\s*'+re.escape(name)+r'\s*(?:\n|$)',candidate):candidates.append(candidate)
        require(len(candidates)==1,'Cannot uniquely bind upload action log group')
        require(re.search(r'Artifact ID:?\s*'+str(aid)+r'\b',candidates[0],re.I) and digest in candidates[0],'Artifact ID/digest belong to another upload group')
        require(re.search(r'\bname:\s*'+re.escape(name)+r'\s*(?:\n|$)',block),'Upload artifact name missing from exact step window')
        require(re.search(r'Artifact ID:?\s*'+str(aid)+r'\b',block,re.I),'Upload artifact ID missing')
        require(digest in block,'Upload artifact digest missing')
        require(artifacts is not None,'Artifact metadata required for upload byte-size check')
        metas=[a for a in artifacts if a.get('id')==aid];require(len(metas)==1,'Missing artifact size metadata')
        size=metas[0].get('size_in_bytes');require(type(size) is int and size>0,'Missing final artifact size')
        final=r'Artifact '+re.escape(name)+r' has been successfully uploaded! Final size is '+str(size)+r' bytes\. Artifact ID is '+str(aid)+r'\b'
        require(re.search(final,candidates[0]) and re.search(final,block),'Final upload name/size/ID mismatch')

