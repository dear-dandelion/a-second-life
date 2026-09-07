import type { ReportHealthRecord as R } from './report-fields.ts';
const str=(v:unknown)=>v==null?'':String(v).trim();
const unique=(v:string[])=>[...new Set(v.filter(Boolean))];
const days=(v:R[])=>unique(v.map(r=>r.date)).length;
const period=(v:R[])=>{const d=unique(v.map(r=>r.date)).sort();return d.length===1?d[0]:`${d[0]}至${d.at(-1)}`;};
const dist=(v:R[],get:(r:R)=>unknown)=>unique(v.map(r=>str(get(r)))).map(s=>`${s}${days(v.filter(r=>str(get(r))===s))}天`).join('、');
const span=(v:number[])=>Math.min(...v)===Math.max(...v)?String(v[0]):`${Math.min(...v)}—${Math.max(...v)}`;
const numeric=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export const isTestSymptom=(s:{quote?:string})=>s.quote?.trim()==='月度聚合测试数据';
export function symptomGroup(name:string){return /潮热|出汗|盗汗/.test(name)?'vasomotor':/尿频|尿急|漏尿|尿失禁|阴道|干涩|同房|性生活/.test(name)?'genitourinary':/头晕|眩晕|头痛|心悸|心慌|疲|乏|关节|肌肉|酸痛|胸闷|气短|蚁走/.test(name)?'somatic':'otherSymptoms';}

/** Concise summaries computed from facts; full detail remains in the snapshot. */
export function summarizeReport(records:R[],key:string):string {
  const all=[...records].sort((a,b)=>a.date.localeCompare(b.date));
  if(['vasomotor','somatic','genitourinary','otherSymptoms'].includes(key)) {
    const entries=all.flatMap(r=>r.symptoms.filter(s=>!isTestSymptom(s)&&symptomGroup(s.symptom)===key).map(s=>({r,s})));
    return unique(entries.map(e=>e.s.symptom)).map(name=>{
      const es=entries.filter(e=>e.s.symptom===name),positive=es.filter(e=>e.s.occurred),negative=es.filter(e=>!e.s.occurred);
      const parts:string[]=[];
      if(positive.length){
        const rs=positive.map(e=>e.r);
        parts.push(`${period(rs)}，有${days(rs)}天记录${name}`);
        const degrees=unique(positive.map(e=>str(e.s.severity))).map(s=>`${s}度${days(positive.filter(e=>e.s.severity===s).map(e=>e.r))}天`);
        if(degrees.length)parts.push(degrees.join('、'));
        const counts=positive.map(e=>e.s.frequencyCount).filter(numeric);
        if(counts.length)parts.push(`明确次数为${span(counts)}次（未折算日频次，单位待核对）`);
        const last=positive.filter(e=>e.s.trend).at(-1);
        if(last)parts.push(`${last.r.date}自述${last.s.trend}`);
        const severe=unique(positive.filter(e=>e.s.severity==='重').map(e=>e.r.date));
        if(severe.length)parts.push(`重度记录日期：${severe.join('、')}`);
      }
      if(negative.length)parts.push(`${unique(negative.map(e=>e.r.date)).join('、')}明确记录无${name}`);
      if(positive.some(p=>negative.some(n=>n.r.date===p.r.date)))parts.push('同日有出现与否认记录，需核对');
      return parts.join('；')+'。';
    }).join('\n');
  }
  if(key==='sleep'){
    const rs=all.filter(r=>r.sleep&&Object.keys(r.sleep).some(k=>k!=='id'));if(!rs.length)return '';
    const parts=[`${period(rs)}共${days(rs)}天睡眠记录`,dist(rs,r=>r.sleep?.quality)];
    const wakes=rs.filter(r=>numeric(r.sleep?.nightWakes));
    if(wakes.length)parts.push(`${days(wakes)}天有明确夜醒次数，夜醒${span(wakes.map(r=>r.sleep!.nightWakes as number))}次`);
    const difficulties=rs.filter(r=>/难.*入睡|易醒|早醒|入睡困难|睡不着/.test(str(r.sleep?.detail)));
    if(difficulties.length)parts.push(`${days(difficulties)}天提及${unique(difficulties.map(r=>str(r.sleep?.detail))).slice(0,2).join('；')}`);
    const last=rs.at(-1)!;if(last.sleep?.bedtime||last.sleep?.wakeTime)parts.push(`${last.date}记录${last.sleep.bedtime?`就寝${last.sleep.bedtime}`:''}${last.sleep.wakeTime?`、起床${last.sleep.wakeTime}`:''}，质量${last.sleep.quality??'未填'}`);
    return parts.filter(Boolean).join('；')+'。';
  }
  if(key==='mood'){
    const rs=all.filter(r=>r.mood?.state);if(!rs.length)return '';
    const parts=[`共${days(rs)}天情绪记录：${dist(rs,r=>r.mood?.state)}`];
    const strong=rs.filter(r=>['明显','强烈'].includes(str(r.mood?.intensity)));
    if(strong.length)parts.push(`${days(strong)}天记录情绪程度明显或强烈`);
    const reasons=unique(rs.map(r=>str(r.mood?.trigger)));if(reasons.length)parts.push(`提及的相关情境：${reasons.slice(0,2).join('、')}`);
    return parts.join('；')+'。';
  }
  if(key==='exercise'){
    const rs=all.filter(r=>r.exercise?.type);if(!rs.length)return '';
    return `共${days(rs)}天运动记录：`+unique(rs.map(r=>str(r.exercise?.type))).map(name=>{
      const es=rs.filter(r=>r.exercise?.type===name), durations=unique(es.map(r=>str(r.exercise?.duration)));
      return `${name}${days(es)}天${durations.length?`，记录时长${durations.map(d=>/^\d+(\.\d+)?$/.test(d)?`${d}（单位待确认）`:d).join('、')}`:''}`;
    }).join('；')+'。';
  }
  if(key==='menstrual'){
    const rs=all.filter(r=>r.menstrual?.event);if(!rs.length)return '';
    const parts=unique(rs.map(r=>str(r.menstrual?.event))).map(event=>{const es=rs.filter(r=>r.menstrual?.event===event);return `${period(es)}有${days(es)}天记录“${event}”`;});
    const last=rs.at(-1)!;if(last.menstrual?.daysSinceLast!==undefined)parts.push(`${last.date}自述距上次${last.menstrual.daysSinceLast}天，间隔含义需核对`);
    const notes=unique(rs.map(r=>str(r.menstrual?.note)));if(notes.length)parts.push(`备注：${notes.slice(0,2).join('；')}`);
    return parts.join('；')+'。';
  }
  if(key==='weight'){
    const rs=all.filter(r=>r.weight?.direction);if(!rs.length)return '';const last=rs.at(-1)!;
    return `共${days(rs)}天体重变化记录；最近于${last.date}记录体重${last.weight!.direction}${str(last.weight!.amount)||'（变化幅度未填）'}${last.weight!.speed?`，自述变化${last.weight!.speed}`:''}。`;
  }
  if(key==='appetite'){const rs=all.filter(r=>r.appetite);return rs.length?`${period(rs)}共${days(rs)}天食欲记录：${dist(rs,r=>r.appetite)}。`:'';}
  if(key==='medicationHistory'){
    const es=all.flatMap(r=>(r.medications??[]).map(m=>({r,m})));
    return unique(es.map(e=>str(e.m.name))).map(name=>{const ms=es.filter(e=>e.m.name===name);return `${name}：${unique(ms.map(e=>str(e.m.action))).map(action=>{const entries=ms.filter(e=>str(e.m.action)===action);return `${days(entries.map(e=>e.r))}天记录${action}，最近${entries.at(-1)!.r.date}`;}).join('；')}；当前用药情况待确认。`;}).join('\n');
  }
  return '';
}
