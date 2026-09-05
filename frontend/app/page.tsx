'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, ArrowRight, Award, Bone, CalendarDays, Check, ChevronRight, CircleUserRound,
  ClipboardPlus, Copy, Dumbbell, FileText, Heart, Home, LockKeyhole, MessageCircle,
  MessageCircleMore, Mic, Moon, Pencil, PersonStanding, Plus, Search,
  Send, Settings, Share2, ShoppingBag, Smile, Sparkles, Sprout, Star, Sun, UserPlus,
  UserRound, UsersRound, Utensils, Volume2, Waves, X,
} from 'lucide-react';
import { signInDemo, useSession } from '@/lib/auth';
import { services } from '@/lib/services';
import { createClientId } from '@/lib/id';
import type { HealthDraftItem, MonthlyHealthStats } from '@/lib/contracts';
import type { NavigationTarget } from '@/lib/contracts';
import HealthRecordEditor from '@/components/health-record-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Toaster, toast } from '@/components/ui/toast';

type View = 'home'|'community'|'messages'|'profile'|'chat'|'health'|'actions'|'month'|'summaries'|'summary'|'range'|'report'|'expression'|'achievements'|'personal';
type ProfileData = { birth: string; history: string; surgery: string };
type ChatMessage = { from:'ai'|'me'; text:string; id?:string; speakableText?:string; navigation?:{target:NavigationTarget;params?:Record<string,string>}; sources?:Array<{title:string;sourceUrl?:string}> };
type HealthUpdateNotice = { id:string; text:string; recordDate:string };

const healthCategoryLabels:Record<string,string>={symptom:'症状',mood:'心情',sleep:'睡眠',menstrual:'经期',weight:'体重',appetite:'食欲',exercise:'运动',diet:'饮食',medication:'用药',lifeEvent:'生活事件',medicalNeed:'就医需求',other:'健康记录'};
const displayValue=(value:unknown,fallback:string)=>typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):fallback;
function healthItemSummary(item:HealthDraftItem){
  const label=healthCategoryLabels[item.category]??'健康记录';if(item.operation==='delete')return`已删除${label}`;
  const data=item.data;if(typeof data==='string')return`${label}${data.slice(0,18)}`;if(!data)return`${label}已更新`;
  if(item.category==='sleep')return data.quality?`睡眠质量${displayValue(data.quality,'已更新')}`:'睡眠记录已更新';
  if(item.category==='symptom')return`${displayValue(data.symptom,'症状')}${data.occurred===false?'未发生':data.severity?`${displayValue(data.severity,'')}度`:'已记录'}`;
  if(item.category==='mood')return`心情${displayValue(data.label??data.type,'已更新')}`;
  if(item.category==='menstrual')return`经期${displayValue(data.event,'已更新')}`;
  if(item.category==='weight')return data.value?`体重${displayValue(data.value,'')}${displayValue(data.unit,'kg')}`:'体重已更新';
  if(item.category==='exercise')return`运动${displayValue(data.type??data.name,'已记录')}`;
  if(item.category==='diet')return'饮食记录已更新';
  if(item.category==='medication')return`${displayValue(data.name,'用药')}${displayValue(data.action,'已记录')}`;
  if(item.category==='lifeEvent')return`生活事件${displayValue(data.description,'已记录').slice(0,14)}`;
  return`${label}已更新`;
}
function healthUpdateText(recordDate:string,items:HealthDraftItem[]){const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});const dateLabel=recordDate===today?'今日':`${Number(recordDate.slice(5,7))}月${Number(recordDate.slice(8,10))}日`;const details=items.slice(0,2).map(healthItemSummary).join('、');return`健康卡片已更新：${dateLabel}${details||'健康记录'}${items.length>2?`等${items.length}项`:''}`}

const nav = [
  { view:'home' as View, label:'今天的我', icon:Home }, { view:'community' as View, label:'交流广场', icon:UsersRound },
  { view:'messages' as View, label:'我的消息', icon:MessageCircleMore }, { view:'profile' as View, label:'我的', icon:UserRound },
];
const categories = [
  ['走起来','每天多走一点，让身体保持流动',PersonStanding], ['长肌肉','慢慢积攒力量，日常更有底气',Dumbbell],
  ['吃得好','吃得更完整一点，给身体足够营养',Utensils], ['骨头好','给骨骼多一点支持，稳稳走得更远',Bone],
  ['睡得好','为夜晚留出空间，让休息更踏实',Moon], ['心情好','照顾当下感受，给自己一点松弛',Heart],
] as const;
const posts = [
  { name:'温暖的晨光', time:'2小时前', text:'今天和闺蜜爬山，风很大，却让人心里很通透。更年期让我学会慢下来，也更懂自己。', likes:32, comments:12, emoji:'👩🏻', image:'山顶的风，也是一种拥抱' },
  { name:'自在如风', time:'5小时前', text:'最近开始练八段锦，睡眠改善了不少，整个人也更放松了。分享给同路的姐妹～', likes:28, comments:8, emoji:'👩🏽', image:null },
  { name:'海边的椰子', time:'昨天 21:30', text:'第一次独自旅行，给自己一个拥抱。中年也可以有很多新的开始。', likes:42, comments:15, emoji:'👩🏻‍🦱', image:'新的开始，在海边' },
];

function StatusBar(){ return <header className="statusbar"><b>9:41</b><span>▮▮▮　◉　▰</span></header>; }
function PageHeader({title, subtitle, onBack, action}:{title:string;subtitle?:string;onBack:()=>void;action?:React.ReactNode}){
  return <div className="page-header"><button className="back" onClick={onBack} aria-label="返回"><ArrowLeft/></button><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div><div className="header-action">{action}</div></div>;
}
function NavBar({active,onGo}:{active:View;onGo:(v:View)=>void}){
  return <nav className="tabbar" aria-label="主要导航">{nav.map(({view,label,icon:Icon})=><button key={view} className={active===view?'active':''} onClick={()=>onGo(view)}><Icon/><span>{label}</span></button>)}</nav>;
}
function Screen({children,navActive,onGo,contentClassName}:{children:React.ReactNode;navActive?:View;onGo:(v:View)=>void;contentClassName?:string}){
  return <section className="phone-shell"><StatusBar/><div className={`screen-scroll${contentClassName?` ${contentClassName}`:''}`}>{children}</div>{navActive&&<NavBar active={navActive} onGo={onGo}/>}</section>;
}

export default function App(){
  const [view,setView]=useState<View>('home');
  const [history,setHistory]=useState<View[]>([]);
  const [dimension,setDimension]=useState('我的潮热');
  const [chart,setChart]=useState(false);
  const [range,setRange]=useState('半年');
  const [profile,setProfile]=useState<ProfileData>({birth:'1978',history:'高血压',surgery:'无'});
  const [profilePrefill,setProfilePrefill]=useState<Record<string,string>|null>(null);
  const [expression,setExpression]=useState('');
  const [polished,setPolished]=useState('');
  const [chatText,setChatText]=useState('');
  const [chatGenerating,setChatGenerating]=useState(false);
  const chatAbortRef=useRef<AbortController|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([
    {from:'ai',text:'你好，我是小年。无论是身体变化、心情，还是今天发生的小事，都可以慢慢说。'},
  ]);
  const [healthNotice,setHealthNotice]=useState<HealthUpdateNotice|null>(null);
  const [healthDate,setHealthDate]=useState<string|undefined>();
  const [demoError,setDemoError]=useState<string|null>(null);
  const conversationRef=useRef<string|null>(null);
  const {session,loading:authLoading}=useSession();
  const realMode=process.env.NEXT_PUBLIC_USE_MOCKS!=='true';
  const activeNav:View = ['home','community','messages','profile'].includes(view)?view:'home';
  const go=(next:View)=>{setHistory(h=>[...h,view]);setView(next)};
  const back=()=>{const prev=history.at(-1)||'home';setHistory(h=>h.slice(0,-1));setView(prev)};
  const root=(next:View)=>{setHistory([]);setView(next)};
  const soon=()=>toast.add({title:'敬请期待',description:'这个功能将在后续版本开放。'});
  useEffect(()=>{services.profile.get().then(value=>setProfile({birth:String(value.birthYear??''),history:value.medicalHistory,surgery:value.surgeryHistory})).catch(()=>undefined)},[]);
  useEffect(()=>()=>chatAbortRef.current?.abort(),[]);
  useEffect(()=>{if(!healthNotice)return;const timer=window.setTimeout(()=>setHealthNotice(current=>current?.id===healthNotice.id?null:current),5000);return()=>window.clearTimeout(timer)},[healthNotice]);
  useEffect(()=>{
    if(!realMode||session)return;
    let cancelled=false;
    signInDemo().catch(()=>{if(!cancelled)setDemoError('演示账号暂时不可用，请稍后刷新重试')});
    return ()=>{cancelled=true};
  },[realMode,session]);
  if(realMode&&(authLoading||!session))return <main className="prototype-stage"><Screen navActive="home" onGo={()=>{}}><div style={{padding:'48px 24px',textAlign:'center',color:'var(--muted)'}}>{demoError??'正在进入…'}</div></Screen></main>;
  const sendChat=async(voiceText?:string)=>{
    const text=(voiceText??chatText).trim();
    if(!text||chatGenerating)return;
    const clientMessageId=createClientId();
    const controller=new AbortController();
    chatAbortRef.current=controller;
    setChatText('');
    setChatGenerating(true);
    setMessages(m=>[...m,{from:'me',text},{from:'ai',text:''}]);
    try{
      for await(const event of services.chat.stream(text,clientMessageId,conversationRef.current,controller.signal)){
        if(event.type==='message_started')conversationRef.current=event.data.conversationId;
        if(event.type==='text_delta')setMessages(m=>m.map((message,index)=>index===m.length-1&&message.from==='ai'?{...message,text:message.text+event.data.delta}:message));
        if(event.type==='navigation')setMessages(m=>m.map((message,index)=>index===m.length-1&&message.from==='ai'?{...message,navigation:event.data}:message));
        if(event.type==='rag_sources')setMessages(m=>m.map((message,index)=>index===m.length-1&&message.from==='ai'?{...message,sources:event.data.sources}:message));
        if(event.type==='message_completed')setMessages(m=>m.map((message,index)=>index===m.length-1&&message.from==='ai'?{...message,id:event.data.messageId,speakableText:event.data.speakableText}:message));
        if(event.type==='error')throw new Error(event.data.message);
        if(event.type==='health_card_updated'){setHealthDate(event.data.recordDate);setHealthNotice({id:createClientId(),recordDate:event.data.recordDate,text:healthUpdateText(event.data.recordDate,event.data.items)})}
        if(event.type==='health_card_update_failed')toast.add({title:'健康卡片自动更新失败',description:event.data.message,type:'error'});
        if(event.type==='health_card_preview'&&event.data.items?.length){try{await services.healthCard.confirm(event.data.draftId,event.data.items,createClientId());setHealthDate(event.data.recordDate);setHealthNotice({id:createClientId(),recordDate:event.data.recordDate,text:healthUpdateText(event.data.recordDate,event.data.items)})}catch{toast.add({title:'健康卡片自动更新失败',description:'可点击右上角健康卡片图标手动补充',type:'error'})}}
      }
    }catch{
      if(!controller.signal.aborted)setMessages(m=>m.map((message,index)=>index===m.length-1&&message.from==='ai'?{...message,text:'这次没有连接上，请稍后重试。'}:message));
    }finally{
      setChatGenerating(false);
      chatAbortRef.current=null;
    }
  };

  const content=(()=>{
    if(view==='home') return <HomeView go={go}/>;
    if(view==='community') return <Community soon={soon}/>;
    if(view==='messages') return <Messages go={go} soon={soon}/>;
    if(view==='profile') return <Profile go={go} soon={soon}/>;
    if(view==='chat') return <Chat messages={messages} text={chatText} setText={setChatText} send={sendChat} generating={chatGenerating} stop={()=>chatAbortRef.current?.abort()} back={back} healthNotice={healthNotice} dismissHealthNotice={()=>setHealthNotice(null)} onNavigate={(target,params)=>{if(target==='healthCard')setHealthDate(params?.date);if(target==='profile')setProfilePrefill(params??null);go(navigationView(target))}} onEditHealth={()=>go('health')}/>;
    if(view==='health') return <><PageHeader title="健康卡片" subtitle="可查看和修改任意日期的记录" onBack={back}/><HealthRecordEditor initialDate={healthDate} onBack={back}/></>;
    if(view==='actions') return <Actions back={back} soon={soon}/>;
    if(view==='month') return <Month back={back} go={go} dimension={dimension} setDimension={setDimension} chart={chart} setChart={setChart} onEditHealth={()=>go('health')}/>;
    if(view==='summaries') return <Summaries back={back} go={go}/>;
    if(view==='summary') return <Summary back={back} soon={soon}/>;
    if(view==='range') return <Range back={back} range={range} setRange={setRange} go={go}/>;
    if(view==='report') return <Report back={back} profile={profile} setProfile={setProfile} soon={soon}/>;
    if(view==='expression') return <Expression back={back} input={expression} setInput={setExpression} polished={polished} setPolished={setPolished}/>;
    if(view==='achievements') return <Achievements back={back}/>;
    return <Personal back={()=>{setProfilePrefill(null);back()}} profile={profile} prefill={profilePrefill} setProfile={setProfile}/>;
  })();

  return <main className="prototype-stage"><Screen navActive={['home','community','messages','profile'].includes(view)?activeNav:undefined} onGo={root} contentClassName={view==='chat'?'chat-screen':view==='health'?'health-screen':view==='expression'?'expression-screen':undefined}>{content}</Screen><Toaster/></main>;
}

function HomeView({go}:{go:(v:View)=>void}){
  const demoActions=[{name:'走起来',Icon:PersonStanding},{name:'睡得好',Icon:Moon}] as const;
  return <>
    <div className="home-heading"><h1>早上好，<br/>今天感觉怎么样？</h1><button className="icon-button" onClick={()=>go('month')}><CalendarDays/></button></div>
    <button type="button" className="hero-card chat-bg" onClick={()=>go('chat')}><div><h2>絮絮叨叨</h2><p>想说什么都可以，我在听</p></div><span className="dark-pill">开始聊聊 <ArrowRight/></span></button>
    <section className="motion-card"><div className="motion-copy"><h2>今天动一动</h2><p>小步动起来，<br/>更年期，更年轻</p></div><button type="button" className="round-arrow" onClick={()=>go('actions')} aria-label="查看全部活动"><ChevronRight/></button><div style={{display:'flex',gap:12,padding:'4px 18px 12px',paddingLeft:30}}>{demoActions.map(({name,Icon})=><button type="button" key={name} onClick={()=>go('actions')} style={{width:72,height:72,borderRadius:16,border:0,outline:'none',background:'var(--surface)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}><Icon/><small style={{color:'var(--muted)'}}>{name}</small></button>)}</div></section>
    <section className="month-card"><h2>这个月的我</h2><div className="metric-grid"><button type="button" onClick={()=>go('month')}><Moon/><b>睡眠</b><strong>7.2<small>小时</small></strong><span>良好</span></button><button type="button" onClick={()=>go('month')}><Smile/><b>心情</b><strong>平稳</strong><span>值得肯定</span></button><button type="button" onClick={()=>go('month')}><Sprout/><b>身体</b><strong>轻盈</strong><span>保持中</span></button></div><div className="month-dates"><span>5/5</span><span>5/15</span><span>5/25</span><span>5/31</span></div></section>
  </>}

function Community({soon}:{soon:()=>void}){return <><div className="top-title"><h1>交流广场</h1><button className="icon-button" onClick={soon}><ShoppingBag/></button></div><button className="searchbar" onClick={soon}><Search/>搜索帖子或话题</button><div className="feed">{posts.map(p=><article className={`post ${p.image?'has-image':''}`} key={p.name}><div className="post-user"><span>{p.emoji}</span><div><b>{p.name}</b><small>{p.time}</small></div></div><div className="post-body"><p>{p.text}</p>{p.image&&<button className="post-image" onClick={soon}>{p.image}</button>}</div><div className="post-actions"><button onClick={soon}><Heart/>{p.likes}</button><button onClick={soon}><MessageCircle/>{p.comments}</button><button onClick={soon}><Star/>收藏</button></div></article>)}</div><button className="fab" onClick={soon}><Plus/></button></>}

function Messages({go,soon}:{go:(v:View)=>void;soon:()=>void}){return <><div className="top-title"><h1>我的消息</h1><button className="icon-button" onClick={soon} aria-label="添加好友"><UserPlus/></button></div><section className="expression-card ai-bg"><div className="expression-card-copy"><small>沟通表达助手</small><h2>AI 帮我说</h2><p>你想说的话，我帮你温柔地说出来。</p></div><ul className="expression-benefits" aria-label="功能说明"><li>保留你的真实意思</li><li>支持文字或语音</li></ul><button className="dark-pill" onClick={()=>go('expression')}>试着说说 <ArrowRight/></button></section><div className="notice-grid"><button onClick={soon}><span className="notice-icon blue"><MessageCircle/></span><span><b>评论和@</b><small>3 条新通知</small></span><i>3</i><ChevronRight/></button><button onClick={soon}><span className="notice-icon rose"><Heart/></span><span><b>点赞和收藏</b><small>7 条新通知</small></span><i>7</i><ChevronRight/></button></div><div className="message-list">{[['知心姐姐','回复了你的帖子：我也有同样的感受，一起加油呀～','10:24'],['岁月静好','赞了你的帖子','昨天'],['自在如风','在你的帖子下评论了','昨天']].map(x=><button key={x[0]} onClick={soon}><span className="avatar">{x[0][0]}</span><span><b>{x[0]}</b><small>{x[1]}</small></span><em>{x[2]}</em><ChevronRight/></button>)}</div></>}

function Profile({go,soon}:{go:(v:View)=>void;soon:()=>void}){return <><div className="profile-head"><span className="portrait">林</span><div><h1>林杉</h1><p>拥抱变化，温柔而有力量</p></div><button className="icon-button" onClick={()=>go('personal')}><Pencil/></button></div><button className="achievement-preview" onClick={()=>go('achievements')}><div><h2>我的成就</h2><p>12枚成就 · 等待与你相遇</p></div><span><Award/><LockKeyhole/><LockKeyhole/></span></button><div className="menu-stack"><button onClick={soon}><Star/><span><b>我的收藏</b><small>广场内容与商城商品</small></span><ChevronRight/></button><button onClick={()=>go('personal')}><CircleUserRound/><span><b>我的资料</b><small>检查报告与用药记录</small></span><ChevronRight/></button><button onClick={soon}><Settings/><span><b>设置与隐私</b><small>账号、通知与数据</small></span><ChevronRight/></button></div></>}

function Chat({messages,text,setText,send,generating,stop,back,onEditHealth,onNavigate,healthNotice,dismissHealthNotice}:{messages:ChatMessage[];text:string;setText:(v:string)=>void;send:(text?:string)=>void;generating:boolean;stop:()=>void;back:()=>void;onEditHealth:()=>void;onNavigate:(target:NavigationTarget,params?:Record<string,string>)=>void;healthNotice:HealthUpdateNotice|null;dismissHealthNotice:()=>void}){
  const recorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<Blob[]>([]);const startedRef=useRef(0);const flowRef=useRef<HTMLDivElement|null>(null);const [recording,setRecording]=useState(false);const [speechBusy,setSpeechBusy]=useState(false);
  useEffect(()=>{const flow=flowRef.current;if(flow)flow.scrollTop=flow.scrollHeight},[messages]);
  const toggleRecording=async()=>{
    if(recording){recorderRef.current?.stop();return}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){toast.add({title:'当前浏览器不支持录音',type:'error'});return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});const recorder=new MediaRecorder(stream);recorderRef.current=recorder;chunksRef.current=[];startedRef.current=Date.now();
      recorder.ondataavailable=event=>{if(event.data.size)chunksRef.current.push(event.data)};
      recorder.onstop=async()=>{setRecording(false);stream.getTracks().forEach(track=>track.stop());const audio=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});setSpeechBusy(true);try{const transcript=await services.speech.transcribe(audio,Date.now()-startedRef.current,createClientId());if(transcript){setText(transcript);send(transcript)}}catch{toast.add({title:'语音识别失败，请重试',type:'error'})}finally{setSpeechBusy(false)}};
      recorder.start();setRecording(true);toast.add({title:'正在聆听…',description:'再次点击麦克风结束并发送'});
    }catch{toast.add({title:'无法使用麦克风',description:'请允许浏览器访问麦克风',type:'error'})}
  };
  const play=async(message:ChatMessage)=>{if(!message.text)return;try{if(message.id&&message.speakableText){const blob=await services.speech.synthesize(message.id,message.speakableText);if(blob){const url=URL.createObjectURL(blob);const audio=new Audio(url);audio.onended=()=>URL.revokeObjectURL(url);await audio.play();return}}if('speechSynthesis'in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(message.text))}}catch{toast.add({title:'暂时无法朗读',type:'error'})}};
  const healthCardAction=<div className="health-edit-anchor"><button className="icon-button" onClick={()=>{dismissHealthNotice();onEditHealth()}} aria-label="编辑健康卡片"><Pencil/></button>{healthNotice&&<output className="health-update-popover">{healthNotice.text}</output>}</div>;
  return <div className="full-view chat-view"><PageHeader title="絮絮叨叨" onBack={back} action={healthCardAction}/><div className="disclaimer">我会陪你整理感受与记录，但不能替代医生诊断；如有急症请及时就医</div><div ref={flowRef} className="chat-flow" aria-live="polite" aria-busy={generating}>{messages.map((m,i)=><div className={`chat-message ${m.from}`} key={i}><div className={`bubble ${m.from}`}>{m.from==='ai'&&m.text?<MarkdownMessage text={m.text}/>:<span className="plain-message">{m.text||'正在听你说…'}</span>}{m.from==='ai'&&m.text&&<button type="button" className="speak-message" aria-label="播放语音" onClick={()=>void play(m)}><Volume2/></button>}</div>{m.navigation&&<FeatureCard intent={m.navigation} onOpen={onNavigate}/>} {m.sources?.length?<details className="chat-sources"><summary>参考资料 {m.sources.length} 条</summary>{m.sources.map((source,index)=><p key={`${source.title}-${index}`}>{source.sourceUrl?<a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.title}</a>:source.title}</p>)}</details>:null}</div>)}</div><div className="chat-composer"><Input value={text} onChange={e=>setText(e.target.value.slice(0,2000))} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),send())} placeholder="说点什么..." aria-label="对话内容"/><button type="button" className={`mic ${recording?'recording':''}`} onClick={()=>void toggleRecording()} disabled={speechBusy||generating} aria-label={recording?'结束录音并发送':'开始语音输入'}>{recording?<X/>:<Mic/>}</button>{generating?<button type="button" className="send" onClick={stop} aria-label="停止生成"><X/></button>:<button type="button" className="send" onClick={()=>send()} disabled={!text.trim()||speechBusy} aria-label="发送"><Send/></button>}</div></div>
}

function readableMarkdown(text:string){
  const withLists=text.replace(/([。！？!?；;])\s*(?=\d+[.)、]\s*)/g,'$1\n\n').replace(/\s+(?=(?:[-*+]|\d+[.)、])\s+)/g,'\n');
  if(withLists.includes('\n')||/(^|\s)(#{1,6}\s|```|>\s)|\*\*[^*]+\*\*/.test(withLists)||withLists.length<80)return withLists;
  const sentences=withLists.match(/[^。！？!?；;]+[。！？!?；;]?/g)?.map(value=>value.trim()).filter(Boolean)??[];
  if(sentences.length<3)return withLists;
  const paragraphs:string[]=[];for(let index=0;index<sentences.length;index+=2)paragraphs.push(sentences.slice(index,index+2).join(''));
  return paragraphs.join('\n\n');
}
function MarkdownMessage({text}:{text:string}){return <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href,title})=><a href={href} title={title} target="_blank" rel="noreferrer">{children}</a>}}>{readableMarkdown(text)}</ReactMarkdown></div>}

const FEATURE_COPY:Record<NavigationTarget,{title:string;description:string}>={reportExport:{title:'生成就医报告',description:'汇总已确认记录，预览后再导出'},monthlySummary:{title:'查看月度总结',description:'回顾身体、睡眠、心情和运动'},monthlyRecords:{title:'打开月历与曲线',description:'查看这个月的记录变化'},exerciseToday:{title:'查看今日建议',description:'根据近期记录安排温和行动'},exerciseCategories:{title:'浏览全部行动',description:'按类别选择适合自己的活动'},healthCard:{title:'编辑健康卡片',description:'查看、补充或删除任意日期记录'},profile:{title:'填写个人资料',description:'补充报告需要的基础信息'}};
function FeatureCard({intent,onOpen}:{intent:{target:NavigationTarget;params?:Record<string,string>};onOpen:(target:NavigationTarget,params?:Record<string,string>)=>void}){const copy=FEATURE_COPY[intent.target];return <button type="button" className="ai-feature-card" onClick={()=>onOpen(intent.target,intent.params)}><span><b>{copy.title}</b><small>{copy.description}</small></span><ArrowRight/></button>}
function navigationView(target:NavigationTarget):View{if(target==='reportExport')return'range';if(target==='monthlySummary')return'summaries';if(target==='monthlyRecords')return'month';if(target==='healthCard')return'health';if(target==='profile')return'personal';return'actions'}

function Actions({back,soon}:{back:()=>void;soon:()=>void}){const [items,setItems]=useState<Array<{id:string;category:string;title:string;description:string}>>([]);useEffect(()=>{let active=true;services.recommendations.getToday().then(value=>{if(active)setItems(value)}).catch(()=>toast.add({title:'建议读取失败',type:'error'}));return()=>{active=false}},[]);return <><PageHeader title="今天动一动" subtitle="从你愿意的地方开始" onBack={back}/><div className="action-hero menopause-bg"><div>{items.slice(0,2).map(item=><b key={item.id}>{item.title} <small>{item.category}</small></b>)}</div><p>{items.length?'根据你最近确认的记录为你整理':'正在整理适合你的建议…'}</p></div><h2 className="section-title">查看全部</h2><div className="category-list">{categories.map(([name,desc,Icon])=><button key={name} onClick={soon}><Icon/><span><b>{name}</b><small>{desc}</small></span><ChevronRight/></button>)}</div><p className="footnote">建议仅作日常参考，身体不适时请暂停并及时就医</p></>}

function Month({back,go,dimension,setDimension,chart,setChart,onEditHealth}:{back:()=>void;go:(v:View)=>void;dimension:string;setDimension:(v:string)=>void;chart:boolean;setChart:(v:boolean)=>void;onEditHealth:()=>void}){const dims=['我的睡眠','我的潮热','我的心情','我的运动'];const [month,setMonth]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).slice(0,7));const [stats,setStats]=useState<MonthlyHealthStats|null>(null);useEffect(()=>{let active=true;services.healthRecords.monthly(month).then(value=>{if(active)setStats(value)}).catch(()=>{if(active){setStats(null);toast.add({title:'月度记录读取失败',type:'error'})}});return()=>{active=false}},[month]);const move=(offset:number)=>{const [year,value]=month.split('-').map(Number);setMonth(new Date(Date.UTC(year,value-1+offset,1)).toISOString().slice(0,7))};const days=stats?.days??[];const recorded=days.filter(day=>day.hasRecord).length;const positive=days.filter(day=>day.mood?.type==='正面').length;const flashes=days.reduce((sum,day)=>sum+(Number(day.hotFlash?.frequencyCount)||0),0);const exercise=days.filter(day=>day.exercise).length;return <><PageHeader title="这个月的我" onBack={back} action={<><button className="icon-button" onClick={onEditHealth} aria-label="编辑健康卡片"><Pencil/></button><button className="view-toggle" onClick={()=>setChart(!chart)}>{chart?<Waves/>:<CalendarDays/>}<span>{chart?'曲线':'日历'}</span><small>⌄</small></button></>}/><div className="month-switch"><button onClick={()=>move(-1)}>‹</button><b>{month.replace('-','年')}月</b><button onClick={()=>move(1)} disabled={month>=new Date().toISOString().slice(0,7)}>›</button></div><div className="segmented">{dims.map(d=><button key={d} className={dimension===d?'active':''} onClick={()=>setDimension(d)}>{d}</button>)}</div>{chart?<Trend dimension={dimension} days={days}/>:<Calendar dimension={dimension} month={month} days={days}/>}<section className="month-summary monthly-bg"><h3>{stats?.digest?.text??'这个月还没有记录'}</h3><div><span><small>已记录</small><b>{recorded}天</b></span><span><small>正面心情</small><b>{positive}天</b></span><span><small>潮热</small><b>{flashes}次</b></span><span><small>运动</small><b>{exercise}天</b></span></div></section><div className="month-links"><button onClick={()=>go('summaries')}><FileText/>月度总结</button><button onClick={()=>go('range')}><ClipboardPlus/>就医报告</button></div></>}
function metric(day:MonthlyHealthStats['days'][number],dimension:string){if(dimension==='我的睡眠')return Number(day.sleep?.qualityScore)||0;if(dimension==='我的潮热')return Number(day.hotFlash?.chartValue)||0;if(dimension==='我的心情')return Number(day.mood?.chartValue)||0;if(dimension==='我的运动')return day.exercise?1:0;return 0}
function Calendar({dimension,month,days}:{dimension:string;month:string;days:MonthlyHealthStats['days']}){const [year,value]=month.split('-').map(Number);const offset=(new Date(year,value-1,1).getDay()+6)%7;return <div className="calendar"><div className="week">{['一','二','三','四','五','六','日'].map(x=><b key={x}>{x}</b>)}</div><div className="days">{Array.from({length:offset},(_,index)=><span key={`blank-${index}`}/>)}{days.map(day=>{const score=metric(day,dimension);const tone=score>=3?'heavy':score>=2?'medium':'light';return <button key={day.date} title={day.hasRecord?'已有健康记录':'暂无记录'}><span>{Number(day.date.slice(-2))}</span>{score!==0&&<i className={tone}/>}</button>})}</div><div className="legend">当前查看：{dimension}　 <i className="light"/>轻　<i className="medium"/>中　<i className="heavy"/>重</div></div>}
function Trend({dimension,days}:{dimension:string;days:MonthlyHealthStats['days']}){const values=days.map(day=>metric(day,dimension));const points=values.map((value,index)=>`${10+(index/Math.max(values.length-1,1))*302},${130-Math.max(-1,Math.min(3,value))*30}`).join(' ');return <div className="trend-panel"><svg viewBox="0 0 320 150" aria-label={`${dimension}月度趋势`}><polyline className="trend-stroke" points={points} fill="none"/>{values.map((value,index)=>value!==0?<circle key={index} cx={10+(index/Math.max(values.length-1,1))*302} cy={130-Math.max(-1,Math.min(3,value))*30} r="3"/>:null)}</svg><div className="trend-labels"><span>1日</span><span>8日</span><span>15日</span><span>22日</span><span>月底</span></div><p>{values.some(Boolean)?'曲线仅来自已确认的记录':'本月暂无可绘制数据'}</p></div>}

function Summaries({back,go}:{back:()=>void;go:(v:View)=>void}){return <><PageHeader title="月度总结" subtitle="回看每一段真实的变化" onBack={back}/><h3 className="year">2026年</h3><div className="summary-list">{[['8月','睡眠更稳定，潮热记录趋于平缓'],['7月','作息更规律，心情整体更平稳'],['6月','潮热次数减少，夜间睡眠改善'],['5月','记录逐渐稳定，开始建立节奏']].map((x,i)=><button key={x[0]} className={i===0?'new':''} onClick={()=>go('summary')}><b>{x[0]}{i===0&&<i>新总结</i>}</b><p>{x[1]}</p><ChevronRight/></button>)}</div><p className="footnote">总结来自你确认保存的记录</p></>}
function Sparkline({tone}:{tone:string}){return <svg className="sparkline" viewBox="0 0 130 34" aria-hidden="true"><path d="M2 25 C18 27 25 7 42 12 S63 29 78 18 S103 5 128 11"/><circle cx="128" cy="11" r="4" fill={tone}/></svg>}
function Summary({back,soon}:{back:()=>void;soon:()=>void}){const insights=[['睡眠','平均睡眠7.2小时，夜间醒来次数减少。','#99aa8e'],['潮热','潮热频次较上月下降约19%。','#d49b9c'],['心情','情绪总体平稳，积极情绪占比提升。','#dfb77e'],['运动','运动更有规律，累计运动7天。','#98b4bf']];return <><PageHeader title="2026年 8月总结" onBack={back} action={<button className="icon-button" onClick={soon}><Share2/></button>}/><section className="overview"><h3>月度概览</h3><div className="petal-chart">{[['记录','18天'],['睡眠','7.2h'],['潮热','21次'],['运动','7天']].map((x,i)=><span className={`petal p${i+1}`} key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></span>)}<i className="petal-center"/></div></section><div className="insight-grid">{insights.map(x=><section key={x[0]}><b>{x[0]}</b><p>{x[1]}</p><Sparkline tone={x[2]}/></section>)}</div><section className="good-things monthly-bg"><h3>这个月发生的好事情</h3><p>开始坚持晚饭后散步，也主动约了老朋友见面。</p></section><Button className="primary-wide" onClick={soon}><Share2/> 系统分享</Button></>}

function Range({back,range,setRange,go}:{back:()=>void;range:string;setRange:(v:string)=>void;go:(v:View)=>void}){return <><PageHeader title="生成就医报告" subtitle="选择希望汇总的时间范围" onBack={back}/><div className="range-list">{[['1个月','2026年8月'],['3个月','2026年6月–8月'],['半年','2026年3月–8月']].map(x=><button className={range===x[0]?'active':''} key={x[0]} onClick={()=>setRange(x[0])}><span><b>{x[0]}</b><small>{x[1]}</small></span><i>{range===x[0]&&<Check/>}</i></button>)}</div><section className="coverage"><small>数据覆盖情况</small><p>已记录 82 天 · 覆盖 6 个月</p><div>{['3月','4月','5月','6月','7月','8月'].map(x=><span key={x}><i/><small>{x}</small></span>)}</div></section><div className="info-callout">即使没有足够记录，也可以继续生成空模板并手动填写。</div><p className="privacy"><LockKeyhole/>报告只使用你确认保存的数据</p><Button className="primary-wide bottom-button" onClick={()=>go('report')}>预览报告</Button></>}

function Report({back,profile,setProfile,soon}:{back:()=>void;profile:ProfileData;setProfile:(p:ProfileData)=>void;soon:()=>void}){const [edit,setEdit]=useState(false);const [local,setLocal]=useState(profile);const rows=[['出生年份 / 年龄',`${local.birth}年 / 48岁`],['身高','165cm'],['绝经状态','围绝经期'],['是否用药及药物清单','是 · 见详情'],['想解决的问题','潮热、睡眠、情绪'],['既往病史',local.history],['手术史',local.surgery],['过敏史','无'],['孕产史','1次妊娠 1次分娩'],['家族史','母亲：高血压'],['筛查史','乳腺超声（2025.04）']];return <><PageHeader title="就医报告预览" onBack={back} action={<button className="text-action" onClick={()=>setEdit(!edit)}>{edit?'完成':'编辑'}</button>}/><div className="report-range">统计范围　2026年3月–8月</div>{edit?<div className="edit-report"><label htmlFor="report-birth">出生年份<Input id="report-birth" value={local.birth} onChange={e=>setLocal({...local,birth:e.target.value})}/></label><label htmlFor="report-history">既往病史<Input id="report-history" value={local.history} onChange={e=>setLocal({...local,history:e.target.value})}/></label><label htmlFor="report-surgery">手术史<Input id="report-surgery" value={local.surgery} onChange={e=>setLocal({...local,surgery:e.target.value})}/></label><Button className="primary-wide" onClick={()=>{setProfile(local);setEdit(false);toast.add({title:'草稿已保存',type:'success'})}}>保存修改</Button></div>:<><section className="report-section"><h3>基础信息 · 可编辑 <Pencil/></h3>{rows.map(x=><div key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><ChevronRight/></div>)}</section><section className="report-section"><h3>健康记录汇总</h3>{[['月经状态','周期变短，经量减少'],['潮热出汗','平均21次/周，晚间为主'],['睡眠与情绪','睡眠7.2h，情绪整体平稳'],['运动情况','累计运动42天，步数↑']].map(x=><div key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><ChevronRight/></div>)}</section></>}<div className="report-actions"><Button variant="outline" onClick={()=>toast.add({title:'草稿已保存',type:'success'})}>保存草稿</Button><Button onClick={()=>toast.add({title:'PDF 已生成',description:'演示版本已准备好保存或分享。',type:'success'})}>确认并生成 PDF</Button><Button variant="outline" size="icon" onClick={soon}><Share2/></Button></div></>}

function Expression({back,input,setInput,polished,setPolished}:{back:()=>void;input:string;setInput:(v:string)=>void;polished:string;setPolished:(v:string)=>void}){
  const [loading,setLoading]=useState(false);
  const [audience,setAudience]=useState<'伴侣'|'家人'|'朋友'|'同事'|'不指定'>('家人');
  const [recording,setRecording]=useState(false);
  const [speechBusy,setSpeechBusy]=useState(false);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const startedRef=useRef(0);
  const examples=[['表达感受','最近我有些累，希望你能先听我说一会儿。'],['提出请求','如果计划有变化，我希望你能提前告诉我。'],['设定边界','我现在需要一点自己的时间，晚些时候再聊。']] as const;
  const updateInput=(value:string)=>{setInput(value.slice(0,500));if(polished)setPolished('')};
  const organize=async()=>{if(!input.trim())return;setLoading(true);try{setPolished(await services.rephrase.rephrase(input,{audience}));toast.add({title:'已经帮你整理好了',type:'success'})}catch{toast.add({title:'暂时无法整理，请稍后重试',type:'error'})}finally{setLoading(false)}};
  const toggleRecording=async()=>{
    if(recording){recorderRef.current?.stop();return}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){toast.add({title:'当前浏览器不支持录音',type:'error'});return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});const recorder=new MediaRecorder(stream);recorderRef.current=recorder;chunksRef.current=[];startedRef.current=Date.now();
      recorder.ondataavailable=event=>{if(event.data.size)chunksRef.current.push(event.data)};
      recorder.onstop=async()=>{setRecording(false);stream.getTracks().forEach(track=>track.stop());const audio=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});setSpeechBusy(true);try{const transcript=await services.speech.transcribe(audio,Date.now()-startedRef.current,createClientId());if(transcript){updateInput(transcript);toast.add({title:'语音已转成文字',type:'success'})}}catch{toast.add({title:'语音识别失败，请重试',type:'error'})}finally{setSpeechBusy(false)}};
      recorder.start();setRecording(true);
    }catch{toast.add({title:'无法使用麦克风',description:'请允许浏览器访问麦克风',type:'error'})}
  };
  const copy=async()=>{if(!polished)return;try{await navigator.clipboard.writeText(polished);toast.add({title:'已复制，可以去粘贴发送了',type:'success'})}catch{toast.add({title:'复制失败，请长按文本复制',type:'error'})}};
  const share=async()=>{if(!polished)return;if(!navigator.share){await copy();return}try{await navigator.share({text:polished})}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;toast.add({title:'暂时无法分享，请复制后发送',type:'error'})}};
  return <div className="expression-workspace"><PageHeader title="AI 帮我说" subtitle="把难开口的话，整理得温和而清楚" onBack={back}/><div className="expression-progress" aria-label="使用步骤"><span className="active"><i>1</i>说出想法</span><span className={polished?'active':''}><i>2</i>整理表达</span><span><i>3</i>复制发送</span></div><div className="expression-scroll"><section className="expression-compose"><fieldset><legend>你想对谁说？</legend><div className="audience-options">{(['伴侣','家人','朋友','同事','不指定'] as const).map(item=><button type="button" className={audience===item?'active':''} aria-pressed={audience===item} onClick={()=>{setAudience(item);if(polished)setPolished('')}} key={item}>{item}</button>)}</div></fieldset><div className="expression-examples"><b>不知道怎么开始？</b><div>{examples.map(([label,value])=><button type="button" key={label} onClick={()=>updateInput(value)}>{label}</button>)}</div></div><label className="expression-input-label" htmlFor="expression-input"><span>你原本想说的话</span><small>不用组织语言，想到什么就写什么</small></label><div className="textarea-wrap"><Textarea id="expression-input" className="large-textarea" placeholder="例如：我最近身体不太舒服，希望你能多听听我的感受……" value={input} onChange={event=>updateInput(event.target.value)} maxLength={500}/><span>{input.length}/500</span></div><div className="expression-input-actions"><p><LockKeyhole/>仅用于本次表达整理，不会写入健康卡片</p><button type="button" className={recording?'recording':''} onClick={()=>void toggleRecording()} disabled={speechBusy||loading}><Mic/>{speechBusy?'正在转写':recording?'点击结束':'语音输入'}</button></div><Button className="expression-organize" onClick={()=>void organize()} disabled={loading||!input.trim()}><Sparkles/>{loading?'正在整理…':'帮我整理表达'}</Button></section>{polished?<section className="expression-result"><header><div><small>整理完成</small><h3>你可以直接编辑这段话</h3></div><Pencil/></header><Textarea aria-label="整理后的表达" value={polished} onChange={event=>setPolished(event.target.value.slice(0,1000))}/><button type="button" className="regenerate" onClick={()=>void organize()} disabled={loading}><Sparkles/>重新整理一版</button><div className="expression-share-actions"><Button variant="outline" onClick={()=>void copy()}><Copy/>复制</Button><Button onClick={()=>void share()}><Share2/>发送 / 系统分享</Button></div></section>:<section className="expression-empty"><FileText/><div><b>整理后会显示在这里</b><p>AI 会保留事实和你的真实诉求，不替你添加没有说过的内容。</p></div></section>}</div></div>
}

function Achievements({back}:{back:()=>void}){const names=['累计记录100天','累计记录365天','累计记录500天','累计记录1000天','连续记录100天','连续记录365天','连续记录500天','连续记录1000天','累计学习100篇','累计学习500篇','累计学习1000篇','累计学习2000篇'];return <><PageHeader title="我的成就" subtitle="每一次坚持，都值得被看见" onBack={back}/><section className="achievement-count"><Award/><div><b>12 枚成就</b><small>全部等待解锁</small></div></section><div className="badge-grid">{names.map((n,i)=><div className={`badge-item badge-${i<4?'record':i<8?'streak':'study'}`} key={n}><span className="badge-icon">{i<4?<Sprout/>:i<8?<Sun/>:<FileText/>}<LockKeyhole/></span><small>{n}</small></div>)}</div></>}
function Personal({back,profile,prefill,setProfile}:{back:()=>void;profile:ProfileData;prefill:Record<string,string>|null;setProfile:(value:ProfileData)=>void}){const [draft,setDraft]=useState<ProfileData>({birth:prefill?.birthYear??profile.birth,history:prefill?.medicalHistory??profile.history,surgery:prefill?.surgeryHistory??profile.surgery});const [saving,setSaving]=useState(false);const save=async()=>{const year=Number(draft.birth);if(!Number.isInteger(year)||year<1900||year>new Date().getFullYear()){toast.add({title:'请填写正确的出生年份',type:'error'});return}setSaving(true);try{await services.profile.update({birthYear:year,medicalHistory:draft.history.trim(),surgeryHistory:draft.surgery.trim()});setProfile(draft);toast.add({title:'个人资料已保存',type:'success'});back()}catch{toast.add({title:'资料保存失败',type:'error'})}finally{setSaving(false)}};return <><PageHeader title="我的资料" subtitle="这些信息会在咨询与就医报告中安全使用" onBack={back}/>{prefill&&<div className="info-callout">小年已根据对话预填资料，请核对后保存；未保存不会写入账户。</div>}<section className="personal-form editable"><h3>基础资料</h3><label htmlFor="profile-birth"><span>出生年份</span><Input id="profile-birth" type="number" min="1900" max={new Date().getFullYear()} value={draft.birth} onChange={e=>setDraft({...draft,birth:e.target.value})}/></label><label htmlFor="profile-history"><span>既往病史</span><Textarea id="profile-history" value={draft.history} onChange={e=>setDraft({...draft,history:e.target.value.slice(0,1000)})}/></label><label htmlFor="profile-surgery"><span>手术史</span><Textarea id="profile-surgery" value={draft.surgery} onChange={e=>setDraft({...draft,surgery:e.target.value.slice(0,1000)})}/></label></section><p className="privacy"><LockKeyhole/>仅保存在你的账户中，你可以随时修改</p><Button className="primary-wide" disabled={saving} onClick={()=>void save()}>{saving?'保存中…':'保存修改'}</Button></>}
