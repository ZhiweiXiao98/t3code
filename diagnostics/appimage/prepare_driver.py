"""Diagnostic keeps the exact full source driver byte-for-byte; reports stay private."""
import hashlib
EXPECTED='606bc590f5a8d330cb00c9f4848e1224760ea41b29d5665c5456ca9589ecf368'
def transform(raw):
 if hashlib.sha256(raw).hexdigest()!=EXPECTED:raise ValueError('Wrong full source driver')
 return raw
