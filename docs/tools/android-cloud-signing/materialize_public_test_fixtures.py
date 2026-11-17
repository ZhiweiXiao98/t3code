"""Fetch only two immutable public evidence fixtures, no keys or candidate code."""
import hashlib
from pathlib import Path
from sign_reviewed import Api,require
FIXTURES=[('ui-four-partitions.zip',14288732401,1526957,'0b6138fa068b408c114655c55ab14e3ff22c7eff6d3259684e1ab916f5729da9'),('collector-receipts.zip',14293750072,15427835,'7aeeb79fd9efd61a143f8aaae5e84078ce8b40d60ce7632427b6d0cd6e78e0bf')]
def materialize(api,root):
 root.mkdir(exist_ok=True)
 for name,id,size,sha in FIXTURES:
  target=root/name
  if not target.exists():api.download(id,target,size)
  raw=target.read_bytes();require(len(raw)==size and hashlib.sha256(raw).hexdigest()==sha,'Exact public test fixture mismatch')
if __name__=='__main__':materialize(Api(),Path(__file__).with_name('test-fixtures'))
