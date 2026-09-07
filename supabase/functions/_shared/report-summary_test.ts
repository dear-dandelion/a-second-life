import {buildReportFields, type ReportHealthRecord as R} from './report-fields.ts';
function assert(v:unknown){if(!v)throw new Error('Assertion failed');}
Deno.test('20天睡眠压缩且保留质量分布和最近作息',()=>{
 const records:R[]=Array.from({length:20},(_,i)=>({date:`2026-08-${String(i+1).padStart(2,'0')}`,symptoms:[],sleep:{quality:i<13?'好':i<16?'一般':'差',nightWakes:i<13?0:3,...(i===19?{bedtime:'03:49',wakeTime:'12:00'}:{})}}));
 const field=buildReportFields(records).sleep;
 assert(field.text.includes('好13天')&&field.text.includes('一般3天')&&field.text.includes('差4天'));
 assert(field.text.includes('03:49')&&field.text.length<220);
 assert(field.details?.split('\n').length===20);
});
Deno.test('7天潮热统计程度、次数范围与最近自述，重复不增加天数',()=>{
 const records:R[]=Array.from({length:7},(_,i)=>({date:`2026-08-${String(i+1).padStart(2,'0')}`,symptoms:[{symptom:'潮热',occurred:true,severity:i<4?'轻':'中',frequencyCount:i%3+1,trend:i===6?'减轻':'稳定'}]}));
 records[0].symptoms.push({...records[0].symptoms[0]});
 const f=buildReportFields(records).vasomotor;
 assert(f.text.includes('7天记录潮热')&&f.text.includes('轻度4天、中度3天')&&f.text.includes('1—3次'));
 assert(f.text.includes('2026-08-07自述减轻'));
});
Deno.test('测试标记不作为真实症状、无单位跑步不变成分钟、月经间隔需核对',()=>{
 const fields=buildReportFields([{date:'2026-09-06',symptoms:[{symptom:'潮热',occurred:true,quote:'月度聚合测试数据'}],exercise:{type:'跑步',duration:'20'},menstrual:{event:'来了',daysSinceLast:2}}]);
 assert(fields.vasomotor.text===''&&fields.vasomotor.notice&&fields.vasomotor.details?.includes('测试数据'));
 assert(fields.exercise.text.includes('20（单位待确认）')&&!fields.exercise.text.includes('20分钟'));
 assert(fields.menstrual.text.includes('含义需核对'));
});
