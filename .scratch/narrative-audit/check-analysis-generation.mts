import {readFileSync,writeFileSync} from 'node:fs';
import {generateStorySections} from '../../src/lib/story-generation.ts';
import {generateMarketStorySections} from '../../src/lib/market-story-generation.ts';
const inputs=JSON.parse(readFileSync(process.argv[4]??'.scratch/narrative-audit/reasoning-inputs-v2.json','utf8'));
const symbol=process.argv[2]??'NVDA'; const day=inputs.find((d:any)=>d.day===(process.argv[3]??'2026-09-25'));
day.market.coverage ??= {availableStocks:day.coverage.availableStocks,expectedStocks:day.coverage.expectedStocks};
let sections; try { sections=symbol==='market' ? await generateMarketStorySections(day.market) : await generateStorySections(day.stocks.find((s:any)=>s.symbol===symbol), day.market.indices.find((i:any)=>i.symbol==='XLK').changePercent,day.market.indices.find((i:any)=>i.symbol==='SPY').changePercent);
} catch (error) {
 if(error && typeof error==='object' && 'failedGeneration' in error)writeFileSync(`.scratch/narrative-audit/rejected-provider-${symbol}-${day.day}.json`,JSON.stringify(error.failedGeneration));
 if (error && typeof error==='object' && 'candidate' in error) writeFileSync(`.scratch/narrative-audit/rejected-${symbol}-${day.day}.json`,JSON.stringify(error.candidate,null,2));
 console.error(error instanceof Error?error.message:String(error)); process.exit(1);
}
writeFileSync(`.scratch/narrative-audit/accepted-${symbol}-${day.day}.json`,JSON.stringify(sections,null,2));
console.log(JSON.stringify({symbol,day:day.day,sections},null,2));
