'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, CalendarDays, Dumbbell, Droplets, HeartPulse, Moon, Pill, Plus, Save, Scale, Smile, Trash2, Utensils, UsersRound } from 'lucide-react';
import { services } from '@/lib/services';
import type { HealthCategory, HealthDraftItem, HealthRecord, HealthRecordSummary } from '@/lib/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { normalizeQuantity, quantityUnits, type QuantityKind } from '../../supabase/functions/_shared/health-units';

const shanghaiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) as HealthRecord['date'];
const emptyRecord = (date: string): HealthRecord => ({ date: date as HealthRecord['date'], symptoms: [], medications: [], lifeEvents: [] });
const numberOrUndefined = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const comparable = (value: unknown) => JSON.stringify(value ?? null);
const changedCategories = (before: HealthRecord, after: HealthRecord): HealthCategory[] => {
  const fields: Array<[HealthCategory, keyof HealthRecord]> = [
    ['symptom', 'symptoms'], ['sleep', 'sleep'], ['mood', 'mood'], ['menstrual', 'menstrual'],
    ['weight', 'weight'], ['appetite', 'appetite'], ['exercise', 'exercise'], ['diet', 'diet'],
    ['medication', 'medications'], ['lifeEvent', 'lifeEvents'], ['medicalNeed', 'medicalNeeds'], ['other', 'other'],
  ];
  return fields.filter(([, field]) => comparable(before[field]) !== comparable(after[field])).map(([category]) => category);
};
function preparedRecord(record: HealthRecord): HealthRecord {
  const next = structuredClone(record);
  next.symptoms = next.symptoms.filter(item => hasText(item.symptom));
  if (next.sleep && ![next.sleep.quality, next.sleep.bedtime, next.sleep.wakeTime, next.sleep.nightWakes, next.sleep.detail].some(value => value !== undefined && value !== '')) delete next.sleep;
  if (next.exercise && !hasText(next.exercise.type)) delete next.exercise;
  if (next.diet && !(next.diet.foods?.length || next.diet.mealsRegular !== undefined || next.diet.water || hasText(next.diet.caffeine) || hasText(next.diet.alcohol) || next.diet.smoking !== undefined)) delete next.diet;
  next.medications = (next.medications ?? []).filter(item => hasText(item.name));
  next.lifeEvents = (next.lifeEvents ?? []).filter(item => hasText(item.description));
  return next;
}
const HEALTH_TABS = [
  {id:'symptoms',label:'身体症状',Icon:Activity},
  {id:'sleep',label:'睡眠作息',Icon:Moon},
  {id:'mood',label:'情绪',Icon:Smile},
  {id:'menstrual',label:'月经出血',Icon:Droplets},
  {id:'weight',label:'体重食欲',Icon:Scale},
  {id:'exercise',label:'运动',Icon:Dumbbell},
  {id:'diet',label:'饮食饮品',Icon:Utensils},
  {id:'medication',label:'用药',Icon:Pill},
  {id:'life',label:'生活就医',Icon:UsersRound},
] as const;
type HealthTab=(typeof HEALTH_TABS)[number]['id'];

function tabCount(record:HealthRecord,tab:HealthTab){
  if(tab==='symptoms')return record.symptoms.length;
  if(tab==='sleep')return record.sleep?1:0;
  if(tab==='mood')return record.mood?1:0;
  if(tab==='menstrual')return record.menstrual?1:0;
  if(tab==='weight')return Number(Boolean(record.weight))+Number(Boolean(record.appetite));
  if(tab==='exercise')return record.exercise?1:0;
  if(tab==='diet')return record.diet?1:0;
  if(tab==='medication')return record.medications?.length??0;
  return (record.lifeEvents?.length??0)+Number(Boolean(record.medicalNeeds))+Number(Boolean(record.other));
}

function Section({title,onAdd,onClear,children}:{title:string;onAdd?:()=>void;onClear?:()=>void;children:ReactNode}){
  return <section className="record-section"><header><h3>{title}</h3><span>{onClear&&<button type="button" onClick={onClear}><Trash2/>清空</button>}{onAdd&&<button type="button" onClick={onAdd}><Plus/>再添加一条</button>}</span></header>{children}</section>;
}
function Field({label,children}:{label:string;children:ReactNode}){
  const displayLabel=label==='距上次'||label==='距上次天数'?'距上次（天）':label==='夜醒次数'?'夜醒（次）':label==='次数'?'次数（次）':label;
  return <label className="record-field"><span>{displayLabel}</span>{children}</label>
}
function QuantityInput({value,kind,onChange}:{value?:string;kind:QuantityKind;onChange:(value:string)=>void}){
  const normalized=normalizeQuantity(value,kind);
  const unit=quantityUnits[kind];
  const numeric=normalized?normalized.slice(0,-unit.length):'';
  const [input,setInput]=useState(numeric);
  const focused=useRef(false);
  useEffect(()=>{if(!focused.current)setInput(numeric)},[numeric,value]);
  return <div className="health-quantity"><div><Input aria-label={kind==='weight'?'体重变化数值':kind==='duration'?'运动时长数值':'每周运动次数'} type="text" inputMode={kind==='exerciseFrequency'?'numeric':'decimal'} value={input} placeholder="未填写" onFocus={()=>{focused.current=true}} onBlur={()=>{focused.current=false;setInput(numeric)}} onChange={e=>{const v=e.target.value;if(!(kind==='exerciseFrequency'?/^\d*$/:/^\d*(\.\d*)?$/).test(v))return;if(v!==''&&!Number.isFinite(Number(v)))return;setInput(v);onChange(v===''?'':`${Number(v)}${unit}`)}}/><span>{unit}</span></div>{normalized===null&&<small>原记录：{value}（请核对单位后重新填写）</small>}</div>;
}

export function HealthDraftItemsEditor({items,onChange,selected,onSelectedChange}:{items:HealthDraftItem[];onChange:(items:HealthDraftItem[])=>void;selected?:Record<string,boolean>;onSelectedChange?:(id:string,value:boolean)=>void}){
  const update=(index:number,data:HealthDraftItem['data'])=>onChange(items.map((item,i)=>i===index?{...item,data}:item));
  return <div className="draft-editor-list">{items.map((item,index)=>{
    const data=item.data;
    return <article className="draft-editor-item" key={item.clientItemId}>
      <div className="draft-editor-head">{selected&&<input type="checkbox" aria-label={`确认${categoryName(item.category)}`} checked={selected[item.clientItemId]??true} onChange={event=>onSelectedChange?.(item.clientItemId,event.target.checked)}/>}<b>{categoryName(item.category)}</b><small>{item.operation==='create'?'新增':item.operation==='update'?'修改':'删除'}</small><button type="button" aria-label="移除条目" onClick={()=>onChange(items.filter((_,i)=>i!==index))}><Trash2/></button></div>
      {item.operation!=='delete'&&(typeof data==='string'
        ? <Textarea aria-label={`${categoryName(item.category)}内容`} value={data} onChange={event=>update(index,event.target.value)}/>
        : <div className="draft-fields">{Object.entries(data??{}).filter(([key])=>key!=='id').map(([key,value])=>{
          const kind:QuantityKind|undefined=item.category==='weight'&&key==='amount'?'weight':item.category==='exercise'&&key==='duration'?'duration':item.category==='exercise'&&key==='frequency'?'exerciseFrequency':undefined;
          return <Field key={key} label={fieldName(key)}>{kind?<QuantityInput kind={kind} value={primitiveText(value)} onChange={v=>update(index,{...(data as Record<string,unknown>),[key]:v})}/>:<Input value={primitiveText(value)} onChange={event=>update(index,{...(data as Record<string,unknown>),[key]:coerceValue(key,event.target.value)})}/>}</Field>
        })}</div>)}
      {item.quote&&<p className="draft-quote">原话：{item.quote}</p>}
    </article>;
  })}</div>;
}

function coerceValue(key:string,value:string):unknown{
  if(['occurred','mealsRegular','smoking'].includes(key))return value==='true'||value==='是';
  if(['frequencyCount','nightWakes','daysSinceLast'].includes(key))return numberOrUndefined(value);
  return value;
}
function primitiveText(value:unknown):string{return typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):''}
const FIELD_NAMES:Record<string,string>={symptom:'症状',occurred:'是否发生',severity:'程度',frequency:'频率',frequencyCount:'次数',trend:'趋势',trigger:'诱因',quality:'质量',bedtime:'入睡',wakeTime:'起床',nightWakes:'夜醒次数',detail:'详情',type:'类型',description:'描述',event:'事件',date:'日期',daysSinceLast:'距上次天数',note:'备注',direction:'方向',amount:'变化量',speed:'速度',duration:'时长',intensity:'强度',name:'名称',action:'动作',category:'类别',impact:'影响'};
const CATEGORY_NAMES:Record<string,string>={symptom:'身体症状',sleep:'睡眠与作息',mood:'情绪',menstrual:'月经与出血',weight:'体重',appetite:'食欲',exercise:'运动',diet:'饮食与饮品',medication:'用药提及',lifeEvent:'生活事件',medicalNeed:'就医诉求',other:'其他'};
const fieldName=(key:string)=>FIELD_NAMES[key]??key;
const categoryName=(key:string)=>CATEGORY_NAMES[key]??key;

export default function HealthRecordEditor({initialDate,onBack}:{initialDate?:string;onBack:()=>void}){
  const [date,setDate]=useState(initialDate??shanghaiToday());
  const [record,setRecord]=useState<HealthRecord>(()=>emptyRecord(initialDate??shanghaiToday()));
  const [activeTab,setActiveTab]=useState<HealthTab>('symptoms');
  const [dates,setDates]=useState<HealthRecordSummary[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const panelRef=useRef<HTMLDivElement>(null);
  const savedRecordRef=useRef<HealthRecord>(emptyRecord(initialDate??shanghaiToday()));
  const tabsRef=useRef<HTMLElement>(null);
  const sectionRefs=useRef(new Map<HealthTab,HTMLDivElement>());
  const navigationLockRef=useRef(false);
  const navigationTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const today=useMemo(()=>shanghaiToday(),[]);

  useEffect(()=>{services.healthRecords.list().then(setDates).catch(()=>setDates([]))},[]);
  useEffect(()=>{let active=true;services.healthRecords.get(date).then(value=>{if(active){const next=value??emptyRecord(date);savedRecordRef.current=structuredClone(next);setRecord(next);setActiveTab(HEALTH_TABS.find(tab=>tabCount(next,tab.id)>0)?.id??'symptoms')}}).catch(()=>{if(active){toast.add({title:'无法读取健康记录',type:'error'});const next=emptyRecord(date);savedRecordRef.current=structuredClone(next);setRecord(next);setActiveTab('symptoms')}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[date]);
  useEffect(()=>{const rail=tabsRef.current;const button=rail?.querySelector<HTMLButtonElement>(`button[data-health-tab="${activeTab}"]`);if(rail&&button)rail.scrollTo({left:button.offsetLeft-(rail.clientWidth-button.offsetWidth)/2,behavior:'smooth'})},[activeTab]);
  useEffect(()=>{const root=panelRef.current;if(!root)return;const observer=new IntersectionObserver(entries=>{if(navigationLockRef.current)return;const current=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];const tab=current?.target.getAttribute('data-health-tab') as HealthTab|undefined;if(tab)setActiveTab(tab)},{root,rootMargin:'-8% 0px -64% 0px',threshold:[0.1,.35,.6]});sectionRefs.current.forEach(section=>observer.observe(section));return()=>observer.disconnect()},[loading]);
  useEffect(()=>()=>{if(navigationTimerRef.current)clearTimeout(navigationTimerRef.current)},[]);
  const changeDate=(value:string)=>{if(!value||value>today)return;setLoading(true);setDate(value)};
  const changeTab=(next:HealthTab)=>{navigationLockRef.current=true;if(navigationTimerRef.current)clearTimeout(navigationTimerRef.current);setActiveTab(next);sectionRefs.current.get(next)?.scrollIntoView({behavior:'smooth',block:'start'});navigationTimerRef.current=setTimeout(()=>{navigationLockRef.current=false},650)};
  const setSectionRef=(tab:HealthTab)=>(node:HTMLDivElement|null)=>{if(node)sectionRefs.current.set(tab,node);else sectionRefs.current.delete(tab)};
  const updateSymptom=(index:number,patch:Partial<HealthRecord['symptoms'][number]>)=>{const symptoms=record.symptoms.length?record.symptoms:[{symptom:'',occurred:true,quote:'用户手动填写'}];setRecord({...record,symptoms:symptoms.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item)})};
  const updateMedication=(index:number,patch:Partial<NonNullable<HealthRecord['medications']>[number]>)=>{const medications=record.medications?.length?record.medications:[{name:'',action:'服用' as const}];setRecord({...record,medications:medications.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item)})};
  const updateLifeEvent=(index:number,patch:Partial<NonNullable<HealthRecord['lifeEvents']>[number]>)=>{const lifeEvents=record.lifeEvents?.length?record.lifeEvents:[{category:'家庭' as const,description:'',impact:'中性' as const}];setRecord({...record,lifeEvents:lifeEvents.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item)})};
  const save=async()=>{const next=preparedRecord({...record,date:date as HealthRecord['date']});const categories=changedCategories(savedRecordRef.current,next);if(!categories.length){toast.add({title:'没有需要保存的修改'});return}setSaving(true);try{const result=await services.healthRecords.save(date,next,savedRecordRef.current.version??0,categories);const saved={...next,id:result.recordId||next.id,version:result.version};savedRecordRef.current=structuredClone(saved);setRecord(saved);setDates(await services.healthRecords.list());toast.add({title:'健康记录已保存',type:'success'})}catch(error){if(error instanceof Error&&error.message.includes('RECORD_VERSION_CONFLICT')){toast.add({title:'记录已在别处更新',description:'请重新打开该日期后再保存你的修改。',type:'error'})}else toast.add({title:'保存失败，请检查填写内容',type:'error'})}finally{setSaving(false)}};

  if(loading)return <div className="record-loading">正在读取健康记录…</div>;
  const populatedTabs=HEALTH_TABS.filter(tab=>tabCount(record,tab.id)>0).length;
  return <div className="record-editor">
    <div className="record-sticky-tools"><div className="record-datebar"><CalendarDays/><label htmlFor="health-record-date"><span>记录日期</span><Input id="health-record-date" type="date" max={today} value={date} onChange={event=>changeDate(event.target.value)}/></label><select aria-label="选择已有记录" value={dates.some(item=>item.date===date)?date:''} onChange={event=>changeDate(event.target.value)}><option value="">历史记录</option>{dates.map(item=><option value={item.date} key={item.date}>{item.date}</option>)}</select></div><nav className="record-tabs" aria-label="健康记录分类" ref={tabsRef}>{HEALTH_TABS.map(({id,label,Icon})=>{const count=tabCount(record,id);return <button type="button" data-health-tab={id} className={activeTab===id?'active':''} aria-current={activeTab===id?'page':undefined} onClick={()=>changeTab(id)} key={id}><span><Icon/>{count>0&&<i>{count}</i>}</span><small>{label}</small></button>})}</nav></div>
    <section className="record-sync-strip"><HeartPulse/><span><b>{date===today?'今日健康卡片':`${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日健康卡片`}</b><small>{populatedTabs>0?`已记录 ${populatedTabs} 个分类 · AI 对话自动同步`:'对话中识别到的健康信息会自动同步'}</small></span></section>

    <div className="record-tab-panel" ref={panelRef}>
    <div className="record-dimension" data-health-tab="symptoms" ref={setSectionRef('symptoms')}><Section title="身体症状" onAdd={record.symptoms.length?()=>setRecord({...record,symptoms:[...record.symptoms,{symptom:'',occurred:true,quote:'用户手动填写'}]}):undefined} onClear={record.symptoms.length?()=>setRecord({...record,symptoms:[]}):undefined}>
      {(record.symptoms.length?record.symptoms:[{symptom:'',occurred:true,quote:'用户手动填写'}]).map((item,index)=><div className="record-card" key={item.id??index}>
        {record.symptoms.length>0&&<button className="remove-row" type="button" aria-label="删除症状" onClick={()=>setRecord({...record,symptoms:record.symptoms.filter((_,i)=>i!==index)})}><Trash2/></button>}
        <Field label="症状"><Input placeholder="如：潮热、头痛" value={item.symptom} onChange={e=>updateSymptom(index,{symptom:e.target.value})}/></Field>
        <div className="record-grid"><Field label="发生"><select value={String(item.occurred)} onChange={e=>updateSymptom(index,{occurred:e.target.value==='true'})}><option value="true">是</option><option value="false">否</option></select></Field><Field label="程度"><select value={item.severity??''} onChange={e=>updateSymptom(index,{severity:(e.target.value||undefined) as typeof item.severity})}><option value="">未填写</option>{['轻','中','重'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="次数（次）"><Input type="number" min="0" value={item.frequencyCount??''} onChange={e=>updateSymptom(index,{frequencyCount:numberOrUndefined(e.target.value)})}/></Field><Field label="趋势"><select value={item.trend??''} onChange={e=>updateSymptom(index,{trend:(e.target.value||undefined) as typeof item.trend})}><option value="">未填写</option>{['加重','减轻','稳定'].map(x=><option key={x}>{x}</option>)}</select></Field></div>
        <div className="record-grid"><Field label="频率描述"><Input placeholder="如：偶尔、每晚" value={item.frequency??''} onChange={e=>updateSymptom(index,{frequency:e.target.value})}/></Field><Field label="诱因"><Input value={item.trigger??''} onChange={e=>updateSymptom(index,{trigger:e.target.value})}/></Field></div>
        <Field label="原始描述"><Textarea value={item.quote??''} onChange={e=>updateSymptom(index,{quote:e.target.value})}/></Field>
      </div>)}
    </Section></div>

    <div className="record-dimension" data-health-tab="sleep" ref={setSectionRef('sleep')}><Section title="睡眠与作息" onClear={record.sleep?()=>setRecord({...record,sleep:undefined}):undefined}>
      <div className="record-card"><div className="record-grid"><Field label="质量"><select value={record.sleep?.quality??''} onChange={e=>setRecord({...record,sleep:{...record.sleep,quality:(e.target.value||undefined) as NonNullable<HealthRecord['sleep']>['quality']}})}><option value="">请选择</option>{['好','一般','差'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="夜醒（次）"><Input type="number" min="0" placeholder="可选填" value={record.sleep?.nightWakes??''} onChange={e=>setRecord({...record,sleep:{...record.sleep,nightWakes:numberOrUndefined(e.target.value)}})}/></Field><Field label="入睡"><Input type="time" value={record.sleep?.bedtime??''} onChange={e=>setRecord({...record,sleep:{...record.sleep,bedtime:e.target.value}})}/></Field><Field label="起床"><Input type="time" value={record.sleep?.wakeTime??''} onChange={e=>setRecord({...record,sleep:{...record.sleep,wakeTime:e.target.value}})}/></Field></div><Field label="详情"><Textarea placeholder="可选填" value={record.sleep?.detail??''} onChange={e=>setRecord({...record,sleep:{...record.sleep,detail:e.target.value}})}/></Field></div>
    </Section></div>

    <div className="record-dimension" data-health-tab="mood" ref={setSectionRef('mood')}><Section title="情绪" onClear={record.mood?()=>setRecord({...record,mood:undefined}):undefined}>
      <div className="record-card mood-record-card"><Field label="情绪状态"><div className="mood-state-options">{(['舒展','平静','低落','焦虑','烦躁','复杂'] as const).map(state=><button type="button" key={state} className={record.mood?.state===state?'active':''} onClick={()=>setRecord({...record,mood:{...record.mood,state,source:'manual'}})}>{state==='复杂'?'说不清':state}</button>)}</div></Field>{record.mood&&<div className="mood-more"><div className="record-grid"><Field label="感受强度"><select value={record.mood.intensity??''} onChange={e=>setRecord({...record,mood:{...record.mood!,intensity:(e.target.value||undefined) as typeof record.mood.intensity}})}><option value="">可选填</option><option>轻微</option><option>明显</option><option>强烈</option></select></Field><Field label="想写几句"><Input placeholder="可选填" value={record.mood.description??''} onChange={e=>setRecord({...record,mood:{...record.mood!,description:e.target.value}})}/></Field></div><Field label="诱因"><Input placeholder="可选填" value={record.mood.trigger??''} onChange={e=>setRecord({...record,mood:{...record.mood!,trigger:e.target.value}})}/></Field></div>}</div>
    </Section></div>

    <div className="record-dimension" data-health-tab="menstrual" ref={setSectionRef('menstrual')}><Section title="月经与出血" onClear={record.menstrual?()=>setRecord({...record,menstrual:undefined}):undefined}>
      <div className="record-card"><div className="record-grid"><Field label="事件"><select value={record.menstrual?.event??''} onChange={e=>setRecord({...record,menstrual:{...record.menstrual,event:e.target.value as NonNullable<HealthRecord['menstrual']>['event']}})}><option value="">请选择</option>{['来了','没来','量多','量少','淋漓不尽','非经期出血','痛经','停经'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="距上次"><Input type="number" min="0" placeholder="可选填" value={record.menstrual?.daysSinceLast??''} onChange={e=>setRecord({...record,menstrual:{...record.menstrual,event:record.menstrual?.event??'来了',daysSinceLast:numberOrUndefined(e.target.value)}})}/></Field></div><Field label="备注"><Input placeholder="可选填" value={record.menstrual?.note??''} onChange={e=>setRecord({...record,menstrual:{...record.menstrual,event:record.menstrual?.event??'来了',note:e.target.value}})}/></Field></div>
    </Section></div>

    <div className="record-dimension" data-health-tab="weight" ref={setSectionRef('weight')}><Section title="体重与食欲" onClear={record.weight||record.appetite?()=>setRecord({...record,weight:undefined,appetite:undefined}):undefined}>
      <div className="record-card"><div className="record-grid"><Field label="体重方向"><select value={record.weight?.direction??''} onChange={e=>setRecord({...record,weight:{...record.weight,direction:e.target.value as '增加'|'减少'}})}><option value="">请选择</option><option>增加</option><option>减少</option></select></Field><Field label="变化量"><QuantityInput kind="weight" value={record.weight?.amount??''} onChange={value=>setRecord({...record,weight:{...record.weight,direction:record.weight?.direction??'增加',amount:value}})}/></Field><Field label="速度"><select value={record.weight?.speed??''} onChange={e=>setRecord({...record,weight:{...record.weight,direction:record.weight?.direction??'增加',speed:(e.target.value||undefined) as '突然'|'缓慢'|undefined}})}><option value="">可选填</option><option>突然</option><option>缓慢</option></select></Field><Field label="食欲"><select value={record.appetite??''} onChange={e=>setRecord({...record,appetite:(e.target.value||undefined) as HealthRecord['appetite']})}><option value="">请选择</option>{['增加','减少','正常'].map(x=><option key={x}>{x}</option>)}</select></Field></div></div>
    </Section></div>

    <div className="record-dimension" data-health-tab="exercise" ref={setSectionRef('exercise')}><Section title="运动" onClear={record.exercise?()=>setRecord({...record,exercise:undefined}):undefined}>
      <div className="record-card record-grid"><Field label="类型"><Input placeholder="如：散步、瑜伽" value={record.exercise?.type??''} onChange={e=>setRecord({...record,exercise:{...record.exercise,type:e.target.value}})}/></Field><Field label="时长"><QuantityInput kind="duration" value={record.exercise?.duration??''} onChange={value=>setRecord({...record,exercise:{...record.exercise,type:record.exercise?.type??'',duration:value}})}/></Field><Field label="频率"><QuantityInput kind="exerciseFrequency" value={record.exercise?.frequency??''} onChange={value=>setRecord({...record,exercise:{...record.exercise,type:record.exercise?.type??'',frequency:value}})}/></Field><Field label="强度"><select value={record.exercise?.intensity??''} onChange={e=>setRecord({...record,exercise:{...record.exercise,type:record.exercise?.type??'',intensity:(e.target.value||undefined) as NonNullable<HealthRecord['exercise']>['intensity']}})}><option value="">可选填</option>{['轻松','适中','累'].map(x=><option key={x}>{x}</option>)}</select></Field></div>
    </Section></div>

    <div className="record-dimension" data-health-tab="diet" ref={setSectionRef('diet')}><Section title="饮食与饮品" onClear={record.diet?()=>setRecord({...record,diet:undefined}):undefined}>
      <div className="record-card"><Field label="食物（顿号分隔）"><Input placeholder="如：牛奶、水果（可选填）" value={(record.diet?.foods??[]).join('、')} onChange={e=>setRecord({...record,diet:{...record.diet,foods:e.target.value.split(/[、,，]/).map(x=>x.trim()).filter(Boolean)}})}/></Field><div className="record-grid"><Field label="规律用餐"><select value={record.diet?.mealsRegular===undefined?'':String(record.diet.mealsRegular)} onChange={e=>setRecord({...record,diet:{...record.diet,mealsRegular:e.target.value===''?undefined:e.target.value==='true'}})}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select></Field><Field label="饮水"><select value={record.diet?.water??''} onChange={e=>setRecord({...record,diet:{...record.diet,water:(e.target.value||undefined) as '充足'|'偏少'|undefined}})}><option value="">请选择</option><option>充足</option><option>偏少</option></select></Field><Field label="咖啡因"><Input placeholder="可选填" value={record.diet?.caffeine??''} onChange={e=>setRecord({...record,diet:{...record.diet,caffeine:e.target.value}})}/></Field><Field label="酒精"><Input placeholder="可选填" value={record.diet?.alcohol??''} onChange={e=>setRecord({...record,diet:{...record.diet,alcohol:e.target.value}})}/></Field><Field label="吸烟"><select value={record.diet?.smoking===undefined?'':String(record.diet.smoking)} onChange={e=>setRecord({...record,diet:{...record.diet,smoking:e.target.value===''?undefined:e.target.value==='true'}})}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select></Field></div></div>
    </Section></div>

    <div className="record-dimension" data-health-tab="medication" ref={setSectionRef('medication')}><Section title="用药提及" onAdd={(record.medications?.length??0)>0?()=>setRecord({...record,medications:[...(record.medications??[]),{name:'',action:'服用'}]}):undefined} onClear={(record.medications?.length??0)>0?()=>setRecord({...record,medications:[]}):undefined}>{(record.medications?.length?record.medications:[{name:'',action:'服用' as const}]).map((item,index)=><div className="record-card record-array-row" key={item.id??index}><Field label="药物"><Input placeholder="药物名称" value={item.name} onChange={e=>updateMedication(index,{name:e.target.value})}/></Field><Field label="动作"><select value={item.action} onChange={e=>updateMedication(index,{action:e.target.value as typeof item.action})}><option>服用</option><option>漏服</option><option>停用</option></select></Field>{record.medications?.length?<button type="button" aria-label="删除用药" onClick={()=>setRecord({...record,medications:record.medications!.filter((_,i)=>i!==index)})}><Trash2/></button>:<span/>}</div>)}</Section></div>

    <div className="record-dimension" data-health-tab="life" ref={setSectionRef('life')}><Section title="生活事件" onAdd={(record.lifeEvents?.length??0)>0?()=>setRecord({...record,lifeEvents:[...(record.lifeEvents??[]),{category:'家庭',description:'',impact:'中性'}]}):undefined} onClear={(record.lifeEvents?.length??0)>0?()=>setRecord({...record,lifeEvents:[]}):undefined}>{(record.lifeEvents?.length?record.lifeEvents:[{category:'家庭' as const,description:'',impact:'中性' as const}]).map((item,index)=><div className="record-card record-array-row" key={item.id??index}><Field label="类别"><select value={item.category} onChange={e=>updateLifeEvent(index,{category:e.target.value as typeof item.category})}><option>家庭</option><option>社交</option><option>心情事件</option></select></Field><Field label="事件"><Input placeholder="发生了什么" value={item.description} onChange={e=>updateLifeEvent(index,{description:e.target.value})}/></Field><Field label="影响"><select value={item.impact} onChange={e=>updateLifeEvent(index,{impact:e.target.value as typeof item.impact})}><option>正面</option><option>负面</option><option>中性</option></select></Field>{record.lifeEvents?.length?<button type="button" aria-label="删除事件" onClick={()=>setRecord({...record,lifeEvents:record.lifeEvents!.filter((_,i)=>i!==index)})}><Trash2/></button>:<span/>}</div>)}</Section>

    <Section title="就医诉求与其他"><div className="record-card"><Field label="想解决的问题"><Textarea value={record.medicalNeeds??''} onChange={e=>setRecord({...record,medicalNeeds:e.target.value})}/></Field><Field label="其他记录"><Textarea value={record.other??''} onChange={e=>setRecord({...record,other:e.target.value})}/></Field></div></Section></div>
    </div>
    <div className="record-actions"><Button variant="outline" onClick={onBack}>返回对话</Button><Button onClick={save} disabled={saving}><Save/>{saving?'保存中…':'保存记录'}</Button></div>
  </div>;
}
