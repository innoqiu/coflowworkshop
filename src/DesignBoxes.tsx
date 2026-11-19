import React,{useState} from 'react';
import {templates,aiTemplates,answerAt} from './study';
import type {Answer} from './study';
type Kind=Answer['kind'];
export function DesignBoxes({answers,node,remaining,busy,create,use,edit}:{answers:Answer[],node:string,remaining:number,busy:boolean,create:(k:Kind)=>void,use:(key:string,k:Kind)=>void,edit:(a:Answer)=>void}){
 const [opened,setOpened]=useState<Kind|null>(null);
 return <aside className="design-boxes" aria-label="设计卡箱" onKeyDown={e=>{if(e.key==='Escape')setOpened(null)}}>
 {(['交互','AI'] as const).map(kind=>{
 const title=kind==='AI'?'AI功能箱':'交互卡箱',stock=kind==='AI'?aiTemplates:templates;
 return <div key={kind} className={'design-box '+(kind==='AI'?'violet':'amber')+(opened===kind?' expanded':'')}>
 <button className="drawer-tab" aria-expanded={opened===kind} onClick={()=>setOpened(opened===kind?null:kind)}>
 <span className="fan" aria-hidden="true"><i/><i/><i/></span><b>{title}</b><span aria-hidden="true">{opened===kind?'−':'+'}</span></button>
 {opened===kind&&<div className="drawer-body"><button className="new-design" disabled={busy||(kind==='AI'&&!remaining)} onClick={()=>create(kind)}>＋ 添加设计</button>
 {stock.map((text,i)=>{const disabled=busy||answers.some(a=>a.template===text)||(kind==='AI'&&!remaining);return <button className="drawer-card" disabled={disabled} draggable={!disabled} key={text} onDragStart={e=>e.dataTransfer.setData('text/plain',text)} onClick={()=>use(text,kind)}><small>预设 {i+1}</small>{text}</button>})}
 {answers.filter(a=>a.kind===kind).map(a=>{const here=answerAt(a,node);return <div key={a.id} className="drawer-card custom" draggable={!busy&&!here} onDragStart={e=>e.dataTransfer.setData('text/plain',a.id)}>{here&&<small>已放入当前节点</small>}<p>{a.text}</p><button onClick={()=>edit(a)}>编辑</button>{!here&&<button disabled={busy} onClick={()=>use(a.id,kind)}>放入当前节点</button>}</div>})}</div>}
 </div>})}</aside>
}
