import re,sys
import os
p=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','allconnect','style.css')
s=open(p,encoding='utf8').read()
M1='/* >>> AUTO-GENERATED DARK MODE OVERRIDES (do not edit by hand; regenerate with: python3 scripts/gen-dark.py). :where() keeps each rule at the same specificity as the light rule it mirrors, so .on / .sel states still win >>> */'
M2='/* <<< END AUTO-GENERATED DARK MODE OVERRIDES <<< */'
if M1 in s: s=s[:s.index(M1)].rstrip()+'\n'
src=re.sub(r'/\*.*?\*/','',s,flags=re.S)
def rgb(h):
    h=h.lstrip('#')
    if len(h)==3: h=''.join(c*2 for c in h)
    return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(c): return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255
def sat(c): return max(c)-min(c)
HEX=re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')
def bgmap(h):
    c=rgb(h); l=lum(c)
    if l>=0.93: return '#1b2034'
    if l>=0.86: return '#232842'
    if l>=0.80 and sat(c)<40: return '#2b3150'
    return None
def txmap(h):
    c=rgb(h); l=lum(c)
    if sat(c)<=70 or c[2]>c[0]+20:         # greys / navy inks, not brand colours
        if l<0.22: return '#e3e6f1'
        if l<0.45: return '#a9afc6'
    return None
def bdmap(h):
    c=rgb(h); l=lum(c)
    return 'rgba(255,255,255,.12)' if l>=0.80 and sat(c)<45 else None
out=[]; seen=set()
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',src):
    sel=m.group(1).strip(); body=m.group(2)
    if not sel or '@' in sel or 'data-theme' in sel or 'camdark' in sel or 'keyframes' in sel: continue
    sels=[x.strip() for x in sel.split(',') if x.strip()]
    sels=[x for x in sels if re.match(r'^[.#\[*a-zA-Z:]',x) and not re.match(r'^(from|to)$',x)]
    if not sels: continue
    decls=[]
    for d in body.split(';'):
        if ':' not in d: continue
        k,v=d.split(':',1); k=k.strip().lower(); v=v.strip().replace('!important','').strip()
        if k in('background','background-color') and HEX.match(v):
            r=bgmap(v)
            if r: decls.append(f'background:{r}')
        elif k=='color' and HEX.match(v):
            r=txmap(v)
            if r: decls.append(f'color:{r}')
        elif k.startswith('border') and ('#' in v):
            nv=re.sub(r'#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b',lambda mm:bdmap(mm.group(0)) or mm.group(0),v)
            if nv!=v: decls.append(f'{k}:{nv}')
    if not decls: continue
    key=(tuple(sels),tuple(decls))
    if key in seen: continue
    seen.add(key)
    out.append(', '.join(':where(html[data-theme="dark"]) '+x for x in sels)+'{'+';'.join(decls)+'}')
res=s+'\n'+M1+'\n'+'\n'.join(out)+'\n'+M2+'\n'
open(p,'w',encoding='utf8').write(res)
print(len(out),'rules')
