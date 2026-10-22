import numpy as np, json, sys, itertools
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from glbrender import tris
P='/home/claude/game/public/allconnect/models/world/house_interior.glb'
FLOOR=-0.43; PX=0.004     # raw units per pixel
T=tris(P)
V=np.concatenate([t[0] for t in T])
xmin,xmax=V[:,:,0].min(),V[:,:,0].max(); zmin,zmax=V[:,:,2].min(),V[:,:,2].max()
W=int((xmax-xmin)/PX)+2; H=int((zmax-zmin)/PX)+2
def raster(sel):
    im=Image.new('L',(W,H),0); d=ImageDraw.Draw(im)
    for tri in V[sel]:
        d.polygon([((p[0]-xmin)/PX,(p[2]-zmin)/PX) for p in tri],fill=1)
    return np.array(im,dtype=bool)
ymax=V[:,:,1].max(1); ymin=V[:,:,1].min(1)
n=np.cross(V[:,1]-V[:,0],V[:,2]-V[:,0]); nn=n/(np.linalg.norm(n,axis=1,keepdims=True)+1e-12)
floor_sel=(np.abs(nn[:,1])>.9)&(ymax<FLOOR+.03)&(ymin>FLOOR-.03)
tall_sel=(ymax>FLOOR+.10)&(ymin<FLOOR+.7)
floor=raster(floor_sel); tall=raster(tall_sel)
floor=ndi.binary_closing(floor,iterations=3); tallD=ndi.binary_dilation(tall,iterations=2)
def sat(m): s=np.zeros((m.shape[0]+1,m.shape[1]+1)); s[1:,1:]=m.cumsum(0).cumsum(1); return s
Sf,St=sat(floor),sat(tall)
def cov(S,x0,z0,x1,z1):
    a=max(0,int(round((x0-xmin)/PX))); b=max(0,int(round((z0-zmin)/PX))); c=min(W,int(round((x1-xmin)/PX))); d=min(H,int(round((z1-zmin)/PX)))
    if c<=a or d<=b: return 0.0
    return (S[d,c]-S[b,c]-S[d,a]+S[b,a])/((c-a)*(d-b))
def build(k,ox,oz,thr=.30,gw=None,gd=None):
    cs=1/k; gw=gw or int(np.ceil((xmax-ox)/cs)); gd=gd or int(np.ceil((zmax-oz)/cs))
    inside=np.zeros((gw,gd),bool); blocked=np.zeros((gw,gd),bool); tc=np.zeros((gw,gd))
    for x in range(gw):
        for z in range(gd):
            x0=ox+x*cs; z0=oz+z*cs
            inside[x,z]=cov(Sf,x0,z0,x0+cs,z0+cs)>=.55
            tc[x,z]=cov(St,x0+.1*cs,z0+.1*cs,x0+.9*cs,z0+.9*cs)
            blocked[x,z]=tc[x,z]>=thr
    free=inside&~blocked
    # edges: blocked if tall pixels lie on the centre-to-centre segment
    def seg_hit(a,b):
        ax=ox+(a[0]+.5)*cs; az=oz+(a[1]+.5)*cs; bx=ox+(b[0]+.5)*cs; bz=oz+(b[1]+.5)*cs
        for t in np.linspace(.18,.82,9):
            px=ax+(bx-ax)*t; pz=az+(bz-az)*t; i=int((px-xmin)/PX); j=int((pz-zmin)/PX)
            if 0<=i<W and 0<=j<H and tallD[j,i]: return True
        return False
    return dict(k=k,ox=ox,oz=oz,cs=cs,gw=gw,gd=gd,inside=inside,blocked=blocked,free=free,seg_hit=seg_hit,tc=tc)
def components(L,edge_open=set()):
    free=L['free']; gw,gd=L['gw'],L['gd']; lab=-np.ones((gw,gd),int); cur=0; sizes=[]
    for x in range(gw):
        for z in range(gd):
            if not free[x,z] or lab[x,z]>=0: continue
            q=[(x,z)]; lab[x,z]=cur; cnt=0
            while q:
                c=q.pop(); cnt+=1
                for dx,dz in((1,0),(-1,0),(0,1),(0,-1)):
                    n=(c[0]+dx,c[1]+dz)
                    if 0<=n[0]<gw and 0<=n[1]<gd and free[n] and lab[n]<0:
                        key=(min(c,n),max(c,n))
                        if key in edge_open or not L['seg_hit'](c,n): lab[n]=cur; q.append(n)
            sizes.append(cnt); cur+=1
    return lab,sizes
if __name__=='__main__':
    best=None
    for k in (2.2,2.3,2.4,2.5,2.6):
        cs=1/k
        for fx in np.linspace(0,1,6,endpoint=False):
            for fz in np.linspace(0,1,6,endpoint=False):
                ox=xmin-fx*cs; oz=zmin-fz*cs
                L=build(k,ox,oz); lab,sz=components(L)
                tot=int(L['free'].sum()); main=max(sz) if sz else 0; frag=len(sz)
                score=main-0.5*(tot-main)-3*(frag-1)
                if best is None or score>best[0]: best=(score,k,ox,oz,tot,main,frag,L['gw'],L['gd'])
    print('best',best)
