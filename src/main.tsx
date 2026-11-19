import {apiPath,solo} from './Scenarios';
import {Experiment} from './Experiment';
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { kinds } from "./types";
import type { Card, Kind, Workspace, Participant } from "./types";
import "./style.css";
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(apiPath + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error), { status: r.status });
  return data;
}
const lines = [
  "hellooo!",
  "欢迎来参加我们的 设计师 工作坊",
  "被邀请的，都是聪明且富有经验的高端交互设计师与项目经理！",
  "在接下来的活动中，你将做四件事。",
  "1. 通过你的聪明才智，帮阿宝克服日常生活中使用AI的小困难",
  "2. 为你的同事出一道难题，让他们通过设计解决你想到的使用AI的困难",
  "3. 解决同事提出的难题",
  "4. 评估他们的解决方案！",
  "请尽情的发挥你的创意！",
  "先结合自己的真实经历，创建一个移动端 AI 场景，并提出至少四个困难。",
];
const tasks = [
  "帮阿宝克服使用 AI 的小困难",
  "为同事提出一个 AI 使用难题",
  "解决同事提出的难题",
  "评估同事的解决方案",
];
const cardDetailLabels: Record<Kind, [string, string]> = {
  场景卡: ["使用背景与材料", "期望目标"],
  材料卡: ["材料背景", "材料内容"],
  困难卡: ["困难背景", "困难定义"],
  交互卡: ["操作方式与反馈", "设计意图与效果"],
  AI卡: ["AI 处理逻辑", "输出与交互配合"],
};
function Mascot({
  large = false,
  onClick,
}: {
  large?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={"mascot " + (large ? "large" : "")}
      onClick={onClick}
      aria-label="查看当前步骤帮助"
    >
      <span />
      <span />
    </button>
  );
}
function App() {
  const [person, setPerson] = useState<Participant | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    api("/me")
      .then(setPerson)
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {loading ? (
        <div className="loading">加载中…</div>
      ) : error ? (
        <main className="paper">
          <p role="alert">{error}</p>
          <button onClick={() => location.reload()}>重试连接</button>
        </main>
      ) : person ? (
        <Workshop person={person} />
      ) : (
        <Consent onJoin={setPerson} />
      )}
    </>
  );
}
function Consent({ onJoin }: { onJoin: (p: Participant) => void }) {
  const [config, setConfig] = useState<any>(),
    [agreed, setAgreed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/consent")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="entry">
      <main className="consent-grid">
        <section className="welcome">
          <h1>{solo?"单人测试":"设计工作坊"}</h1>{!solo&&<a href="/solo">单人测试入口</a>}
          <Mascot large />
        </section>
        <section className="paper">
          <h2>先认识这场工作坊</h2>
          <div className="consent-text">
            {config?.text || "正在加载参与说明…"}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            我已阅读以上说明，自愿参与本次工作坊。
          </label>
          <button
            className="primary wide"
            disabled={!agreed || !config || busy}
            onClick={async () => {
              setBusy(true);
              try {
                onJoin(
                  await api("/join", "POST", {
                    agreed: true,
                    room:new URLSearchParams(location.search).get("session"),
                    version: config.version,
                  }),
                );
              } catch (e: any) {
                setError(e.message);
                api("/consent").then(setConfig);
              } finally {
                setBusy(false);
              }
            }}
          >
            同意并进入工作坊
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
function Workshop({ person }: { person: Participant }) {
  const key = "workshop-draft-" + person.id;
  const [w, setW] = useState<Workspace>(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(key) || "null");
      if (draft?.stage && Number.isInteger(draft.revision)) return draft;
    } catch {}
    return person.workspace;
  });
  const current = useRef(w),
    dirty = useRef(false),
    saving = useRef(false),
    blocked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState("已保存"),
    [error, setError] = useState(""),
    [help, setHelp] = useState(false),
    [taskGuide, setTaskGuide] = useState(false),
    [editor, setEditor] = useState<Partial<Card> | null>(null),
    [flipped, setFlipped] = useState<string[]>([]),
    [transition, setTransition] = useState(false);
  const drag = useRef<any>(null);
  function arrange(cards: Card[]) {
    const scene = cards.find((card) => card.kind === "场景卡");
    const difficulties = cards.filter((card) => card.kind === "困难卡");
    const remaining = cards.filter(
      (card) => card.kind !== "场景卡" && card.kind !== "困难卡",
    );
    const sequence = [...(scene ? [scene] : []), ...difficulties];
    const sequenceMap = new Map(
      sequence.map((card, index) => [
        card.id,
        { ...card, x: 64 + index * 318, y: 92, z: index + 1 },
      ]),
    );
    return [
      ...sequence.map((card) => sequenceMap.get(card.id)!),
      ...remaining.map((card, index) => ({
        ...card,
        x: 64 + index * 238,
        y: 456,
        z: sequence.length + index + 1,
      })),
    ];
  }
  function reorderDifficulty(sourceId: string, targetId: string) {
    const cards = current.current.cards;
    const difficulties = cards.filter((card) => card.kind === "困难卡");
    const source = difficulties.findIndex((card) => card.id === sourceId);
    const target = difficulties.findIndex((card) => card.id === targetId);
    if (source < 0 || target < 0 || source === target) return;
    const reordered = [...difficulties];
    const [moved] = reordered.splice(source, 1);
    reordered.splice(target, 0, moved);
    const scene = cards.filter((card) => card.kind === "场景卡");
    const remaining = cards.filter(
      (card) => card.kind !== "场景卡" && card.kind !== "困难卡",
    );
    const next = { ...current.current, cards: arrange([...scene, ...reordered, ...remaining]) };
    current.current = next;
    setW(next);
  }
  function addLibraryCard(card: Omit<Card, "id" | "x" | "y" | "z">) {
    if (card.kind === "场景卡" && current.current.cards.some((item) => item.kind === "场景卡")) {
      setError("画布中已经有一张场景卡。可以打开卡片编辑现有场景。");
      return;
    }
    const nextCard: Card = {
      ...card,
      id: crypto.randomUUID(),
      x: 0,
      y: 0,
      z: current.current.cards.length + 1,
    };
    const nextStage =
      current.current.stage === "scenario" && card.kind === "场景卡"
        ? "difficulty"
        : current.current.stage === "difficulty" && card.kind === "困难卡"
          ? "board"
          : current.current.stage;
    change(
      {
        ...current.current,
        stage: nextStage,
        cards: arrange([...current.current.cards, nextCard]),
      },
      true,
    );
  }
  function dropFromLibrary(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/x-workshop-card");
    if (!raw) return;
    try {
      addLibraryCard(JSON.parse(raw));
    } catch {
      setError("这张卡片没有正确放入画布，请再试一次。");
    }
  }
  function dropOnSequence(e: React.DragEvent, targetId?: string) {
    e.preventDefault();
    const libraryCard = e.dataTransfer.getData("application/x-workshop-card");
    if (libraryCard) {
      dropFromLibrary(e);
      return;
    }
    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId && targetId) {
      reorderDifficulty(sourceId, targetId);
      change(current.current, true);
    }
  }
  function change(next: Workspace, immediate = false) {
    current.current = next;
    setW(next);
    dirty.current = true;
    localStorage.setItem(key, JSON.stringify(next));
    setStatus("待同步");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), immediate ? 0 : 650);
  }
  async function save() {
    if (saving.current || blocked.current) return false;
    if (!dirty.current) return true;
    saving.current = true;
    setStatus("保存中");
    const sent = current.current;
    try {
      const saved: Workspace = await api("/workspace", "PUT", sent);
      if (current.current === sent) {
        current.current = saved;
        setW(saved);
        dirty.current = false;
        localStorage.removeItem(key);
        setStatus("已保存");
      } else {
        current.current = { ...current.current, revision: saved.revision };
        setW(current.current);
        localStorage.setItem(key, JSON.stringify(current.current));
      }
      setError("");
      return true;
    } catch (e: any) {
      if (e.status === 409) {
        blocked.current = true;
        setStatus("版本冲突");
        setError(
          "其他页面已更新此画布。当前草稿已保留；请下载草稿后加载最新版本。",
        );
      } else {
        setStatus("待重试");
        setError(e.message);
      }
      return false;
    } finally {
      saving.current = false;
      if (dirty.current && !blocked.current)
        timer.current = setTimeout(() => void save(), 2500);
    }
  }
  useEffect(() => {
    if (localStorage.getItem(key)) {
      dirty.current = true;
      void save();
    }
    const online = () => void save();
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", before);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  function updateCard(c: Partial<Card>) {
    const cards = current.current.cards;
    const card: Card = {
      id: crypto.randomUUID(),
      kind: c.kind || "困难卡",
      title: "",
      background: "",
      definition: "",
      x: 40 + (cards.length % 4) * 300,
      y: 45 + Math.floor(cards.length / 4) * 340,
      z: Math.max(0, ...cards.map((c) => c.z)) + 1,
      ...c,
    };
    let stage = current.current.stage;
    if (stage === "scenario") stage = "difficulty";
    else if (stage === "difficulty") stage = "board";
    change(
      {
        ...current.current,
        stage,
        cards: arrange(
          cards.some((x) => x.id === card.id)
            ? cards.map((x) => (x.id === card.id ? card : x))
            : [...cards, card],
        ),
      },
      true,
    );
    setEditor(null);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const dx = e.clientX - d.sx,
      dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (!d.moved) return;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-sequence-id]");
    if (target?.dataset.sequenceId) reorderDifficulty(d.id, target.dataset.sequenceId);
  }
  function end(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.moved) change(current.current, true);
    drag.current = null;
  }
  async function finish() {
    if (saving.current) {
      setError("正在保存，请稍后再点击完成。");
      return;
    }
    change({ ...current.current, stage: "done" }, true);
    await save();
  }
  const inIntro = w.stage === "intro",
    inGuide = w.stage === "scenario" || w.stage === "difficulty";
  if(w.stage==="done" && status==="已保存") return <Experiment refine={()=>change({...w,stage:"board"},true)}/>;
  const editorForm=editor?<CardForm
    draftKey={person.id + "-" + (editor.id || editor.kind)}
    initial={editor}
    onDraft={(c) => {
      if (
        c.id &&
        c.title?.trim() &&
        (c.kind !== "困难卡" || (c.background?.trim() && c.definition?.trim())) &&
        (c.kind === "场景卡" || c.definition?.trim())
      )
        change({
          ...current.current,
          cards: current.current.cards.map((x) => x.id === c.id ? { ...x, ...c } : x),
        });
    }}
    nodes={w.cards.filter(x=>x.kind==="困难卡")}
    onSave={updateCard}
  />:null;
  const newDifficultyPanel=w.stage==="board"&&editor?.kind==="困难卡"&&!editor.id;
  return (
    <div className={"workshop stage-" + w.stage}>
      <header>
        {!inIntro&&<nav className="own-tabs" aria-label="实验画布"><strong>我的场景与批阅</strong><span>预设场景练习</span><span>解他人场景</span></nav>}
        <div className="identity">{!solo?<a href="/solo">单人测试</a>:<><a href="/">返回正式工作坊</a><button className="restart-solo" onClick={async()=>{if(!confirm("重新开始会清除这次单人测试的全部卡片和批阅，确定继续吗？"))return;await api("/reset","POST");Object.keys(localStorage).filter(k=>k.startsWith("workshop-")).forEach(k=>localStorage.removeItem(k));location.href="/solo"}}>重新开始</button></>}
          <span>{person.id}</span>
          <span className={"save " + (status === "已保存" ? "saved" : "")}>
            {status === "已保存" ? "✓" : "○"} {status}
          </span>
        </div>
      </header>
      <aside className="taskrail">
        <span className="label">我们的四个任务</span>
        {tasks.map(
          (t, i) =>
            (!inIntro || w.intro >= 5 + i) && (
              <div className={"task " + (i === 1 ? "active" : "")} key={t}>
                <span>0{i + 1}</span>
                <p>{t}</p>
              </div>
            ),
        )}
      </aside>
      {error && (
        <div className="error-banner" role="alert">
          {error}{" "}
          {blocked.current ? (
            <>
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(
                    new Blob([JSON.stringify(current.current, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  a.download = person.id + "-draft.json";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                下载草稿
              </button>
              <button
                onClick={() => {
                  if (
                    confirm(
                      "加载服务器最新版本？当前草稿将从本机清除，请先下载保留。",
                    )
                  ) {
                    localStorage.removeItem(key);
                    location.reload();
                  }
                }}
              >
                加载最新版本
              </button>
            </>
          ) : (
            <button onClick={() => void save()}>重试保存</button>
          )}
        </div>
      )}
      {inIntro ? (
        <main className="intro">
          <Mascot large />
          <button
            className={"bubble " + (transition ? "leaving" : "")}
            onClick={() => {
              if (transition) return;
              setTransition(true);
              setTimeout(() => {
                change(
                  {
                    ...current.current,
                    intro: w.intro + 1,
                    stage: w.intro >= lines.length - 1 ? "scenario" : "intro",
                  },
                  true,
                );
                setTransition(false);
              }, 180);
            }}
          >
            <span key={w.intro}>{lines[w.intro]}</span>
          </button>
          <div className="dots">
            {lines.map((_, i) => (
              <i key={i} className={i === w.intro ? "on" : ""} />
            ))}
          </div>
        </main>
      ) : inGuide ? (
        <main className="guide guide-canvas" onDragOver={event=>event.preventDefault()} onDrop={dropFromLibrary}>
          <div className="guide-sequence" aria-hidden="true">
            {w.cards.map((card) => (
              <React.Fragment key={card.id}>
                <article className={"guide-card kind-" + kinds.indexOf(card.kind)}>
                  <small>{card.kind}</small>
                  <CardArt kind={card.kind} />
                  <h3>{card.title}</h3>
                </article>
                <span className="guide-link" />
              </React.Fragment>
            ))}
            <span className="guide-placeholder">
              {w.stage === "scenario" ? "从场景开始" : "在右侧继续添加困难"}
            </span>
          </div>
          <section className="guide-editor paper">
            <div className="guide-heading">
              <span className="step">
                构想场景与困难 / {w.stage === "scenario" ? "01" : "02"}
              </span>
              <h2>
                {w.stage === "scenario"
                  ? "故事，发生在哪里？"
                  : "在这个场景里，什么让人感到困难？"}
              </h2>
            </div>
            <CardForm
              key={w.stage}
              draftKey={person.id + "-" + w.stage}
              initial={{ kind: w.stage === "scenario" ? "场景卡" : "困难卡" }}
              onSave={updateCard}
            />
          </section>
        </main>
      ) : w.stage === "done" ? (
        <main className="done paper">
          <span className="done-mark">✓</span>
          <h2>
            {status === "已保存"
              ? "你的想法，已经收好啦。"
              : "正在收好你的想法…"}
          </h2>
          <p>
            共 {w.cards.length} 张卡片 ·{" "}
            {w.cards.filter((c) => c.kind === "困难卡").length} 个困难
          </p>
          <p className="muted">本轮构想已结束，请等待主持人安排后续活动。</p>
          <button onClick={() => change({ ...w, stage: "board" }, true)}>
            返回桌面，继续修改
          </button>
        </main>
      ) : (
        <main className="board-area">
          <div className="board-heading">
            <button className="task-prompt" aria-haspopup="dialog" onClick={()=>setTaskGuide(true)}><span aria-hidden="true">?</span>我该做什么？</button>
            <button
              className="primary"
              disabled={
                !w.cards.some((c) => c.kind === "场景卡") ||
                w.cards.filter((c) => c.kind === "困难卡").length < 4 ||
                blocked.current
              }
              onClick={() => void finish()}
            >
              进入实验下一步
            </button>
          </div>
          <div
            className="viewport"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => dropOnSequence(e)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => {
              if (drag.current?.moved) change(current.current, true);
              drag.current = null;
            }}
            onWheel={(e) => {
              e.preventDefault();
              const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
              const sequenceWidth=w.cards.filter(c=>c.kind==='场景卡'||c.kind==='困难卡').length*318+420;
              const min=Math.min(0,innerWidth-sequenceWidth-160);
              const x=Math.max(min,Math.min(80,current.current.view.x-delta));
              change({...current.current,view:{...current.current.view,x}},false);
            }}
          >
            <div className="sequence-space" style={{transform:`translate3d(${w.view.x}px,${w.view.y}px,0)`}}>
              <ol className="sequence-timeline" aria-label="场景与困难时间线">
              {w.cards.filter(c=>c.kind==="场景卡"||c.kind==="困难卡").map((c,index) => (
                <React.Fragment key={c.id}>
                {index>0&&<li className="sequence-connector" aria-hidden="true" />}
                <li className="timeline-node" data-sequence-id={c.kind==="困难卡"?c.id:undefined} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();dropOnSequence(e,c.id)}}>
                <article
                  className={
                    "card timeline-card kind-" +
                    kinds.indexOf(c.kind) +
                    " " +
                    (flipped.includes(c.id) ? "flipped" : "")
                  }
                  draggable={c.kind==="困难卡"}
                  onDragStart={e=>e.dataTransfer.setData("text/plain",c.id)}
                >
                  <div className="card-inner">
                    <section
                      className="card-face front"
                      tabIndex={0}
                      aria-label={c.kind + "：" + c.title + "，按回车翻面"}
                      onKeyDown={(e) => {
                        if (
                          e.target === e.currentTarget &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          e.preventDefault();
                          setFlipped((f) => [...f, c.id]);
                        }
                      }}
                      onClick={() => setFlipped((f) => [...f, c.id])}
                    >
                      <div
                        className="card-grip"
                        tabIndex={0}
                        role="button"
                        aria-label={c.kind==="困难卡"?"调整" + c.title + "的顺序":"场景起点"}
                        onKeyDown={(e) => {
                          if (
                            [
                              "ArrowLeft",
                              "ArrowRight",
                              "ArrowUp",
                              "ArrowDown",
                            ].includes(e.key)
                          ) {
                            e.preventDefault();
                            e.stopPropagation();
                            if(c.kind!=="困难卡")return;
                            const difficulties=w.cards.filter(x=>x.kind==="困难卡");
                            const position=difficulties.findIndex(x=>x.id===c.id);
                            const target=difficulties[position+(e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:0)];
                            if(target){reorderDifficulty(c.id,target.id);change(current.current,true)}
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          drag.current = {
                            id: c.id,
                            pointer: e.pointerId,
                            sx: e.clientX,
                            sy: e.clientY,
                            moved: false,
                          };
                        }}
                      >
                        <span>{c.kind}</span>
                        <span>⠿</span>
                      </div>
                      <div className="card-art">
                        <CardArt kind={c.kind} />
                      </div>
                      <h3>{c.title}</h3>
                      <p>
                        {c.kind === "困难卡"
                          ? c.background
                          : c.definition}
                      </p>
                    </section>
                    <section
                      className="card-face back"
                      onClick={() =>
                        setFlipped((f) => f.filter((id) => id !== c.id))
                      }
                    >
                      <span className="label">{c.kind} / 详细内容</span>
                      <h3>{c.title}</h3>
                      {c.background && (
                        <p>
                          <b>{cardDetailLabels[c.kind][0]}</b>
                          <br />
                          {c.background}
                        </p>
                      )}
                      <p><b>{cardDetailLabels[c.kind][1]}</b><br />{c.definition}</p>
                      <div
                        className="card-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button onClick={() => setEditor(c)}>编辑</button>
                        <button
                          onClick={() => {
                            if (confirm("删除这张卡片？"))
                              change(
                                {
                                  ...w,
                                  cards: w.cards.filter((x) => x.id !== c.id),
                                },
                                true,
                              );
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </section>
                  </div>
                </article>
                </li>
                </React.Fragment>
              ))}
              <li className="sequence-connector" aria-hidden="true" />
              <li className="timeline-add-node">
                <button onClick={()=>setEditor({kind:"困难卡"})}><span>＋</span><strong>创建新困难</strong><small>在序列右侧继续添加</small></button>
              </li>
              </ol>
            </div>
          </div>
        </main>
      )}
      {!inIntro && (
        <div className="helper">
          <Mascot onClick={() => setHelp(!help)} />
          {help && (
            <div className="help-bubble">
              <button
                className="close"
                aria-label="关闭帮助"
                onClick={() => setHelp(false)}
              >
                ×
              </button>
              {w.stage === "scenario"
                ? "有问题，可以随时点我哦！"
                : w.stage === "difficulty"
                  ? "困难定义可以这样写：由于（xx原因）造成的（xx困难）。"
                  : "拖动卡片顶部调整位置，点击翻面，再点编辑。你也可以继续添加新的困难卡。"}
            </div>
          )}
        </div>
      )}
      {taskGuide&&<div className="modal task-guide-modal" onClick={()=>setTaskGuide(false)}><section className="paper" role="dialog" aria-modal="true" aria-labelledby="task-guide-title" onClick={e=>e.stopPropagation()}><button className="close" aria-label="关闭任务说明" onClick={()=>setTaskGuide(false)}>×</button><h2 id="task-guide-title">请从自己的真实体验出发</h2><p>结合你的亲身经历，构想一个在移动端使用 AI 的场景，再提出至少四个具体的困难。</p><p>后续，你会看到同事对你困难的解决方案，并进行评价。</p><ol><li>想想在哪里、什么情况下，为了做什么事遇见了这些困难？使用了哪些内容或材料？</li><li>再逐个描述进行到哪一步时遇到问题，以及为什么难以完成。</li><li>困难越具体，后续同事越容易提出有针对性的交互方案。</li></ol><button className="primary" onClick={()=>setTaskGuide(false)}>开始构想</button></section></div>}
      {editor && (newDifficultyPanel?
        <aside className="board-editor-panel paper" role="dialog" aria-modal="false" aria-label="创建新困难">
          <button className="close" onClick={()=>setEditor(null)} aria-label="关闭编辑器">×</button>
          {editorForm}
        </aside>
      :
        <div className="modal" onClick={() => setEditor(null)}>
          <section
            className="paper"
            role="dialog"
            aria-modal="true"
            aria-label="编辑卡片"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setEditor(null)}
              aria-label="关闭编辑器"
            >
              ×
            </button>
            {editorForm}
          </section>
        </div>
      )}
    </div>
  );
}
const cardIcons: Partial<Record<Kind, string>> = {
  场景卡: new URL("./icon/fa-solid_walking-1.png", import.meta.url).href,
  困难卡: new URL("./icon/bi_exclamation-triangle-fill-1.png", import.meta.url)
    .href,
  交互卡: new URL("./icon/boxicons_finger-touch-filled-1.png", import.meta.url)
    .href,
  AI卡: new URL("./icon/fluent_bot-16-filled-1.png", import.meta.url).href,
};
function CardArt({ kind }: { kind: Kind }) {
  if (cardIcons[kind])
    return (
      <img
        className="type-icon"
        src={cardIcons[kind]}
        alt=""
        draggable={false}
      />
    );
  return (
    <svg
      className="type-icon"
      viewBox="0 0 64 64"
      aria-hidden="true"
      fill="currentColor"
    >
      <rect x="10" y="8" width="32" height="42" rx="5" opacity=".35" />
      <path d="M27 17h15l12 12v23a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5V22a5 5 0 0 1 5-5Zm14 4v12h11Z" />
    </svg>
  );
}
function CardForm({
  initial,
  onSave,
  nodes=[],
  onDraft,
  draftKey,
}: {
  initial: Partial<Card>;
  nodes?:Card[];
  onSave: (c: Partial<Card>) => void;
  onDraft?: (c: Partial<Card>) => void;
  draftKey: string;
}) {
  const storageKey = "workshop-form-" + draftKey;
  const [c, setC] = useState<Partial<Card>>(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(storageKey) || "null");
      return draft?.kind === initial.kind ? { ...initial, ...draft } : initial;
    } catch {
      return initial;
    }
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(c));
    const timer = setTimeout(() => onDraft?.(c), 650);
    return () => clearTimeout(timer);
  }, [c]);
  const fields: Partial<Record<Kind, { title: string; titleHint: string; background: string; backgroundHint: string; definition: string; definitionHint: string }>> = {
    场景卡: {
      title: "场景名称",
      titleHint: "一句话概括你要做的事（例：在通勤路上结合老板微信语音和旧文献修改汇报 PPT）",
      background: "使用背景与材料",
      backgroundHint: "当时处于什么移动环境、用什么设备？手头有哪些散落的材料？（例：地铁上单手用手机；手头有相册截图、群聊语音、电脑里的旧文档）",
      definition: "期望目标",
      definitionHint: "最终希望 AI 帮你产出什么？达到什么效果？（例：把多份材料整合成一份逻辑清晰、无需二次大改的汇报初稿）",
    },
    困难卡: {
      title: "困难名称",
      titleHint: "简短概括卡壳或累赘的点（例：几十张同类照片选不过来 / 食物分量很难用文字描述准）",
      background: "困难背景",
      backgroundHint: "进行到哪一步、面对什么材料时遇到了这个问题？（例：想从手机相册上千张图里把过去一个月的减脂餐挑出来喂给 AI 时）",
      definition: "困难定义",
      definitionHint: "具体说明为什么很难做到（困难），或者虽然能做到但哪里操作太繁琐（负担）？（例：无法一次性选中分散在不同日期的同类图片，只能一张张手动翻找勾选，非常费力）",
    },
    交互卡: {
      title: "交互名称",
      titleHint: "为你设计的组件或手势起个名字（例：双指外划选中同类 / 侧边记忆库拖拽归档）",
      background: "操作方式与反馈",
      backgroundHint: "用户在界面上怎么操作（点按/拖拽/滑动/涂抹）？界面会出现什么变化？（注：请设计纯交互方式，勿包含 AI 能力。例：食指按住一张图，中指向外划动，同类图片同时高亮选中）",
      definition: "设计意图与效果",
      definitionHint: "这个交互如何帮用户省力或选得更准？如果配合 AI 卡使用，它向 AI 传递了什么？（例：省去逐张翻找勾选，将圈定的目标图片集合直接传给下一步）",
    },
    AI卡: {
      title: "AI 功能名称",
      titleHint: "明确为 AI 新增的一项具体功能（注：请勿写“提升理解力/更聪明”等万能词。例：文献全文阅读与候选提示词推荐）",
      background: "AI 处理逻辑",
      backgroundHint: "AI 接收了什么材料或数据，在底层自动做了什么识别、分析或生成？（例：AI 自动通读上传的文献全文，结合上下文提炼出几个可调的修改方向和替换词）",
      definition: "输出与交互配合",
      definitionHint: "AI 最终输出什么结果？如何与你的交互卡配合解决问题？（例：输出候选提示词标签或自动勾选好的文件列表，供用户在交互卡上直接微调确认）",
    },
  };
  const field = fields[c.kind!] || {
    title: "名称",
    titleHint: "给这张卡片起个名字",
    background: "补充背景",
    backgroundHint: "记录这份材料出现在哪里",
    definition: "描述",
    definitionHint: "记录具体内容或用途",
  };
  return (
    <form
      className={"card-form kind-" + kinds.indexOf(c.kind!)}
      onSubmit={(e) => {
        e.preventDefault();
        localStorage.removeItem(storageKey);
        onSave(c);
      }}
    >
      <span className="label">{c.kind}</span>
      <CardArt kind={c.kind!} />
      <label>
        {field.title}
        <textarea
          autoFocus
          required
          maxLength={5000}
          rows={2}
          placeholder={field.titleHint}
          value={c.title || ""}
          onChange={(e) => setC({ ...c, title: e.target.value })}
        />
      </label>
      {c.kind==="材料卡"&&<label>用于哪个困难<select required value={c.parent||""} onChange={e=>setC({...c,parent:e.target.value})}><option value="">选择困难节点</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>}
      {c.kind !== "材料卡" && (
        <label>
          {field.background}
          <textarea
            required
            maxLength={5000}
            rows={3}
            placeholder={field.backgroundHint}
            value={c.background || ""}
            onChange={(e) => setC({ ...c, background: e.target.value })}
          />
        </label>
      )}
      {(
        <label>
          {field.definition}
          <textarea
            required
            maxLength={5000}
            rows={3}
            placeholder={field.definitionHint}
            value={c.definition || ""}
            onChange={(e) => setC({ ...c, definition: e.target.value })}
          />
        </label>
      )}
      <button className="primary wide" type="submit">
        {initial.id ? "保存修改" : "完成"}
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
import "./cards.css";
import "./canvas.css";
