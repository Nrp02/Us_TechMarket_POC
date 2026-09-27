import json, re, subprocess
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
class Visible(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.hidden+=1
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden: self.parts.append(data)
def norm(s): return re.sub(r'\s+',' ',s).strip()
draft=json.loads(Path('.scratch/narrative-audit/authored-draft.json').read_text())
selected={'2026-09-21':'META','2026-09-22':'CSCO','2026-09-23':'TXN','2026-09-24':'ORCL','2026-09-25':'NVDA'}
checks=[('market',r) for r in draft['market']]+[('stock',r) for r in draft['stocks']]
def check(item):
    kind,row=item
    path='/' if kind=='market' else '/todays-activity/'+row['symbol']
    url='https://ustechmarket.vercel.app'+path+'?date='+row['story_date']
    result=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','60',url],capture_output=True,text=True,check=True)
    status=200; html=result.stdout
    parser=Visible(); parser.feed(html); visible=norm(' '.join(parser.parts))
    expected={k:(v['text'] if isinstance(v,dict) else v) for k,v in row['sections'].items()}
    missing=[k for k,v in expected.items() if norm(v) not in visible]
    return dict(url=url,status=status,sections=len(expected),missing=missing)
with ThreadPoolExecutor(max_workers=3) as pool: results=list(pool.map(check,checks))
Path('.scratch/narrative-audit/production-pages.json').write_text(json.dumps(results,indent=2))
print(json.dumps({'pages':len(results),'sections':sum(r['sections'] for r in results),'failed':[r for r in results if r['missing'] or r['status']!=200]},indent=2))
if any(r['missing'] or r['status']!=200 for r in results): raise SystemExit(1)
