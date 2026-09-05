'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, CalendarDays, Dumbbell, Droplets, HeartPulse, Moon, Pill, Plus, Save, Scale, Smile, Trash2, Utensils, UsersRound } from 'lucide-react';
import { services } from '@/lib/services';
import type { HealthDraftItem, HealthRecord, HealthRecordSummary } from '@/lib/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

const shanghaiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) as HealthRecord['date'];
const emptyRecord = (date: string): HealthRecord => ({ date: date as HealthRecord['date'], symptoms: [], medications: [], lifeEvents: [] });
const numberOrUndefined = (value: string) => value === '' ? undefined : Number(value);
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
  return <section className="record-section"><header><h3>{title}</h3><span>{onClear&&<button type="button" onClick={onClear}><Trash2/>清空</button>}{onAdd&&<button type="button" onClick={onAdd}><Plus/>添加</button>}</span></header>{children}</section>;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="record-field"><span>{label}</span>{children}</label>}

export function HealthDraftItemsEditor({items,onChange,selected,onSelectedChange}:{items:HealthDraftItem[];onChange:(items:HealthDraftItem[])=>void;selected?:Record<string,boolean>;onSelectedChange?:(id:string,value:boolean)=>void}){
  const update=(index:number,data:HealthDraftItem['data'])=>onChange(items.map((item,i)=>i===index?{...item,data}:item));
  return <div className="draft-editor-list">{items.map((item,index)=>{
    const data=item.data;
    return <article className="draft-editor-item" key={item.clientItemId}>
      <div className="draft-editor-head">{selected&&<input type="checkbox" aria-label={`确认${categoryName(item.category)}`} checked={selected[item.clientItemId]??true} onChange={event=>onSelectedChange?.(item.clientItemId,event.target.checked)}/>}<b>{categoryName(item.category)}</b><small>{item.operation==='create'?'新增':item.operation==='update'?'修改':'删除'}</small><button type="button" aria-label="移除条目" onClick={()=>onChange(items.filter((_,i)=>i!==index))}><Trash2/></button></div>
      {item.operation!=='delete'&&(typeof data==='string'
        ? <Textarea aria-label={`${categoryName(item.category)}内容`} value={data} onChange={event=>update(index,event.target.value)}/>
        : <div className="draft-fields">{Object.entries(data??{}).filter(([key])=>key!=='id').map(([key,value])=><Field key={key} label={fieldName(key)}><Input value={primitiveText(value)} onChange={event=>update(index,{...(data as Record<string,unknown>),[key]:coerceValue(key,event.target.value)})}/></Field>)}</div>)}
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
  const tabsRef=useRef<HTMLElement>(null);
  const today=useMemo(()=>shanghaiToday(),[]);

  useEffect(()=>{services.healthRecords.list().then(setDates).catch(()=>setDates([]))},[]);
  useEffect(()=>{let active=true;services.healthRecords.get(date).then(value=>{if(active){const next=value??emptyRecord(date);setRecord(next);setActiveTab(HEALTH_TABS.find(tab=>tabCount(next,tab.id)>0)?.id??'symptoms')}}).catch(()=>{if(active){toast.add({title:'无法读取健康记录',type:'error'});setRecord(emptyRecord(date));setActiveTab('symptoms')}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[date]);
  useEffect(()=>{panelRef.current?.scrollTo({top:0,behavior:'auto'})},[activeTab]);
  const changeDate=(value:string)=>{if(!value||value>today)return;setLoading(true);setDate(value)};
  const changeTab=(next:HealthTab,button:HTMLButtonElement)=>{setActiveTab(next);const rail=tabsRef.current;if(rail)rail.scrollTo({left:button.offsetLeft-(rail.clientWidth-button.offsetWidth)/2,behavior:'smooth'})};
  const save=async()=>{setSaving(true);try{await services.healthRecords.save(date,{...record,date:date as HealthRecord['date']});setDates(await services.healthRecords.list());toast.add({title:'健康记录已保存',type:'success'})}catch{toast.add({title:'保存失败，请检查填写内容',type:'error'})}finally{setSaving(false)}};

  if(loading)return <div className="record-loading">正在读取健康记录…</div>;
  const populatedTabs=HEALTH_TABS.filter(tab=>tabCount(record,tab.id)>0).length;
  return <div className="record-editor">
    <div className="record-sticky-tools"><div className="record-datebar"><CalendarDays/><label htmlFor="health-record-date"><span>记录日期</span><Input id="health-record-date" type="date" max={today} value={date} onChange={event=>changeDate(event.target.value)}/></label><select aria-label="选择已有记录" value={dates.some(item=>item.date===date)?date:''} onChange={event=>changeDate(event.target.value)}><option value="">历史记录</option>{dates.map(item=><option value={item.date} key={item.date}>{item.date}</option>)}</select></div><nav className="record-tabs" aria-label="健康记录分类" ref={tabsRef}>{HEALTH_TABS.map(({id,label,Icon})=>{const count=tabCount(record,id);return <button type="button" className={activeTab===id?'active':''} aria-current={activeTab===id?'page':undefined} onClick={event=>changeTab(id,event.currentTarget)} key={id}><span><Icon/>{count>0&&<i>{count}</i>}</span><small>{label}</small></button>})}</nav></div>
    <section className="record-sync-strip"><HeartPulse/><span><b>{date===today?'今日健康卡片':`${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日健康卡片`}</b><small>{populatedTabs>0?`已记录 ${populatedTabs} 个分类 · AI 对话自动同步`:'对话中识别到的健康信息会自动同步'}</small></span></section>

    <div className="record-tab-panel" ref={panelRef}>
    {activeTab==='symptoms'&&<Section title="身体症状" onAdd={()=>setRecord({...record,symptoms:[...record.symptoms,{symptom:'',occurred:true,quote:'用户手动填写'}]})}>
      {record.symptoms.length===0?<p className="record-empty">暂无记录</p>:record.symptoms.map((item,index)=><div className="record-card" key={item.id??index}>
        <button className="remove-row" type="button" aria-label="删除症状" onClick={()=>setRecord({...record,symptoms:record.symptoms.filter((_,i)=>i!==index)})}><Trash2/></button>
        <Field label="症状"><Input value={item.symptom} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,symptom:e.target.value}:v)})}/></Field>
        <div className="record-grid"><Field label="发生"><select value={String(item.occurred)} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,occurred:e.target.value==='true'}:v)})}><option value="true">是</option><option value="false">否</option></select></Field><Field label="程度"><select value={item.severity??''} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,severity:(e.target.value||undefined) as typeof v.severity}:v)})}><option value="">未填写</option>{['轻','中','重'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="次数"><Input type="number" min="0" value={item.frequencyCount??''} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,frequencyCount:numberOrUndefined(e.target.value)}:v)})}/></Field><Field label="趋势"><select value={item.trend??''} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,trend:(e.target.value||undefined) as typeof v.trend}:v)})}><option value="">未填写</option>{['加重','减轻','稳定'].map(x=><option key={x}>{x}</option>)}</select></Field></div>
        <div className="record-grid"><Field label="频率描述"><Input placeholder="如：偶尔、每晚" value={item.frequency??''} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,frequency:e.target.value}:v)})}/></Field><Field label="诱因"><Input value={item.trigger??''} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,trigger:e.target.value}:v)})}/></Field></div>
        <Field label="原始描述"><Textarea value={item.quote??''} onChange={e=>setRecord({...record,symptoms:record.symptoms.map((v,i)=>i===index?{...v,quote:e.target.value}:v)})}/></Field>
      </div>)}
    </Section>}

    {activeTab==='sleep'&&<Section title="睡眠与作息" onClear={record.sleep?()=>setRecord({...record,sleep:undefined}):undefined} onAdd={!record.sleep?()=>setRecord({...record,sleep:{quality:'一般'}}):undefined}>
      {!record.sleep?<p className="record-empty">暂无记录</p>:<div className="record-card"><div className="record-grid"><Field label="质量"><select value={record.sleep.quality??''} onChange={e=>setRecord({...record,sleep:{...record.sleep!,quality:(e.target.value||undefined) as NonNullable<HealthRecord['sleep']>['quality']}})}><option value="">未填写</option>{['好','一般','差'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="夜醒次数"><Input type="number" min="0" value={record.sleep.nightWakes??''} onChange={e=>setRecord({...record,sleep:{...record.sleep!,nightWakes:numberOrUndefined(e.target.value)}})}/></Field><Field label="入睡"><Input type="time" value={record.sleep.bedtime??''} onChange={e=>setRecord({...record,sleep:{...record.sleep!,bedtime:e.target.value}})}/></Field><Field label="起床"><Input type="time" value={record.sleep.wakeTime??''} onChange={e=>setRecord({...record,sleep:{...record.sleep!,wakeTime:e.target.value}})}/></Field></div><Field label="详情"><Textarea value={record.sleep.detail??''} onChange={e=>setRecord({...record,sleep:{...record.sleep!,detail:e.target.value}})}/></Field></div>}
    </Section>}

    {activeTab==='mood'&&<Section title="情绪" onClear={record.mood?()=>setRecord({...record,mood:undefined}):undefined} onAdd={!record.mood?()=>setRecord({...record,mood:{type:'正面',description:''}}):undefined}>
      {!record.mood?<p className="record-empty">暂无记录</p>:<div className="record-card"><div className="record-grid"><Field label="类型"><select value={record.mood.type} onChange={e=>setRecord({...record,mood:{...record.mood!,type:e.target.value as '正面'|'负面'}})}><option>正面</option><option>负面</option></select></Field><Field label="描述"><Input value={record.mood.description} onChange={e=>setRecord({...record,mood:{...record.mood!,description:e.target.value}})}/></Field></div><Field label="诱因"><Input value={record.mood.trigger??''} onChange={e=>setRecord({...record,mood:{...record.mood!,trigger:e.target.value}})}/></Field></div>}
    </Section>}

    {activeTab==='menstrual'&&<Section title="月经与出血" onClear={record.menstrual?()=>setRecord({...record,menstrual:undefined}):undefined} onAdd={!record.menstrual?()=>setRecord({...record,menstrual:{event:'来了',date}}):undefined}>
      {!record.menstrual?<p className="record-empty">暂无记录</p>:<div className="record-card"><div className="record-grid"><Field label="事件"><select value={record.menstrual.event} onChange={e=>setRecord({...record,menstrual:{...record.menstrual!,event:e.target.value as NonNullable<HealthRecord['menstrual']>['event']}})}>{['来了','没来','量多','量少','淋漓不尽','非经期出血','痛经','停经'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="日期"><Input type="date" value={record.menstrual.date??''} onChange={e=>setRecord({...record,menstrual:{...record.menstrual!,date:e.target.value}})}/></Field><Field label="距上次"><Input type="number" min="0" value={record.menstrual.daysSinceLast??''} onChange={e=>setRecord({...record,menstrual:{...record.menstrual!,daysSinceLast:numberOrUndefined(e.target.value)}})}/></Field></div><Field label="备注"><Input value={record.menstrual.note??''} onChange={e=>setRecord({...record,menstrual:{...record.menstrual!,note:e.target.value}})}/></Field></div>}
    </Section>}

    {activeTab==='weight'&&<Section title="体重与食欲" onClear={record.weight||record.appetite?()=>setRecord({...record,weight:undefined,appetite:undefined}):undefined} onAdd={!record.weight?()=>setRecord({...record,weight:{direction:'增加',date}}):undefined}>
      <div className="record-card"><div className="record-grid">{record.weight&&<><Field label="方向"><select value={record.weight.direction} onChange={e=>setRecord({...record,weight:{...record.weight!,direction:e.target.value as '增加'|'减少'}})}><option>增加</option><option>减少</option></select></Field><Field label="变化量"><Input value={record.weight.amount??''} onChange={e=>setRecord({...record,weight:{...record.weight!,amount:e.target.value}})}/></Field><Field label="速度"><select value={record.weight.speed??''} onChange={e=>setRecord({...record,weight:{...record.weight!,speed:(e.target.value||undefined) as '突然'|'缓慢'|undefined}})}><option value="">未填写</option><option>突然</option><option>缓慢</option></select></Field><Field label="记录日期"><Input type="date" max={today} value={record.weight.date??date} onChange={e=>setRecord({...record,weight:{...record.weight!,date:e.target.value}})}/></Field></>}<Field label="食欲"><select value={record.appetite??''} onChange={e=>setRecord({...record,appetite:(e.target.value||undefined) as HealthRecord['appetite']})}><option value="">未填写</option>{['增加','减少','正常'].map(x=><option key={x}>{x}</option>)}</select></Field></div></div>
    </Section>}

    {activeTab==='exercise'&&<Section title="运动" onClear={record.exercise?()=>setRecord({...record,exercise:undefined}):undefined} onAdd={!record.exercise?()=>setRecord({...record,exercise:{type:''}}):undefined}>
      {!record.exercise?<p className="record-empty">暂无记录</p>:<div className="record-card record-grid"><Field label="类型"><Input value={record.exercise.type} onChange={e=>setRecord({...record,exercise:{...record.exercise!,type:e.target.value}})}/></Field><Field label="时长"><Input value={record.exercise.duration??''} onChange={e=>setRecord({...record,exercise:{...record.exercise!,duration:e.target.value}})}/></Field><Field label="频率"><Input value={record.exercise.frequency??''} onChange={e=>setRecord({...record,exercise:{...record.exercise!,frequency:e.target.value}})}/></Field><Field label="强度"><select value={record.exercise.intensity??''} onChange={e=>setRecord({...record,exercise:{...record.exercise!,intensity:(e.target.value||undefined) as NonNullable<HealthRecord['exercise']>['intensity']}})}><option value="">未填写</option>{['轻松','适中','累'].map(x=><option key={x}>{x}</option>)}</select></Field></div>}
    </Section>}

    {activeTab==='diet'&&<Section title="饮食与饮品" onClear={record.diet?()=>setRecord({...record,diet:undefined}):undefined} onAdd={!record.diet?()=>setRecord({...record,diet:{foods:[]}}):undefined}>
      {!record.diet?<p className="record-empty">暂无记录</p>:<div className="record-card"><Field label="食物（顿号分隔）"><Input value={(record.diet.foods??[]).join('、')} onChange={e=>setRecord({...record,diet:{...record.diet!,foods:e.target.value.split(/[、,，]/).map(x=>x.trim()).filter(Boolean)}})}/></Field><div className="record-grid"><Field label="规律用餐"><select value={record.diet.mealsRegular===undefined?'':String(record.diet.mealsRegular)} onChange={e=>setRecord({...record,diet:{...record.diet!,mealsRegular:e.target.value===''?undefined:e.target.value==='true'}})}><option value="">未填写</option><option value="true">是</option><option value="false">否</option></select></Field><Field label="饮水"><select value={record.diet.water??''} onChange={e=>setRecord({...record,diet:{...record.diet!,water:(e.target.value||undefined) as '充足'|'偏少'|undefined}})}><option value="">未填写</option><option>充足</option><option>偏少</option></select></Field><Field label="咖啡因"><Input value={record.diet.caffeine??''} onChange={e=>setRecord({...record,diet:{...record.diet!,caffeine:e.target.value}})}/></Field><Field label="酒精"><Input value={record.diet.alcohol??''} onChange={e=>setRecord({...record,diet:{...record.diet!,alcohol:e.target.value}})}/></Field><Field label="吸烟"><select value={record.diet.smoking===undefined?'':String(record.diet.smoking)} onChange={e=>setRecord({...record,diet:{...record.diet!,smoking:e.target.value===''?undefined:e.target.value==='true'}})}><option value="">未填写</option><option value="true">是</option><option value="false">否</option></select></Field></div></div>}
    </Section>}

    {activeTab==='medication'&&<Section title="用药提及" onAdd={()=>setRecord({...record,medications:[...(record.medications??[]),{name:'',action:'服用'}]})}>{(record.medications??[]).length===0?<p className="record-empty">暂无用药记录</p>:(record.medications??[]).map((item,index)=><div className="record-card record-array-row" key={item.id??index}><Field label="药物"><Input value={item.name} onChange={e=>setRecord({...record,medications:record.medications!.map((v,i)=>i===index?{...v,name:e.target.value}:v)})}/></Field><Field label="动作"><select value={item.action} onChange={e=>setRecord({...record,medications:record.medications!.map((v,i)=>i===index?{...v,action:e.target.value as typeof v.action}:v)})}><option>服用</option><option>漏服</option><option>停用</option></select></Field><button type="button" aria-label="删除用药" onClick={()=>setRecord({...record,medications:record.medications!.filter((_,i)=>i!==index)})}><Trash2/></button></div>)}</Section>}

    {activeTab==='life'&&<><Section title="生活事件" onAdd={()=>setRecord({...record,lifeEvents:[...(record.lifeEvents??[]),{category:'家庭',description:'',impact:'中性'}]})}>{(record.lifeEvents??[]).length===0?<p className="record-empty">暂无生活事件</p>:(record.lifeEvents??[]).map((item,index)=><div className="record-card record-array-row" key={item.id??index}><Field label="类别"><select value={item.category} onChange={e=>setRecord({...record,lifeEvents:record.lifeEvents!.map((v,i)=>i===index?{...v,category:e.target.value as typeof v.category}:v)})}><option>家庭</option><option>社交</option><option>心情事件</option></select></Field><Field label="事件"><Input value={item.description} onChange={e=>setRecord({...record,lifeEvents:record.lifeEvents!.map((v,i)=>i===index?{...v,description:e.target.value}:v)})}/></Field><Field label="影响"><select value={item.impact} onChange={e=>setRecord({...record,lifeEvents:record.lifeEvents!.map((v,i)=>i===index?{...v,impact:e.target.value as typeof v.impact}:v)})}><option>正面</option><option>负面</option><option>中性</option></select></Field><button type="button" aria-label="删除事件" onClick={()=>setRecord({...record,lifeEvents:record.lifeEvents!.filter((_,i)=>i!==index)})}><Trash2/></button></div>)}</Section>

    <Section title="就医诉求与其他"><div className="record-card"><Field label="想解决的问题"><Textarea value={record.medicalNeeds??''} onChange={e=>setRecord({...record,medicalNeeds:e.target.value})}/></Field><Field label="其他记录"><Textarea value={record.other??''} onChange={e=>setRecord({...record,other:e.target.value})}/></Field></div></Section></>}
    </div>
    <div className="record-actions"><Button variant="outline" onClick={onBack}>返回对话</Button><Button onClick={save} disabled={saving}><Save/>{saving?'保存中…':'保存记录'}</Button></div>
  </div>;
}
