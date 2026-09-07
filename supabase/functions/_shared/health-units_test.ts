import {normalizeQuantity} from './health-units.ts';
import {applyDraftItems} from './health.ts';
function equal(a:unknown,b:unknown){if(a!==b)throw new Error(`${a} != ${b}`);}
Deno.test('明确单位统一换算为kg和分钟',()=>{
 equal(normalizeQuantity('4斤','weight'),'2kg');equal(normalizeQuantity('500克','weight'),'0.5kg');
 equal(normalizeQuantity('1.5小时','duration'),'90分钟');equal(normalizeQuantity('30 min','duration'),'30分钟');
 equal(normalizeQuantity('每周3次','exerciseFrequency'),'3次/周');
 equal(normalizeQuantity('0分钟','duration'),'0分钟');
});
Deno.test('AI 写入转换明确单位，拒绝无单位数据',()=>{
 const item={clientItemId:'unit-test',category:'exercise' as const,operation:'create' as const,quote:'运动一小时',confidence:1,data:{type:'散步',duration:'1小时'}};
 equal(applyDraftItems(null,'2026-09-07',[item]).exercise?.duration,'60分钟');
 let rejected=false;
 try{applyDraftItems(null,'2026-09-07',[{...item,data:{type:'散步',duration:'20'}}]);}catch{rejected=true}
 equal(rejected,true);
 equal(applyDraftItems(null,'2026-09-07',[{...item,operation:'delete',data:{type:'散步',duration:'20'}}]).exercise,undefined);
});
Deno.test('单位不明和范围不猜测，不接受负数或自定义单位',()=>{
 for(const input of ['20','半小时','2-3小时','-1分钟','10英尺','Infinity分钟'])equal(normalizeQuantity(input,'duration'),null);
 equal(normalizeQuantity('本周2–3次','exerciseFrequency'),null);
 equal(normalizeQuantity('','weight'),'');
});
