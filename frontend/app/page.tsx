'use client';

import { useEffect, useRef, useState } from 'react';
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
import type { HealthDraftItem } from '@/lib/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster, toast } from '@/components/ui/toast';

type View = 'home'|'community'|'messages'|'profile'|'chat'|'health'|'actions'|'month'|'summaries'|'summary'|'range'|'report'|'expression'|'achievements'|'personal';
type ProfileData = { birth: string; history: string; surgery: string };

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
function Screen({children,navActive,onGo}:{children:React.ReactNode;navActive?:View;onGo:(v:View)=>void}){
  return <section className="phone-shell"><StatusBar/><div className="screen-scroll">{children}</div>{navActive&&<NavBar active={navActive} onGo={onGo}/>}</section>;
}

export default function App(){
  const [view,setView]=useState<View>('home');
  const [history,setHistory]=useState<View[]>([]);
  const [healthOpen,setHealthOpen]=useState(false);
  const [healthSelected,setHealthSelected]=useState([true,true]);
  const [dimension,setDimension]=useState('我的潮热');
  const [chart,setChart]=useState(false);
  const [range,setRange]=useState('半年');
  const [profile,setProfile]=useState<ProfileData>({birth:'1978',history:'高血压',surgery:'无'});
  const [expression,setExpression]=useState('我希望你能提前告诉我安排，而不是临时通知。');
  const [polished,setPolished]=useState('我很在意我们的安排。下次如果有变化，希望你能提前告诉我，让我也有准备的时间。');
  const [chatText,setChatText]=useState('');
  const [chatGenerating,setChatGenerating]=useState(false);
  const chatAbortRef=useRef<AbortController|null>(null);
  const [messages,setMessages]=useState([
    {from:'ai',text:'昨晚又醒了几次吗？你可以慢慢说。'},
    {from:'me',text:'醒了三次，还有两次潮热。'},
    {from:'ai',text:'听起来这一晚不太轻松。我整理了一张健康卡片，你可以确认后保存。'},
  ]);
  const [draft,setDraft]=useState<{draftId:string;recordDate:string;items:HealthDraftItem[]}|null>(null);
  const [draftSelected,setDraftSelected]=useState<Record<string,boolean>>({});
  const [demoError,setDemoError]=useState<string|null>(null);
  const conversationRef=useRef<string|null>(null);
  const {session,loading:authLoading}=useSession();
  const realMode=process.env.NEXT_PUBLIC_USE_MOCKS==='false';
  const activeNav:View = ['home','community','messages','profile'].includes(view)?view:'home';
  const go=(next:View)=>{setHistory(h=>[...h,view]);setView(next)};
  const back=()=>{const prev=history.at(-1)||'home';setHistory(h=>h.slice(0,-1));setView(prev)};
  const root=(next:View)=>{setHistory([]);setView(next)};
  const soon=()=>toast.add({title:'敬请期待',description:'这个功能将在后续版本开放。'});
  useEffect(()=>{services.profile.get().then(value=>setProfile({birth:String(value.birthYear??''),history:value.medicalHistory,surgery:value.surgeryHistory})).catch(()=>undefined)},[]);
  useEffect(()=>()=>chatAbortRef.current?.abort(),[]);
  useEffect(()=>{
    if(!realMode||session)return;
    let cancelled=false;
    signInDemo().catch(()=>{if(!cancelled)setDemoError('演示账号暂时不可用，请稍后刷新重试')});
    return ()=>{cancelled=true};
  },[realMode,session]);
  if(realMode&&(authLoading||!session))return <main className="prototype-stage"><Screen navActive="home" onGo={()=>{}}><div style={{padding:'48px 24px',textAlign:'center',color:'var(--muted)'}}>{demoError??'正在进入…'}</div></Screen></main>;
  const sendChat=async()=>{
    const text=chatText.trim();
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
        if(event.type==='health_card_preview'){
          setHealthOpen(true);
          if(Array.isArray(event.data.items)&&event.data.items.length>0){
            setDraft({draftId:event.data.draftId,recordDate:event.data.recordDate,items:event.data.items});
            setDraftSelected(Object.fromEntries(event.data.items.map(item=>[item.clientItemId,true])));
          }
        }
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
    if(view==='chat') return <Chat messages={messages} text={chatText} setText={setChatText} send={sendChat} generating={chatGenerating} stop={()=>chatAbortRef.current?.abort()} back={back} onEditHealth={()=>go('health')}/>;
    if(view==='health') return <HealthCard back={back} onSave={()=>{toast.add({title:'健康记录已保存',type:'success'});back()}}/>;
    if(view==='actions') return <Actions back={back} soon={soon}/>;
    if(view==='month') return <Month back={back} go={go} dimension={dimension} setDimension={setDimension} chart={chart} setChart={setChart} onEditHealth={()=>go('health')}/>;
    if(view==='summaries') return <Summaries back={back} go={go}/>;
    if(view==='summary') return <Summary back={back} soon={soon}/>;
    if(view==='range') return <Range back={back} range={range} setRange={setRange} go={go}/>;
    if(view==='report') return <Report back={back} profile={profile} setProfile={setProfile} soon={soon}/>;
    if(view==='expression') return <Expression back={back} input={expression} setInput={setExpression} polished={polished} setPolished={setPolished}/>;
    if(view==='achievements') return <Achievements back={back}/>;
    return <Personal back={back} soon={soon}/>;
  })();

  return <main className="prototype-stage"><Screen navActive={['home','community','messages','profile'].includes(view)?activeNav:undefined} onGo={root}>{content}</Screen>
    <Dialog open={healthOpen} onOpenChange={setHealthOpen}><DialogContent className="health-dialog"><DialogHeader><DialogTitle>发现一张健康卡片</DialogTitle><DialogDescription>请确认本次对话中提取出的记录，未确认内容不会保存</DialogDescription></DialogHeader>{draft?draft.items.map(item=><label key={item.clientItemId}><input type="checkbox" checked={draftSelected[item.clientItemId]??true} onChange={e=>setDraftSelected(v=>({...v,[item.clientItemId]:e.target.checked}))}/> {draftLabel(item)}</label>):<><label><input type="checkbox" checked={healthSelected[0]} onChange={()=>setHealthSelected(v=>[!v[0],v[1]])}/> 睡眠：夜醒 3 次</label><label><input type="checkbox" checked={healthSelected[1]} onChange={()=>setHealthSelected(v=>[v[0],!v[1]])}/> 潮热：2 次 · 中度</label></>}<Button className="primary-wide" disabled={draft?!Object.values(draftSelected).some(Boolean):!healthSelected.some(Boolean)} onClick={async()=>{setHealthOpen(false);if(draft){const selected=draft.items.filter(item=>draftSelected[item.clientItemId]??true);try{await services.healthCard.confirm(draft.draftId,selected,createClientId());toast.add({title:'健康记录已保存',type:'success'})}catch{toast.add({title:'保存失败，请稍后重试',type:'error'})}setDraft(null)}else{toast.add({title:'健康记录已保存',type:'success'})}}}>确认保存</Button></DialogContent></Dialog><Toaster/></main>;
}

const CATEGORY_NAMES: Record<string,string> = { symptom:'症状', sleep:'睡眠', mood:'情绪', menstrual:'月经', weight:'体重', appetite:'食欲', exercise:'运动', diet:'饮食', medication:'用药', lifeEvent:'生活事件', medicalNeed:'想解决的问题', other:'其他' };
function draftLabel(item:HealthDraftItem){const data=item.data;const name=CATEGORY_NAMES[item.category]??item.category;if(typeof data==='string')return `${name}：${data.slice(0,40)}`;if(!data)return name;const first=Object.entries(data).find(([key])=>key!=='id');if(!first)return name;return `${name}：${String(first[1]??'').slice(0,40)}`;}

function HomeView({go}:{go:(v:View)=>void}){
  const demoActions=[{name:'走起来',Icon:PersonStanding},{name:'睡得好',Icon:Moon}] as const;
  return <>
    <div className="home-heading"><h1>早上好，<br/>今天感觉怎么样？</h1><button className="icon-button" onClick={()=>go('month')}><CalendarDays/></button></div>
    <button type="button" className="hero-card chat-bg" onClick={()=>go('chat')}><div><h2>絮絮叨叨</h2><p>想说什么都可以，我在听</p></div><span className="dark-pill">开始聊聊 <ArrowRight/></span></button>
    <section className="motion-card"><div className="motion-copy"><h2>今天动一动</h2><p>小步动起来，<br/>更年期，更年轻</p></div><button type="button" className="round-arrow" onClick={()=>go('actions')} aria-label="查看全部活动"><ChevronRight/></button><div style={{display:'flex',gap:12,padding:'4px 18px 12px',paddingLeft:30}}>{demoActions.map(({name,Icon})=><button type="button" key={name} onClick={()=>go('actions')} style={{width:72,height:72,borderRadius:16,border:0,outline:'none',background:'var(--surface)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}><Icon/><small style={{color:'var(--muted)'}}>{name}</small></button>)}</div></section>
    <section className="month-card"><h2>这个月的我</h2><div className="metric-grid"><button type="button" onClick={()=>go('month')}><Moon/><b>睡眠</b><strong>7.2<small>小时</small></strong><span>良好</span></button><button type="button" onClick={()=>go('month')}><Smile/><b>心情</b><strong>平稳</strong><span>值得肯定</span></button><button type="button" onClick={()=>go('month')}><Sprout/><b>身体</b><strong>轻盈</strong><span>保持中</span></button></div><div className="month-dates"><span>5/5</span><span>5/15</span><span>5/25</span><span>5/31</span></div></section>
  </>}

function Community({soon}:{soon:()=>void}){return <><div className="top-title"><h1>交流广场</h1><button className="icon-button" onClick={soon}><ShoppingBag/></button></div><button className="searchbar" onClick={soon}><Search/>搜索帖子或话题</button><div className="feed">{posts.map(p=><article className={`post ${p.image?'has-image':''}`} key={p.name}><div className="post-user"><span>{p.emoji}</span><div><b>{p.name}</b><small>{p.time}</small></div></div><div className="post-body"><p>{p.text}</p>{p.image&&<button className="post-image" onClick={soon}>{p.image}</button>}</div><div className="post-actions"><button onClick={soon}><Heart/>{p.likes}</button><button onClick={soon}><MessageCircle/>{p.comments}</button><button onClick={soon}><Star/>收藏</button></div></article>)}</div><button className="fab" onClick={soon}><Plus/></button></>}

function Messages({go,soon}:{go:(v:View)=>void;soon:()=>void}){return <><div className="top-title"><h1>我的消息</h1><button className="icon-button" onClick={soon}><UserPlus/></button></div><section className="expression-card ai-bg"><div><h2>AI 帮我说</h2><p>把难开口的话，<br/>整理成温和而坚定的表达</p></div><div className="expression-modes"><button onClick={()=>go('expression')}><FileText/><span>文字</span></button><button onClick={()=>go('expression')}><Mic/><span>语音</span></button></div><button className="dark-pill" onClick={()=>go('expression')}>开始表达 <ArrowRight/></button></section><div className="notice-grid"><button onClick={soon}><span className="notice-icon blue"><MessageCircle/></span><span><b>评论和@</b><small>3 条新通知</small></span><i>3</i><ChevronRight/></button><button onClick={soon}><span className="notice-icon rose"><Heart/></span><span><b>点赞和收藏</b><small>7 条新通知</small></span><i>7</i><ChevronRight/></button></div><div className="message-list">{[['知心姐姐','回复了你的帖子：我也有同样的感受，一起加油呀～','10:24'],['岁月静好','赞了你的帖子','昨天'],['自在如风','在你的帖子下评论了','昨天']].map(x=><button key={x[0]} onClick={soon}><span className="avatar">{x[0][0]}</span><span><b>{x[0]}</b><small>{x[1]}</small></span><em>{x[2]}</em><ChevronRight/></button>)}</div></>}

function Profile({go,soon}:{go:(v:View)=>void;soon:()=>void}){return <><div className="profile-head"><span className="portrait">林</span><div><h1>林杉</h1><p>拥抱变化，温柔而有力量</p></div><button className="icon-button" onClick={()=>go('personal')}><Pencil/></button></div><button className="achievement-preview" onClick={()=>go('achievements')}><div><h2>我的成就</h2><p>12枚成就 · 等待与你相遇</p></div><span><Award/><LockKeyhole/><LockKeyhole/></span></button><div className="menu-stack"><button onClick={soon}><Star/><span><b>我的收藏</b><small>广场内容与商城商品</small></span><ChevronRight/></button><button onClick={()=>go('personal')}><CircleUserRound/><span><b>我的资料</b><small>检查报告与用药记录</small></span><ChevronRight/></button><button onClick={soon}><Settings/><span><b>设置与隐私</b><small>账号、通知与数据</small></span><ChevronRight/></button></div></>}

  function Chat({messages,text,setText,send,generating,stop,back,onEditHealth}:{messages:{from:string;text:string}[];text:string;setText:(v:string)=>void;send:()=>void;generating:boolean;stop:()=>void;back:()=>void;onEditHealth:()=>void}){return <div className="full-view"><PageHeader title="絮絮叨叨" onBack={back} action={<button className="icon-button" onClick={onEditHealth} aria-label="编辑健康卡片"><Pencil/></button>}/><div className="disclaimer">我会陪你整理感受与记录，但不能替代医生诊断</div><div className="chat-flow" aria-live="polite">{messages.map((m,i)=><div className={`bubble ${m.from}`} key={i}>{m.text||'正在听你说…'}{m.from==='ai'&&m.text&&<button type="button" aria-label="播放语音"><Volume2/></button>}</div>)}</div><div className="chat-composer"><Input value={text} onChange={e=>setText(e.target.value.slice(0,2000))} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),send())} placeholder="说点什么..."/><button type="button" className="mic" onClick={()=>toast.add({title:'正在聆听…',description:'语音输入演示'})}><Mic/></button>{generating?<button type="button" className="send" onClick={stop} aria-label="停止生成"><X/></button>:<button type="button" className="send" onClick={send} disabled={!text.trim()} aria-label="发送"><Send/></button>}</div></div>}

function HealthCard({back,onSave}:{back:()=>void;onSave:()=>void}){const sections=[['身体症状','症状：潮热','发生：是','程度：中','次数：2次','趋势：稳定'],['睡眠与作息','质量：一般','入睡：23:30','起床：06:20','夜醒：3次','详情：醒来心跳快、出汗'],['情绪','类型：负面','情绪词：焦虑、烦躁','诱因：睡眠差、工作压力']];return <><PageHeader title="健康卡片" subtitle="2026年8月29日" onBack={back}/><div className="health-tabs"><button className="active">身体症状</button><button>睡眠与作息</button><button>情绪</button><button>月经与出血</button><button>其他</button></div>{sections.map(s=><section className="form-section" key={s[0]}><h3>{s[0]}<button>＋ 添加一条</button></h3>{s.slice(1).map((x,i)=><button className="form-row" key={x}>{x}<span>{i===2&&s[0]==='身体症状'?<em className="level-control"><i/>轻 <i className="active"/>中 <i/>重</em>:i===0&&s[0]==='情绪'?<em className="mood-control">正面　<b>负面</b></em>:<ChevronRight/>}</span></button>)}</section>)}<div className="other-health-grid">{['月经与出血','体重与食欲','运动与活动','饮食与饮品','用药提及','生活事件与社交','就医诉求','其他'].map(x=><button key={x}>{x}<ChevronRight/></button>)}</div><div style={{position:'sticky',bottom:0,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'10px 0 12px',marginTop:16,background:'linear-gradient(transparent,#fcfbf8 30%)'}}><button type="button" onClick={back} style={{height:47,borderRadius:24,border:0,outline:'none',background:'transparent',color:'var(--muted)',fontSize:15}}>取消</button><button type="button" onClick={onSave} style={{height:47,borderRadius:24,border:0,outline:'none',background:'#a1ad90',color:'#fff',fontSize:15}}>保存</button></div></>}

function Actions({back,soon}:{back:()=>void;soon:()=>void}){return <><PageHeader title="今天动一动" subtitle="从你愿意的地方开始" onBack={back}/><div className="action-hero menopause-bg"><div><b>散步 <small>20 分钟</small></b><b>睡前舒展 <small>8 分钟</small></b></div><p>根据你最近的记录为你整理</p></div><h2 className="section-title">查看全部</h2><div className="category-list">{categories.map(([name,desc,Icon])=><button key={name} onClick={soon}><Icon/><span><b>{name}</b><small>{desc}</small></span><ChevronRight/></button>)}</div><p className="footnote">建议仅作日常参考，身体不适时请暂停</p></>}

function Month({back,go,dimension,setDimension,chart,setChart,onEditHealth}:{back:()=>void;go:(v:View)=>void;dimension:string;setDimension:(v:string)=>void;chart:boolean;setChart:(v:boolean)=>void;onEditHealth:()=>void}){const dims=['我的睡眠','我的潮热','我的心情','我的运动'];return <><PageHeader title="这个月的我" onBack={back} action={<><button className="icon-button" onClick={onEditHealth} aria-label="编辑健康卡片"><Pencil/></button><button className="view-toggle" onClick={()=>setChart(!chart)}>{chart?<Waves/>:<CalendarDays/>}<span>{chart?'曲线':'日历'}</span><small>⌄</small></button></>}/><div className="month-switch"><button>‹</button><b>2026年8月</b><button>›</button></div><div className="segmented">{dims.map(d=><button key={d} className={dimension===d?'active':''} onClick={()=>setDimension(d)}>{d}</button>)}</div>{chart?<Trend dimension={dimension}/>:<Calendar dimension={dimension}/>}<section className="month-summary monthly-bg"><h3>本月最佳今天</h3><div><span><small>已记录</small><b>18天</b></span><span><small>心情愉快</small><b>12天</b></span><span><small>潮热</small><b>21次</b></span><span><small>运动</small><b>7天</b></span></div></section><div className="month-links"><button onClick={()=>go('summaries')}><FileText/>月度总结</button><button onClick={()=>go('range')}><ClipboardPlus/>就医报告</button></div></>}
function Calendar({dimension}:{dimension:string}){return <div className="calendar"><div className="week">{['一','二','三','四','五','六','日'].map(x=><b key={x}>{x}</b>)}</div><div className="days">{Array.from({length:35},(_,i)=>{const n=i<4?28+i:i-3;const tone=n%3===0?'heavy':n%2===0?'medium':'light';const isToday=i===32;return <button key={i} className={`${i<4?'muted':''} ${isToday?'today':''}`}><span>{n>31?n-31:n}</span>{[5,8,11,13,17,20,22,24,28].includes(n)&&<i className={tone}/>} {isToday&&<em className="day-popover"><b>8月29日</b><span>潮热　2次 · 中度</span></em>}</button>})}</div><div className="legend">当前查看：{dimension}　 <i className="light"/>轻　<i className="medium"/>中　<i className="heavy"/>重</div></div>}
function Trend({dimension}:{dimension:string}){return <div className="trend-panel"><svg viewBox="0 0 320 150" aria-label={`${dimension}月度趋势`}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c6cdb9" stopOpacity=".36"/><stop offset="1" stopColor="#c6cdb9" stopOpacity="0"/></linearGradient></defs><path className="trend-area" d="M10 118 C45 112 62 76 92 83 S135 118 166 84 S218 45 252 68 S292 47 312 31 L312 145 L10 145 Z"/><path className="trend-stroke" d="M10 118 C45 112 62 76 92 83 S135 118 166 84 S218 45 252 68 S292 47 312 31"/><circle cx="312" cy="31" r="6"/></svg><div className="trend-labels"><span>8/1</span><span>8/8</span><span>8/15</span><span>8/22</span><span>8/29</span></div><p>{dimension}整体较上月更平稳</p></div>}

function Summaries({back,go}:{back:()=>void;go:(v:View)=>void}){return <><PageHeader title="月度总结" subtitle="回看每一段真实的变化" onBack={back}/><h3 className="year">2026年</h3><div className="summary-list">{[['8月','睡眠更稳定，潮热记录趋于平缓'],['7月','作息更规律，心情整体更平稳'],['6月','潮热次数减少，夜间睡眠改善'],['5月','记录逐渐稳定，开始建立节奏']].map((x,i)=><button key={x[0]} className={i===0?'new':''} onClick={()=>go('summary')}><b>{x[0]}{i===0&&<i>新总结</i>}</b><p>{x[1]}</p><ChevronRight/></button>)}</div><p className="footnote">总结来自你确认保存的记录</p></>}
function Sparkline({tone}:{tone:string}){return <svg className="sparkline" viewBox="0 0 130 34" aria-hidden="true"><path d="M2 25 C18 27 25 7 42 12 S63 29 78 18 S103 5 128 11"/><circle cx="128" cy="11" r="4" fill={tone}/></svg>}
function Summary({back,soon}:{back:()=>void;soon:()=>void}){const insights=[['睡眠','平均睡眠7.2小时，夜间醒来次数减少。','#99aa8e'],['潮热','潮热频次较上月下降约19%。','#d49b9c'],['心情','情绪总体平稳，积极情绪占比提升。','#dfb77e'],['运动','运动更有规律，累计运动7天。','#98b4bf']];return <><PageHeader title="2026年 8月总结" onBack={back} action={<button className="icon-button" onClick={soon}><Share2/></button>}/><section className="overview"><h3>月度概览</h3><div className="petal-chart">{[['记录','18天'],['睡眠','7.2h'],['潮热','21次'],['运动','7天']].map((x,i)=><span className={`petal p${i+1}`} key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></span>)}<i className="petal-center"/></div></section><div className="insight-grid">{insights.map(x=><section key={x[0]}><b>{x[0]}</b><p>{x[1]}</p><Sparkline tone={x[2]}/></section>)}</div><section className="good-things monthly-bg"><h3>这个月发生的好事情</h3><p>开始坚持晚饭后散步，也主动约了老朋友见面。</p></section><Button className="primary-wide" onClick={soon}><Share2/> 系统分享</Button></>}

function Range({back,range,setRange,go}:{back:()=>void;range:string;setRange:(v:string)=>void;go:(v:View)=>void}){return <><PageHeader title="生成就医报告" subtitle="选择希望汇总的时间范围" onBack={back}/><div className="range-list">{[['1个月','2026年8月'],['3个月','2026年6月–8月'],['半年','2026年3月–8月']].map(x=><button className={range===x[0]?'active':''} key={x[0]} onClick={()=>setRange(x[0])}><span><b>{x[0]}</b><small>{x[1]}</small></span><i>{range===x[0]&&<Check/>}</i></button>)}</div><section className="coverage"><small>数据覆盖情况</small><p>已记录 82 天 · 覆盖 6 个月</p><div>{['3月','4月','5月','6月','7月','8月'].map(x=><span key={x}><i/><small>{x}</small></span>)}</div></section><div className="info-callout">即使没有足够记录，也可以继续生成空模板并手动填写。</div><p className="privacy"><LockKeyhole/>报告只使用你确认保存的数据</p><Button className="primary-wide bottom-button" onClick={()=>go('report')}>预览报告</Button></>}

function Report({back,profile,setProfile,soon}:{back:()=>void;profile:ProfileData;setProfile:(p:ProfileData)=>void;soon:()=>void}){const [edit,setEdit]=useState(false);const [local,setLocal]=useState(profile);const rows=[['出生年份 / 年龄',`${local.birth}年 / 48岁`],['身高','165cm'],['绝经状态','围绝经期'],['是否用药及药物清单','是 · 见详情'],['想解决的问题','潮热、睡眠、情绪'],['既往病史',local.history],['手术史',local.surgery],['过敏史','无'],['孕产史','1次妊娠 1次分娩'],['家族史','母亲：高血压'],['筛查史','乳腺超声（2025.04）']];return <><PageHeader title="就医报告预览" onBack={back} action={<button className="text-action" onClick={()=>setEdit(!edit)}>{edit?'完成':'编辑'}</button>}/><div className="report-range">统计范围　2026年3月–8月</div>{edit?<div className="edit-report"><label>出生年份<Input value={local.birth} onChange={e=>setLocal({...local,birth:e.target.value})}/></label><label>既往病史<Input value={local.history} onChange={e=>setLocal({...local,history:e.target.value})}/></label><label>手术史<Input value={local.surgery} onChange={e=>setLocal({...local,surgery:e.target.value})}/></label><Button className="primary-wide" onClick={()=>{setProfile(local);setEdit(false);toast.add({title:'草稿已保存',type:'success'})}}>保存修改</Button></div>:<><section className="report-section"><h3>基础信息 · 可编辑 <Pencil/></h3>{rows.map(x=><div key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><ChevronRight/></div>)}</section><section className="report-section"><h3>健康记录汇总</h3>{[['月经状态','周期变短，经量减少'],['潮热出汗','平均21次/周，晚间为主'],['睡眠与情绪','睡眠7.2h，情绪整体平稳'],['运动情况','累计运动42天，步数↑']].map(x=><div key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><ChevronRight/></div>)}</section></>}<div className="report-actions"><Button variant="outline" onClick={()=>toast.add({title:'草稿已保存',type:'success'})}>保存草稿</Button><Button onClick={()=>toast.add({title:'PDF 已生成',description:'演示版本已准备好保存或分享。',type:'success'})}>确认并生成 PDF</Button><Button variant="outline" size="icon" onClick={soon}><Share2/></Button></div></>}

function Expression({back,input,setInput,polished,setPolished}:{back:()=>void;input:string;setInput:(v:string)=>void;polished:string;setPolished:(v:string)=>void}){const [loading,setLoading]=useState(false);const organize=async()=>{if(!input.trim())return;setLoading(true);try{setPolished(await services.rephrase.rephrase(input));toast.add({title:'已为你温和整理',type:'success'})}catch{toast.add({title:'暂时无法整理，请稍后重试',type:'error'})}finally{setLoading(false)}};return <><PageHeader title="AI 帮我说" subtitle="把难开口的话，整理得温和而坚定" onBack={back}/><div className="expression-mini ai-bg"><button type="button"><FileText/><span>文字</span></button><button type="button" onClick={()=>toast.add({title:'正在聆听…'})}><Mic/><span>语音</span></button></div><div className="textarea-wrap"><Textarea className="large-textarea" value={input} onChange={e=>setInput(e.target.value.slice(0,500))} maxLength={500}/><span>{input.length}/500</span></div><div className="organize-row"><Button className="dark-wide" onClick={organize} disabled={loading||!input.trim()}>{loading?'正在整理…':'帮我整理'} <ArrowRight/></Button></div><section className="polished"><h3>表达预览 · 可编辑 <Pencil/></h3><Textarea value={polished} onChange={e=>setPolished(e.target.value)}/></section><div className="share-options"><button type="button" onClick={organize}><Sparkles/>重新整理</button><button type="button" onClick={async()=>{await navigator.clipboard?.writeText(polished);toast.add({title:'已复制',type:'success'})}}><Copy/>复制</button><button type="button" onClick={()=>navigator.share?navigator.share({text:polished}):toast.add({title:'已打开分享演示'})}><Share2/>系统分享</button></div></>}

function Achievements({back}:{back:()=>void}){const names=['累计记录100天','累计记录365天','累计记录500天','累计记录1000天','连续记录100天','连续记录365天','连续记录500天','连续记录1000天','累计学习100篇','累计学习500篇','累计学习1000篇','累计学习2000篇'];return <><PageHeader title="我的成就" subtitle="每一次坚持，都值得被看见" onBack={back}/><section className="achievement-count"><Award/><div><b>12 枚成就</b><small>全部等待解锁</small></div></section><div className="badge-grid">{names.map((n,i)=><div className={`badge-item badge-${i<4?'record':i<8?'streak':'study'}`} key={n}><span className="badge-icon">{i<4?<Sprout/>:i<8?<Sun/>:<FileText/>}<LockKeyhole/></span><small>{n}</small></div>)}</div></>}
function Personal({back,soon}:{back:()=>void;soon:()=>void}){return <><PageHeader title="我的资料" subtitle="这些信息会在生成就医报告时自动带入" onBack={back}/><section className="personal-form"><h3>基础资料</h3><button type="button" className="personal-field" onClick={soon}><span>出生年份</span><b>1978</b><ChevronRight/></button><button type="button" className="personal-field" onClick={soon}><span>既往病史</span><b>高血压史</b><ChevronRight/></button><button type="button" className="personal-field" onClick={soon}><span>手术史</span><b>无</b><ChevronRight/></button></section><p className="privacy"><LockKeyhole/>资料编辑功能敬请期待</p><h3 className="section-title">其他服务</h3><div className="menu-stack disabled"><button onClick={soon}><FileText/><span><b>上传检查报告</b><small>敬请期待</small></span><ChevronRight/></button><button onClick={soon}><ClipboardPlus/><span><b>药物管理</b><small>敬请期待</small></span><ChevronRight/></button></div></>}
