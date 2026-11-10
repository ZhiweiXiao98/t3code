"""Exact reviewed PNG validation function; no artifact execution."""
import struct,zlib
def require(ok,why):
    if not ok:raise ValueError(why)

def validate_png(data):
    require(data[:8]==b'\x89PNG\r\n\x1a\n','Invalid screenshot PNG signature')
    offset=8;chunks=[];compressed=[];width=height=channels=0
    while offset<len(data):
        require(offset+12<=len(data),'Truncated PNG chunk')
        size=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8]
        require(size<=32*1024**2 and offset+12+size<=len(data),'PNG chunk size')
        payload=data[offset+8:offset+8+size];crc=struct.unpack('>I',data[offset+8+size:offset+12+size])[0]
        require(zlib.crc32(kind+payload)&0xffffffff==crc,'PNG chunk CRC mismatch')
        require(kind.isalpha() and len(kind)==4,'Invalid PNG chunk type')
        if not chunks:require(kind==b'IHDR','PNG must start with IHDR')
        if kind==b'IHDR':
            require(not chunks and size==13,'Duplicate/invalid PNG IHDR')
            width,height,depth,color,compression,filtering,interlace=struct.unpack('>IIBBBBB',payload)
            require(0<width<=20000 and 0<height<=20000 and depth==8 and color in (2,6) and (compression,filtering,interlace)==(0,0,0),'Unexpected screenshot PNG format')
            channels=3 if color==2 else 4
        elif kind==b'IDAT':compressed.append(payload)
        elif kind==b'IEND':require(size==0 and offset+12==len(data),'Invalid PNG end/trailing data')
        else:require(kind[0]&32,'Unsupported PNG critical chunk')
        chunks.append(kind);offset+=12+size
    require(chunks and chunks[-1]==b'IEND' and compressed,'Incomplete PNG image')
    first=chunks.index(b'IDAT');last=len(chunks)-1-chunks[::-1].index(b'IDAT')
    require(all(k==b'IDAT' for k in chunks[first:last+1]),'Nonconsecutive PNG data')
    row=width*channels+1;expected=row*height
    require(expected<=128*1024**2,'PNG decoded size limit')
    decoder=zlib.decompressobj();pixels=decoder.decompress(b''.join(compressed),expected+1)
    require(len(pixels)==expected and decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail,'Invalid PNG compressed pixels')
    require(all(pixels[i] in range(5) for i in range(0,len(pixels),row)),'Invalid PNG filter')
    return width,height

