import React,{useState} from 'react';
export const solo=location.pathname==='/solo';
export const apiPath=solo?'/solo-api':'/api';
export const scenarios=[
 {id:'office',label:'场景一',title:'轻办公',name:'移动端多源材料整合与视觉图文／汇报编排',story:'帮助阿宝在外出途中汇总微信会议录音、电脑端旧文献与参考海报，结合纸面手绘草图，按老板的模糊反馈快速修改汇报 PPT 与宣传图。',stats:'D1 (34/161) + D5 (18/161) · T2 (14/50) + T3 (12/50)',details:['跨应用调取多张截图与文档（E18、E29、E31、E41、E42），在小屏上指代局部修改区域（T043），区分抠图的前景边缘（W07），将纸面材料转为 PPT 素材（E46）。','确定字号与排版尺度（T066、W29），将老板抽象的审美或风格意见转成可执行修改（T025、T119、T126），串联情节（T114）。'],environment:'手机与平板／电脑模拟环境，相册图库、群聊记录、历史笔记与参考模板。'},
 {id:'health',label:'场景二',title:'健康管家',name:'多模态个人生活与动态行程／健康管家',story:'帮助阿宝拍摄混合餐食与冰箱食材估算热量，结合记录与相册饮食打卡，在聚餐行程临时变化时动态调整减脂食谱与训练方案。',stats:'D6 (21/161) + D8 (7/161) · T5 (3/50)',details:['在混合餐食中分别指代食物与食材（W01、E16），结合时间和地点区分水稻与小麦等相似物件（E26）。','用“一拳、一小碗”描述连续分量既繁琐又不准（T021、E16）。用语音表达个人优先级（T023）、行事风格（T024），整理堆积的事务（E49、T157）。'],environment:'预设餐盘与食材照片、模拟健康数据卡片和日程表，包含不同个人喜好与行程变动。'}
];
export function SceneBox(){
 const [open,setOpen]=useState(false);
 return <aside className={'scene-box-edge theme-0'+(open?' selected':'')} onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
  <button className="scene-box-tab" aria-expanded={open} onClick={()=>setOpen(!open)}><span className="tab-preview" aria-hidden="true">{scenarios.map(s=><span key={s.id}>{s.title}</span>)}</span><span className="tab-mark" aria-hidden="true"/><b>场景箱</b></button>
  <section className="scene-box-panel" aria-hidden={!open}>
   <header><div><small>SCENARIO LIBRARY</small><h2>场景箱</h2></div><button aria-label="关闭场景箱" onClick={()=>setOpen(false)}>×</button></header>
   <div className="scene-box-list">{scenarios.map(s=><article key={s.id} className="scene-library-card"><small>{s.label} · {s.title}</small><h3>{s.name}</h3><p>{s.story}</p><details><summary>查看研究线索</summary><p>{s.stats}</p>{s.details.map(d=><p key={d}>{d}</p>)}<b>实验环境</b><p>{s.environment}</p></details></article>)}</div>
  </section>
 </aside>
}
export function ScenePicker({start,busy}:{start:(id:string)=>void,busy:boolean}){const [turned,set]=useState('');return <div className="picker">{scenarios.map(s=><article key={s.id} className={'scene-option '+s.id+(turned===s.id?' turned':'')}><div className="option-inner"><button className="option-face" inert={turned===s.id} onClick={()=>set(s.id)}><small>{s.label}</small><strong>{s.title}</strong></button><div className="option-face reverse" inert={turned!==s.id}><button className="back-title" aria-label="翻回正面" onClick={()=>set('')}>{s.title}</button><b>{s.name}</b><p>{s.story}</p><button disabled={busy} onClick={()=>start(s.id)}>开始</button></div></div></article>)}</div>}
