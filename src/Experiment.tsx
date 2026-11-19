import {apiPath,solo,ScenePicker} from './Scenarios';
import React, { useState, useEffect, useRef } from "react";
import { SolutionCanvas } from "./SolutionCanvas";
import { presets, templates,aiTemplates,answerAt,answerNodes } from "./study";
import type { Scene, Study, Answer, Rating } from "./study";
type Packet = {
  s: Study;
  own: Scene;
  target: Scene | null;
  library: Scene[];
  incoming: { id: string; answers: Answer[]; sample?: boolean; modified: boolean }[];
};
const labels = ["查看我已发布的场景", "预设场景练习", "选择别人场景"];
export function Experiment({ refine }: { refine: () => void }) {
  const [packet, set] = useState<Packet | null>(null),
    [tab, T] = useState(1),
    [preview, P] = useState(0),
    [err, E] = useState(""),
    [busy, B] = useState(false),
    [edit, D] = useState<Answer | null>(null),
    [help, H] = useState(false),
    [practicePrompt,setPracticePrompt]=useState(false),
    [reviewing,setReviewing]=useState("");
  const [positions,setPositions]=useState<Record<string,number>>({});
  const lock = useRef(false);
  const active = (step: number) =>
    step === 2 || step === 3 ? 1 : step === 4 ? 2 : 0;
  async function request(action?: string, body: object = {}) {
    if (lock.current) return;
    lock.current = true;
    B(true);
    const previousStep=packet?.s.step;
    try {
      const r = await fetch(
        apiPath+"/study",
        action
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action,
                revision: packet?.s.revision,
                ...body,
              }),
            }
          : {},
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      set(data);
      if (!packet || packet.s.step !== data.s.step) T(active(data.s.step));
      if(action==='submit'&&previousStep===3&&data.s.step===35)setPracticePrompt(true);
      E("");
      return true;
    } catch (e) {
      E((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      B(false);
    }
  }
  useEffect(() => {
    void request();
  }, []);
  const step = packet?.s.step;
  useEffect(() => {
    if ((step !== 4 || packet?.target) && (step !== 5 || packet?.incoming.length)) return;
    const timer = setInterval(() => void request(), 3000);
    return () => clearInterval(timer);
  }, [packet]);
  if (!packet)
    return (
      <main className="study">
        <p>{err || "正在打开实验画布…"}</p>
        {err && <button onClick={() => request()}>重试</button>}
      </main>
    );
  const { s, own, target, incoming, library } = packet;
  const scene =
    tab === 0
      ? own
      : tab === 2
        ? target
        : s.preset
          ? presets.find((x) => x.id === s.preset)!
          : presets[preview];
  const answers = tab === 1 ? s.practice : s.peer,
    solving =
      (step === 3 && tab === 1) || (step === 4 && tab === 2 && !!target),
    limit = tab === 1 ? 3 : 2,
    remaining = limit - answers.filter((a) => a.kind === "AI").length,
    solvedNodes=scene?.nodes.filter(n=>answers.some(a=>answerAt(a,n.id))).length||0;
  function draft(node: string, kind: Answer["kind"], template = "") {
    D({
      node,
      nodes: kind === "交互" ? (node ? [node] : []) : undefined,
      kind,
      id: crypto.randomUUID(),
      text: template,
      io: "",
      detail: "",
      links: [],
      template,
    });
  }
  function persist(list: Answer[], modified = false) {
    return request("answers", {
      modified,
      answers: list.map((c) => ({
        ...c,
        links: c.links.filter((id) =>
          list.some(
            (x) => x.id === id && answerAt(x,c.node) && x.kind === "交互",
          ),
        ),
      })),
    });
  }
  const position=positions[String(tab)]||0;
  const node=scene?.nodes[position];
  const selectedSubmission=incoming.find(item=>item.id===reviewing)||null;
  const reviewStage=tab===0&&(step===5||step===6);
  const completedReviews=(submission:Packet["incoming"][number])=>own.nodes.filter(n=>{
    const value=s.reviews[submission.id+"/"+n.id];
    return typeof value?.score==="number"&&Boolean(value.comment.trim());
  }).length;
  const allReviewsComplete=incoming.length>0&&incoming.every(item=>completedReviews(item)===own.nodes.length);
  function place(id:string,kind:Answer['kind']){
    if(!solving||!node||busy)return;
    const existing=answers.find(a=>a.id===id);
    if(existing){
      if(existing.kind!==kind)return;
      if(kind==='交互'){
        const nodes=Array.from(new Set([...answerNodes(existing),node.id]));
        void persist(answers.map(a=>a.id===id?{...a,node:a.node||node.id,nodes}:a));
      }else void persist(answers.map(a=>a.id===id?{...a,node:node.id}:a));
      return;
    }
    if(!(kind==='AI'?aiTemplates:templates).includes(id)||answers.some(a=>a.template===id)||(kind==='AI'&&!remaining))return;
    void persist([...answers,{id:crypto.randomUUID(),kind,node:node.id,nodes:kind==='交互'?[node.id]:undefined,text:id,template:id,io:'',detail:'',links:[]}]);
  }
  function drop(e:React.DragEvent,kind:Answer['kind']){e.preventDefault();place(e.dataTransfer.getData('text/plain'),kind)}
  async function restartSolo(){
    if(!confirm('重新开始会清除这次单人测试的全部卡片和批阅，确定继续吗？'))return;
    const response=await fetch(apiPath+'/reset',{method:'POST'});
    if(!response.ok){const data=await response.json();E(data.error||'无法重新开始');return}
    Object.keys(localStorage).filter(key=>key.startsWith('workshop-')).forEach(key=>localStorage.removeItem(key));
    location.href='/solo';
  }
  return (
    <main className="study">
      <nav>{solo&&<><a href="/">退出单人测试</a><button onClick={restartSolo}>重新开始</button></>}
        {labels.map((l, i) => (
          <button
            key={l}
            aria-pressed={i === tab}
            disabled={i === 2 && !s.own}
            onClick={() => {T(i);if(i===0)setReviewing("")}}
          >
            {l}
          </button>
        ))}
      </nav>
      {solving&&scene&&<aside className="solution-submit-floating"><span>{solvedNodes} / {scene.nodes.length} 个困难已有方案</span><button className="primary" disabled={busy||solvedNodes<scene.nodes.length} onClick={()=>request("submit",{answers})}>提交解法</button></aside>}
      {err && <p role="alert">{err}</p>}
      {reviewStage&&incoming.length>0&&!selectedSubmission ? <SubmissionPicker scene={own} submissions={incoming} reviews={s.reviews} step={step} busy={busy} select={setReviewing} complete={()=>request("complete",{reviews:s.reviews})} canComplete={allReviewsComplete}/> : tab===1&&step===2 ? <ScenePicker busy={busy} start={id=>request('choose',{id})}/> : tab===2&&step===4&&!target ? (
        <PeerLibrary scenes={library} busy={busy} select={(id)=>request('select',{id})}/>
      ) : !scene ? (
        <p>场景库中还没有其他人发布的题目，页面会自动刷新。</p>
      ) : (
        <section key={tab + "-" + scene.id}>
          {tab===0&&selectedSubmission&&<button className="review-back" onClick={()=>setReviewing("")}>返回方案列表</button>}
          <h1>{scene.title}</h1>
          {solving ? <SolutionCanvas scene={scene} answers={answers} position={position} setPosition={(next)=>setPositions({...positions,[tab]:next})} remaining={remaining} busy={busy} draft={draft} drop={drop} place={place} edit={(answer)=>D(answer)}/> : <div>
          {scene.nodes.map((n, i) => (
            <article className="study-node" key={n.id}>
              <header>
                <small>困难 {i + 1}</small>
                <h2>{n.title}</h2>
                <p>{n.background}</p>
                <p>{n.definition}</p>
                {n.materials.length > 0 && (
                  <small>材料 · {n.materials.join("、")}</small>
                )}
              </header>
              {tab !== 0 &&
                (["交互", "AI"] as const).map((kind) => (
                  <div
                    className={"track " + (kind === "AI" ? "ai" : "")}
                    key={kind}
                    onDragOver={(e) => solving && e.preventDefault()}
                    onDrop={(e) => solving && drop(e, kind)}
                  >
                    <b>{kind === "AI" ? "AI 功能轨" : "交互方案轨"}</b>
                    {answers
                      .filter((a) => answerAt(a,n.id) && a.kind === kind)
                      .map((a) => (
                        <button
                          key={a.id}
                          disabled={!solving}
                          draggable={solving}
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", a.id)
                          }
                          onClick={() => D({ ...a })}
                        >
                          {a.text}
                          {a.io && <small>{a.io}</small>}
                          {a.links.length > 0 && (
                            <small>
                              配合{" "}
                              {a.links
                                .map(
                                  (id) =>
                                    answers.find((x) => x.id === id)?.text,
                                )
                                .join("、")}
                            </small>
                          )}
                        </button>
                      ))}
                    {solving && (
                      <button
                        disabled={busy || (kind === "AI" && !remaining)}
                        onClick={() => draft(n.id, kind)}
                      >
                        ＋ 添加
                      </button>
                    )}
                  </div>
                ))}
              {tab === 0 && selectedSubmission &&
                [selectedSubmission].map((r) => (
                  <Review
                    key={r.id}
                    node={n.id}
                    solver={r.id}
                    sample={r.sample}
                    cards={r.answers.filter((a) => answerAt(a,n.id))}
                    value={s.reviews[r.id + "/" + n.id]}
                    editable={step === 5 && !busy}
                    save={(v) =>
                      request("review", {
                        reviews: { ...s.reviews, [r.id + "/" + n.id]: v },
                      })
                    }
                  />
                ))}
            </article>
          ))}
          </div>}
          <div className="actions">
            {step === 35 && tab === 0 && (
              <p>发布后，同场参与者将看到这些场景、困难和材料。</p>
            )}
            {step === 2 && own.nodes.length < 4 && (
              <button onClick={refine}>补足四个困难节点</button>
            )}
            {step === 35 && tab === 0 && (
              <>
                <button onClick={refine}>修改我的场景</button>
                <button disabled={busy} onClick={() => request("publish")}>
                  定稿并发布给同伴
                </button>
              </>
            )}
            {step === 5 && tab === 0 && !incoming.length && <p>等待同伴提交解法，提交后可在这里批阅。</p>}
            {step === 6 && tab === 0 && <strong>实验已完成</strong>}
          </div>
        </section>
      )}
      <button
        className="study-orb"
        aria-label="阶段帮助"
        onClick={() => H(!help)}
      >
        ••
      </button>
      {help && (
        <p className="study-help">
          {
            (
              {
                2: "浏览两个预设场景，选择一个解题。",
                3: "每个困难至少放一张解法卡，可拖动卡片调整归属。",
                35: "回看自己的题目，修改后定稿。",
                4: "针对同伴的每个困难设计解法。",
                5: "为每个困难评分，勾选有效卡片并留下评语。",
                6: "本轮已结束。",
              } as Record<number, string>
            )[s.step]
          }
        </p>
      )}
      {practicePrompt&&<div className="modal reflection-modal" onClick={()=>setPracticePrompt(false)}>
        <section className="paper" role="dialog" aria-modal="true" aria-labelledby="reflection-title" onClick={e=>e.stopPropagation()}>
          <small>预设练习完成</small>
          <h2 id="reflection-title">现在回看自己的困难场景，你有新的想法吗？</h2>
          <p>你可以先修改自己的场景与困难，也可以保留当前版本并继续发布。</p>
          <div className="actions"><button onClick={()=>{setPracticePrompt(false);T(0);refine()}}>有，返回画布修改</button><button className="primary" onClick={()=>{setPracticePrompt(false);T(0)}}>暂时没有，继续发布</button></div>
        </section>
      </div>}
      {edit && scene && (
        <div className="modal">
          <form
            className={
              "paper study-editor kind-" + (edit.kind === "AI" ? 4 : 3)
            }
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await persist([
                  ...answers.filter((a) => a.id !== edit.id),
                  edit,
                ],answers.some((a)=>a.id===edit.id))
              )
                D(null);
            }}
          >
            <h2>{edit.kind}卡</h2>
            {edit.kind==='AI'?<label>
              对应困难
              <select value={edit.node} onChange={(e) => D({ ...edit, node: e.target.value, links: [] })}>
                <option value="">保存在卡箱</option>
                {scene.nodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
              </select>
            </label>:<fieldset className="node-placement"><legend>放入困难节点（可多选）</legend>
              {scene.nodes.map(n=><label key={n.id}><input type="checkbox" checked={answerAt(edit,n.id)} onChange={e=>{const next=e.target.checked?Array.from(new Set([...answerNodes(edit),n.id])):answerNodes(edit).filter(id=>id!==n.id);D({...edit,node:next[0]||'',nodes:next})}}/>{n.title}</label>)}
            </fieldset>}
            <label>
              {edit.kind === "AI" ? "AI 功能名称" : "交互名称"}
              <textarea
                autoFocus
                required
                placeholder={edit.kind === "AI" ? "明确为 AI 新增的一项具体功能（注：请勿写“提升理解力/更聪明”等万能词。例：文献全文阅读与候选提示词推荐）" : "为你设计的组件或手势起个名字（例：双指外划选中同类 / 侧边记忆库拖拽归档）"}
                value={edit.text}
                onChange={(e) => D({ ...edit, text: e.target.value })}
              />
            </label>
            <label>
              {edit.kind === "AI" ? "AI 处理逻辑" : "操作方式与反馈"}
              <textarea
                required
                placeholder={edit.kind === "AI" ? "AI 接收了什么材料或数据，在底层自动做了什么识别、分析或生成？（例：AI 自动通读上传的文献全文，结合上下文提炼出几个可调的修改方向和替换词）" : "用户在界面上怎么操作（点按/拖拽/滑动/涂抹）？界面会出现什么变化？（注：请设计纯交互方式，勿包含 AI 能力。例：食指按住一张图，中指向外划动，同类图片同时高亮选中）"}
                value={edit.io}
                onChange={(e) => D({ ...edit, io: e.target.value })}
              />
            </label>
            <label>
              {edit.kind === "AI" ? "输出与交互配合" : "设计意图与效果"}
              <textarea
                required
                placeholder={edit.kind === "AI" ? "AI 最终输出什么结果？如何与你的交互卡配合解决问题？（例：输出候选提示词标签或自动勾选好的文件列表，供用户在交互卡上直接微调确认）" : "这个交互如何帮用户省力或选得更准？如果配合 AI 卡使用，它向 AI 传递了什么？（例：省去逐张翻找勾选，将圈定的目标图片集合直接传给下一步）"}
                value={edit.detail || ""}
                onChange={(e) => D({ ...edit, detail: e.target.value })}
              />
            </label>
            {edit.kind === "AI" &&
              answers
                .filter((a) => answerAt(a,edit.node) && a.kind === "交互")
                .map((a) => (
                  <label key={a.id}>
                    <input
                      type="checkbox"
                      checked={edit.links.includes(a.id)}
                      onChange={(e) =>
                        D({
                          ...edit,
                          links: e.target.checked
                            ? [...edit.links, a.id]
                            : edit.links.filter((id) => id !== a.id),
                        })
                      }
                    />
                    配合 {a.text}
                  </label>
                ))}
            {err && <p role="alert">{err}</p>}
            <div className="actions">
              <button disabled={busy}>保存</button>
              <button type="button" onClick={() => D(null)}>
                取消
              </button>
              {answers.some((a) => a.id === edit.id) && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await persist(answers.filter((a) => a.id !== edit.id),true))
                      D(null);
                  }}
                >
                  删除
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
function SubmissionPicker({scene,submissions,reviews,step,busy,select,complete,canComplete}:{scene:Scene;submissions:Packet["incoming"];reviews:Record<string,Rating>;step:number;busy:boolean;select:(id:string)=>void;complete:()=>Promise<unknown>;canComplete:boolean}){
  return <section className="submission-picker" aria-labelledby="submission-picker-title">
    <header><small>RETURNED SOLUTIONS</small><h1 id="submission-picker-title">选择一份方案进行批阅</h1><p>你的场景共收到 {submissions.length} 份方案。先查看每份方案的概览，再选择一位参与者进入逐节点批阅。</p></header>
    <div className="submission-grid">{submissions.map((submission,index)=>{
      const done=scene.nodes.filter(node=>{const value=reviews[submission.id+"/"+node.id];return typeof value?.score==="number"&&Boolean(value.comment.trim())}).length;
      const interactionCount=submission.answers.filter(answer=>answer.kind==="交互").length;
      const aiCount=submission.answers.filter(answer=>answer.kind==="AI").length;
      return <article className="submission-card" key={submission.id}>
        <div className="submission-card-top"><small>{submission.sample?"单人测试示例":"返回方案"} {String(index+1).padStart(2,"0")}</small><span className={submission.modified?"modified":"original"}>{submission.modified?"经历过修改":"未经历修改"}</span></div>
        <h2>参与者 {submission.id}</h2>
        <p className="submission-counts">交互卡 {interactionCount} 张 · AI 卡 {aiCount} 张 · 已批阅 {done}/{scene.nodes.length}</p>
        <ol>{scene.nodes.map((node,nodeIndex)=>{
          const cards=submission.answers.filter(answer=>answerAt(answer,node.id));
          return <li key={node.id}><span>{String(nodeIndex+1).padStart(2,"0")}</span><div><b>{node.title}</b><p>{cards.length?cards.map(card=>card.text).join("、"):"未提交该节点方案"}</p></div></li>
        })}</ol>
        <button className="primary" onClick={()=>select(submission.id)}>{step===6?"查看方案":"查看并批阅"}</button>
      </article>
    })}</div>
    {step===5&&<div className="submission-complete"><p>{canComplete?"所有返回方案均已完成逐节点批阅。":"完成所有方案的评分与评语后，才能结束本轮批阅。"}</p><button className="primary" disabled={busy||!canComplete} onClick={()=>void complete()}>完成全部批阅</button></div>}
    {step===6&&<strong className="submission-finished">实验已完成</strong>}
  </section>
}
function PeerLibrary({scenes,busy,select}:{scenes:Scene[];busy:boolean;select:(id:string)=>Promise<unknown>}){
  return <section className="peer-library" aria-labelledby="peer-library-title"><header><small>COMMUNITY SCENES</small><h1 id="peer-library-title">选择一位同事的场景</h1><p>每张卡片都是一组已发布的考题。打开查看困难概览，再选择你想解决的场景。</p></header>
    {scenes.length?<div className="peer-library-grid">{scenes.map((scene,index)=><article className="peer-scene" key={scene.id}><small>同事场景 {String(index+1).padStart(2,'0')}</small><h2>{scene.title}</h2><p>{scene.nodes.length} 个困难节点</p><details><summary>查看困难概览</summary><ol>{scene.nodes.map(node=><li key={node.id}><b>{node.title}</b><span>{node.definition}</span></li>)}</ol></details><button className="primary" disabled={busy} onClick={()=>select(scene.id)}>选择这个场景</button></article>)}</div>:<div className="peer-library-empty"><span>⌁</span><h2>等待同事发布场景</h2><p>有新题目时会自动出现在这里。</p></div>}
  </section>
}
function Review({
  node,
  solver,
  sample,
  cards,
  value,
  editable,
  save,
}: {
  node: string;
  solver: string;
  sample?: boolean;
  cards: Answer[];
  value?: Rating;
  editable: boolean;
  save: (v: Rating) => Promise<unknown>;
}) {
  const [v, V] = useState<Rating>(
    value || { score: null, comment: "", accepted: [] },
  );
  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(v);
      }}
    >
      <b>{sample?'示例批阅 · ':''}同伴 {solver} 的方案</b>
      {sample&&<p className="review-sample-note">这是一份单人测试示例提交，可按真实批阅流程逐节点评分和评价。</p>}
      {cards.map((c) => (
        <label key={c.id}>
          <input
            disabled={!editable}
            type="checkbox"
            checked={v.accepted.includes(c.id)}
            onChange={(e) =>
              V({
                ...v,
                accepted: e.target.checked
                  ? [...v.accepted, c.id]
                  : v.accepted.filter((id) => id !== c.id),
              })
            }
          />
          采纳 · {c.kind} · {c.text} {c.io} {c.detail || ""}{" "}
          {c.links.map((id) => cards.find((x) => x.id === id)?.text).join("、")}
        </label>
      ))}
      <label className="score-field">成效评分 <span>{v.score??'—'} / 100</span><input aria-label={"成效评分 " + node} disabled={!editable} required type="number" min="0" max="100" value={v.score??""} onChange={(e) => V({ ...v, score:e.target.value===''?null:+e.target.value })}/></label>
      <textarea
        aria-label="批阅评语"
        disabled={!editable}
        required
        placeholder="哪里有效？还可以怎么改？"
        value={v.comment}
        onChange={(e) => V({ ...v, comment: e.target.value })}
      />
      {editable && <button>{value ? "更新批阅" : "保存批阅"}</button>}
    </form>
  );
}
