"""Modify only the public upstream test dump's first module CodeView identity.

The fixture has no user data. Changes exercise fixed t3code/electron alias paths
and official debug ID lookup; no actual application dump is used or exposed.
"""
import hashlib,struct,uuid,pathlib
SHA='24b0ea7794b2d2523c46c9aea72c03ccbb0ab88ad76d8258d3752c7b71d233ff'
ORIGINAL_ID='5A9832E5287241C1838ED98914E9B7FF1'
OFFICIAL_ID='97859DFC1AC4DEDCB85DB23812CCCFC80'
WRONG_ID='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0'
def transform(raw,alias='t3code',wrong_id=False):
 if len(raw)!=11317 or hashlib.sha256(raw).hexdigest()!=SHA:raise ValueError('Wrong public fixture')
 if alias not in ('electron','t3code'):raise ValueError('Only fixed aliases permitted')
 data=bytearray(raw);matches=[];start=0
 while True:
  at=data.find(b'RSDS',start)
  if at<0:break
  start=at+4
  if at+24>=len(data):continue
  identity=uuid.UUID(bytes_le=bytes(data[at+4:at+20])).hex.upper()+format(struct.unpack_from('<I',data,at+20)[0],'x')
  if identity==ORIGINAL_ID:matches.append(at)
 if len(matches)!=1:raise ValueError('Unexpected public fixture module identity')
 at=matches[0];end=data.index(0,at+24);old=bytes(data[at+24:end])
 if old.split(b'\\')[-1]!=b'test_app.pdb':raise ValueError('Unexpected fixture debug filename')
 identity=WRONG_ID if wrong_id else OFFICIAL_ID
 data[at+4:at+20]=uuid.UUID(hex=identity[:32]).bytes_le
 struct.pack_into('<I',data,at+20,int(identity[32:],16))
 name=alias.encode();data[at+24:end+1]=name+b'\0'*(end+1-at-24-len(name))
 if len(data)!=len(raw):raise ValueError('Fixture layout changed')
 return bytes(data)
