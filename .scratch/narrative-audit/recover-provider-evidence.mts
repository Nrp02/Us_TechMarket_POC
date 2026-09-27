import {writeFileSync,readFileSync} from 'node:fs';
import {db} from '../../src/lib/supabase.ts';
import {TOP_20_SYMBOLS} from '../../src/lib/symbols.ts';
import {readAllRows} from '../../src/lib/db-read.ts';
const path='.scratch/narrative-audit/recovered-evidence.json';
if(process.argv.includes('--write')) {
 const rows=JSON.parse(readFileSync(path,'utf8'));
 const {error}=await db.from('news_evidence').upsert(rows,{onConflict:'news_id'});if(error)throw new Error(error.message);
 console.log(JSON.stringify({stored:rows.length}));
} else {
 const stored=await readAllRows<{id:number;finnhub_id:number;headline:string;published_at:string}>('recover-news',(signal,start,end)=>db.from('news').select('id,finnhub_id,headline,published_at',{count:'exact'}).gte('published_at','2026-09-19T00:00:00Z').lt('published_at','2026-09-26T04:00:00Z').order('id').range(start,end).abortSignal(signal));
 const byId=new Map(stored.map(n=>[Number(n.finnhub_id),n]));
 const evidence=new Map<number,{news_id:number;source_text:string}>();
 for(const symbol of TOP_20_SYMBOLS) {
  let response;
  try {response=await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=2026-09-19&to=2026-09-25&token=${process.env.FINNHUB_API_KEY}`,{signal:AbortSignal.timeout(10000)});}catch{console.log(JSON.stringify({symbol,error:'provider fetch failed'}));continue;}
  if(!response.ok){console.log(JSON.stringify({symbol,status:response.status}));continue;}
  const articles=await response.json() as {id:number;headline:string;summary?:string;datetime:number}[];
  let matched=0;
  for(const a of articles) {
   const n=byId.get(a.id);
   if(!n || !a.summary?.trim() || a.headline!==n.headline || Date.parse(n.published_at)!==a.datetime*1000)continue;
   evidence.set(n.id,{news_id:n.id,source_text:a.summary});matched++;
  }
  console.log(JSON.stringify({symbol,matched}));
 }
 writeFileSync(path,JSON.stringify([...evidence.values()],null,2));
 console.log(JSON.stringify({recovered:evidence.size}));
}
