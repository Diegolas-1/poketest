"""The concept turnaround's silhouettes, row by row (front view, back view, right side view), for build.py.

  python3 tools/people/ash_base/measure.py <turnaround.jpg> <profiles.json>
"""
import numpy as np, json
from PIL import Image
import sys; I=sys.argv[1]
def mask_of(path):
    im=np.array(Image.open(path).convert('RGB')).astype(float)
    r,g,b=im[...,0],im[...,1],im[...,2]; mx=im.max(-1); mn=im.min(-1); sat=(mx-mn)/np.maximum(mx,1)
    m=((sat>0.3)&(r>g)&(g>b))|((b>r+8)&(mx<120))|(mx<60)
    # drop thin horizontal guide lines: keep pixels with mask 3px above or below too
    v=m.copy(); v[2:-2]=m[2:-2]&((m[:-4]&m[1:-3])|(m[4:]&m[3:-1])|(m[1:-3]&m[3:-1]))
    m=v
    # fill holes: outside = reachable from the border through non-mask
    out=np.zeros_like(m); out[0,:]=out[-1,:]=out[:,0]=out[:,-1]=True; out&=~m
    for _ in range(3000):
        g2=out.copy(); g2[1:]|=out[:-1]; g2[:-1]|=out[1:]; g2[:,1:]|=out[:,:-1]; g2[:,:-1]|=out[:,1:]; g2&=~m
        if (g2==out).all(): break
        out=g2
    return ~out
m=mask_of(I)
Image.fromarray((m*255).astype(np.uint8)).save(sys.argv[2]+'.mask.png')
def segs(row):
    d=np.diff(np.r_[0,row.astype(int),0]); s=np.where(d==1)[0]; e=np.where(d==-1)[0]
    return [(int(a),int(b)) for a,b in zip(s,e) if b-a>2]
prof={'front':{},'side':{},'back':{}}
for y in range(60,1060):
    prof['front'][y]=segs(m[y,30:700]); prof['front'][y]=[(a+30,b+30) for a,b in prof['front'][y]]
    prof['back'][y]=[(a+680,b+680) for a,b in segs(m[y,680:1290])]
    prof['side'][y]=[(a+1290,b+1290) for a,b in segs(m[y,1290:1500])]
json.dump(prof,open(sys.argv[2],'w'))
for y in range(80,1060,20):
    print(y,'F',prof['front'][y],' S',prof['side'][y])
