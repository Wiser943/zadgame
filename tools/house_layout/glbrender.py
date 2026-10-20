import json,struct,sys,numpy as np
from matplotlib.collections import PolyCollection
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(p):
    b=open(p,'rb').read(); n=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+n]); off=20+n
    bl=struct.unpack('<I',b[off:off+4])[0]; return j,b[off+8:off+8+bl]
def acc(j,bin,i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; dt=CT[a['componentType']]; nc=NC[a['type']]
    off=bv.get('byteOffset',0)+a.get('byteOffset',0); stride=bv.get('byteStride') or nc*np.dtype(dt).itemsize
    cnt=a['count']; 
    if stride==nc*np.dtype(dt).itemsize: return np.frombuffer(bin,dtype=dt,count=cnt*nc,offset=off).reshape(cnt,nc)
    out=np.zeros((cnt,nc),dt)
    for k in range(cnt): out[k]=np.frombuffer(bin,dtype=dt,count=nc,offset=off+k*stride)
    return out
def quat(q):
    x,y,z,w=q; return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def nodemat(n):
    M=np.eye(4)
    if 'matrix' in n: return np.array(n['matrix']).reshape(4,4).T
    T=np.eye(4);T[:3,3]=n.get('translation',[0,0,0]); R=np.eye(4);R[:3,:3]=quat(n.get('rotation',[0,0,0,1])); S=np.diag(list(n.get('scale',[1,1,1]))+[1]); return T@R@S
def tris(p, only=None):
    j,bin=load(p); out=[]  # (verts(3,3), color)
    def walk(i,P):
        n=j['nodes'][i]; M=P@nodemat(n)
        if 'mesh' in n:
            for pr in j['meshes'][n['mesh']]['primitives']:
                pos=acc(j,bin,pr['attributes']['POSITION']).astype(float)
                idx=acc(j,bin,pr['indices']).reshape(-1) if 'indices' in pr else np.arange(len(pos))
                col=[.7,.7,.7]
                if 'material' in pr:
                    m=j['materials'][pr['material']]; col=m.get('pbrMetallicRoughness',{}).get('baseColorFactor',[.7,.7,.7,1])[:3]
                w=(M@np.c_[pos,np.ones(len(pos))].T).T[:,:3]
                out.append((w[idx].reshape(-1,3,3),np.array(col),n.get('name')))
        for c in n.get('children',[]): walk(c,M)
    for r in j['scenes'][j.get('scene',0)]['nodes']: walk(r,np.eye(4))
    return out
def render(p, out, az=45, el=35, up='y', size=1400):
    T=tris(p); V=np.concatenate([t[0] for t in T]); C=np.concatenate([np.repeat(t[1][None],len(t[0]),0) for t in T])
    if up=='z': V=V[:,:,[0,2,1]]*np.array([1,1,-1]) 
    a=np.radians(az); e=np.radians(el)
    Ry=np.array([[np.cos(a),0,np.sin(a)],[0,1,0],[-np.sin(a),0,np.cos(a)]]); Rx=np.array([[1,0,0],[0,np.cos(e),-np.sin(e)],[0,np.sin(e),np.cos(e)]])
    W=V@Ry.T@Rx.T
    n=np.cross(W[:,1]-W[:,0],W[:,2]-W[:,0]); n/= (np.linalg.norm(n,axis=1,keepdims=True)+1e-9)
    light=np.array([.3,.8,.5]); light/=np.linalg.norm(light); sh=.45+.55*np.abs(n@light)
    depth=W[:,:,2].mean(1); order=np.argsort(depth)
    polys=W[order][:,:,:2]; cols=np.clip(C[order]*sh[order][:,None],0,1)
    fig,ax=plt.subplots(figsize=(size/100,size/100),dpi=100); ax.add_collection(PolyCollection(polys,facecolors=cols,edgecolors='none'))
    mn=polys.reshape(-1,2).min(0); mx=polys.reshape(-1,2).max(0); pad=(mx-mn).max()*.03; ax.set_xlim(mn[0]-pad,mx[0]+pad); ax.set_ylim(mn[1]-pad,mx[1]+pad); ax.set_aspect('equal'); ax.axis('off'); fig.patch.set_facecolor('#8ab')
    fig.savefig(out,facecolor=fig.get_facecolor(),bbox_inches='tight'); plt.close(fig)
    print('tris',len(V),'bbox',V.reshape(-1,3).min(0).round(2),V.reshape(-1,3).max(0).round(2))
if __name__=='__main__':
    p,out=sys.argv[1],sys.argv[2]; az=float(sys.argv[3]) if len(sys.argv)>3 else 45; el=float(sys.argv[4]) if len(sys.argv)>4 else 35
    render(p,out,az,el)
