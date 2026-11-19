import React, { useState } from "react";
import { DesignBoxes } from "./DesignBoxes";
import { answerAt } from "./study";
import type { Answer, Scene } from "./study";

type Kind = Answer["kind"];

export function SolutionCanvas({
  scene,
  answers,
  position,
  setPosition,
  remaining,
  busy,
  draft,
  drop,
  place,
  edit,
}: {
  scene: Scene;
  answers: Answer[];
  position: number;
  setPosition: (position: number) => void;
  remaining: number;
  busy: boolean;
  draft: (node: string, kind: Kind) => void;
  drop: (event: React.DragEvent, kind: Kind) => void;
  place: (key: string, kind: Kind) => void;
  edit: (answer: Answer) => void;
}) {
  const active = scene.nodes[position] || scene.nodes[0];
  const [expanded, setExpanded] = useState("");
  const [viewX, setViewX] = useState(0);

  const nodeAnswers = active
    ? answers.filter((answer) => answerAt(answer, active.id))
    : [];

  return (
    <div className="solution-workbench">
      <div
        className="solution-viewport"
        onWheel={(event) => {
          if ((event.target as HTMLElement).closest(".solution-dialog,.design-boxes")) return;
          event.preventDefault();
          const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          setViewX((value) => Math.min(80, Math.max(-Math.max(0, scene.nodes.length * 330 - innerWidth + 280), value - delta)));
        }}
      >
        <div
          className="solution-space"
          style={{ transform: `translate3d(${viewX}px,0,0)` }}
        >
          <ol className="solution-sequence" aria-label="困难解决时间线">
            {scene.nodes.map((node, index) => {
              const cards = answers.filter((answer) => answerAt(answer, node.id));
              return (
                <React.Fragment key={node.id}>
                  {index > 0 && <li className="solution-link" aria-hidden="true" />}
                  <li className="solution-node-column">
                    <button
                      className={"solution-node-card" + (active?.id === node.id ? " active" : "")}
                      aria-expanded={expanded === node.id}
                      onClick={() => {
                        setPosition(index);
                        setExpanded(node.id);
                      }}
                    >
                      <span>困难 {index + 1}</span>
                      <b aria-hidden="true">!</b>
                      <strong>{node.title}</strong>
                      <small>{node.definition}</small>
                    </button>
                    <div className="solution-titles">
                      {cards.length ? cards.map((card) => (
                        <button
                          key={card.id}
                          className={card.kind === "AI" ? "ai" : "interaction"}
                          onClick={() => {
                            setPosition(index);
                            setExpanded(node.id);
                            edit({ ...card });
                          }}
                        >
                          {card.text}
                        </button>
                      )) : <button onClick={() => { setPosition(index); setExpanded(node.id); }}>添加解决方案</button>}
                    </div>
                  </li>
                </React.Fragment>
              );
            })}
          </ol>

        </div>
      </div>
      {active && expanded === active.id && (
        <div className="solution-popover" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setExpanded("")}>
          <section className="solution-detail solution-dialog" role="dialog" aria-modal="false" aria-label={`配置 ${active.title} 的解决方案`}>
              <button className="solution-close" aria-label="关闭方案配置" onClick={() => setExpanded("")}>×</button>
              <article className="solution-problem">
                <small>困难 {position + 1} · 详细描述</small>
                <h2>{active.title}</h2>
                <h3>困难背景</h3>
                <p>{active.background}</p>
                <h3>困难定义</h3>
                <p>{active.definition}</p>
                {active.materials.length > 0 && <p className="solution-materials">材料 · {active.materials.join("、")}</p>}
              </article>
              <div className="solution-build">
                {(["AI", "交互"] as const).map((kind) => (
                  <div
                    key={kind}
                    className={"solution-drop " + (kind === "AI" ? "ai" : "interaction")}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => drop(event, kind)}
                  >
                    <header>
                      <div><small>{kind === "AI" ? `AI 卡剩余 ${remaining}` : "INTERACTION"}</small><h3>{kind === "AI" ? "AI 能力解决方案" : "交互解决方案"}</h3></div>
                      <button disabled={busy || (kind === "AI" && remaining <= 0)} onClick={() => draft(active.id, kind)}>＋ 新建</button>
                    </header>
                    {nodeAnswers.filter((answer) => answer.kind === kind).map((answer) => (
                      <button key={answer.id} className="solution-answer" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", answer.id)} onClick={() => edit({ ...answer })}>
                        <strong>{answer.text}</strong>
                        {answer.io && <span>{answer.io}</span>}
                      </button>
                    ))}
                    {!nodeAnswers.some((answer) => answer.kind === kind) && <p>从右侧卡箱拖入，或新建一张卡片</p>}
                  </div>
                ))}
                <button className="solution-done" disabled={!nodeAnswers.length} onClick={() => setExpanded("")}>完成当前节点</button>
              </div>
            </section>
        </div>
      )}
      {active && <DesignBoxes key={scene.id} answers={answers} node={active.id} remaining={remaining} busy={busy} create={(kind) => draft("", kind)} use={place} edit={edit} />}
    </div>
  );
}
