import { presets, templates, aiTemplates, initialStudy, answerAt } from "./src/study.ts";
import type { Study, Scene, Answer } from "./src/study.ts";
import type { DatabaseSync } from "node:sqlite";
import type { Express, Request } from "express";
export function installStudy(
  app: Express,
  db: DatabaseSync,
  participant: (req: Request) => any,
) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS study(id TEXT PRIMARY KEY,data TEXT NOT NULL)",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS study_group(id TEXT PRIMARY KEY,room TEXT NOT NULL)",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS study_history(participant_id TEXT NOT NULL,revision INTEGER NOT NULL,saved TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(participant_id,revision))",
  );
  db.exec(
    "INSERT OR IGNORE INTO study_history SELECT id,CAST(json_extract(data,'$.revision') AS INTEGER),datetime('now'),data FROM study",
  );
  const all = (room: string) =>
    db
      .prepare(
        "SELECT study.* FROM study JOIN study_group USING(id) WHERE room=? ORDER BY study.rowid",
      )
      .all(room)
      .map((r) => ({
        id: String(r.id),
        s: JSON.parse(String(r.data)) as Study,
      }));
  const put = (id: string, s: Study) => {
    const data=JSON.stringify(s);
    db.prepare("INSERT INTO study VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(id,data);
    db.prepare("INSERT OR IGNORE INTO study_history VALUES(?,?,?,?)").run(id,s.revision,new Date().toISOString(),data);
  };
  const check = (ok: unknown, msg: string) => {
    if (!ok) throw Error(msg);
  };
  app.all("/api/study", (req, res) => {
    const p = participant(req);
    if (!p) {
      res.sendStatus(401);
      return;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      const room = String(
        db.prepare("SELECT room FROM study_group WHERE id=?").get(p.id)?.room ||
          new Date().toISOString().slice(0, 10),
      );
      db.prepare("INSERT OR IGNORE INTO study_group VALUES(?,?)").run(
        p.id,
        room,
      );
      const rows = all(room),
        s = rows.find((r) => r.id === p.id)?.s || initialStudy();
      const scene = (): Scene => {
        const cards = JSON.parse(p.workspace).cards;
        const nodes = cards
          .filter((c: any) => c.kind === "困难卡")
          .sort((a: any, b: any) => a.y - b.y || a.x - b.x);
        return {
          id: p.id,
          title: cards.find((c: any) => c.kind === "场景卡")?.title || "",
          nodes: nodes.map((c: any) => ({
            ...c,
            materials: cards
              .filter(
                (m: any) =>
                  m.kind === "材料卡" &&
                  (m.parent
                    ? m.parent === c.id
                    : [...nodes].sort(
                        (a, b) =>
                          Math.hypot(a.x - m.x, a.y - m.y) -
                          Math.hypot(b.x - m.x, b.y - m.y),
                      )[0]?.id === c.id),
              )
              .map((m: any) => m.title + " " + m.definition),
          })),
        };
      };
      const simulation=p.id.startsWith('TEST-');
      const colleague='模拟同事 A';
      if(simulation){
        const reviewScene=s.own||(s.step>=35?scene():null);
        const mock=initialStudy();mock.own={id:colleague,title:'模拟同事 A · 外出勘察后整理现场记录',nodes:[
          ['现场照片找不到对应点位','照片和路线分开保存，事后难以对应。'],['语音记录夹杂噪声','现场口述的关键决定难以定位。'],['新旧平面图混用','手机中存在多版图纸，引用时容易选错。'],['报告材料遗漏','照片、批注和录音散落在不同应用。']
        ].map(([title,definition],i)=>({id:'mock-'+i,title,definition,background:'同事在现场用手机采集资料，回程需要交付勘察报告。',materials:['现场记录']}))};
        mock.target=p.id;mock.step=reviewScene?5:4;mock.peerModified=true;
        mock.peer=(reviewScene?.nodes||[]).map((n,i)=>({id:'reply-'+n.id,node:n.id,kind:'交互',text:['按住材料并拖到对应任务位置，松手前预览绑定结果。','框选需要处理的局部，在选区旁添加批注。','并排显示两个版本，点选差异并确认保留项。','把待核验材料逐项勾选，再生成交付清单。'][i%4],io:(n.materials.join('、')||n.title)+'，形成可确认的操作记录',links:[]}));
        if(reviewScene?.nodes[0])mock.peer.push({id:'ai-reply',node:reviewScene.nodes[0].id,kind:'AI',text:'读取所选材料，提取时间与主题，列出候选对应关系供确认。',io:'根据所选材料生成候选对应关系',links:[mock.peer[0].id]});
        rows.push({id:colleague,s:mock});
        const colleagueB='模拟同事 B',mockB=initialStudy();
        mockB.own={id:colleagueB,title:'模拟同事 B · 家庭健康数据与临时行程管理',nodes:[
          ['餐盘内容混在一起','一张照片中包含主食、配菜和酱汁，难以分别记录。'],['分量描述不准确','用“一小碗”或“一拳”描述食物，结果总是偏差很大。'],['计划跟不上变化','临时加班后原定运动和晚餐计划仍按旧时间提醒。'],['家人记录混入','多人共用设备时，健康数据与饮食照片容易归错人。']
        ].map(([title,definition],i)=>({id:'mock-b-'+i,title,definition,background:'同事希望用手机照片、手表数据和日程记录管理全家的健康计划。',materials:['餐盘照片','健康数据','日程表']}))};
        mockB.target=p.id;mockB.step=reviewScene?5:4;mockB.peerModified=false;
        mockB.peer=(reviewScene?.nodes||[]).map((n,i)=>({id:'reply-b-'+n.id,node:n.id,kind:i===0?'AI':'交互',text:['根据内容来源自动整理待确认的材料清单。','在时间线上拖动记录，调整它们与困难节点的对应关系。','长按两个版本进入并排比较，逐项确认保留内容。','提交前按困难节点检查材料和操作是否完整。'][i%4],io:'保留用户确认步骤，并显示当前处理状态',links:[]}));
        rows.push({id:colleagueB,s:mockB});
      }
      const target = () => rows.find((r) => r.id === s.target)?.s.own;
      const library = () => rows
        .filter((r) => r.id !== p.id && r.s.own)
        .map((r) => r.s.own as Scene);
      const incoming = rows.filter((r) => r.s.target === p.id && r.s.step >= 5);
      if (req.method === "POST") {
        const b = req.body;
        check(b.revision === s.revision, "页面已更新，请刷新后继续");
        switch (b.action) {
          case "choose":
            check(
              s.step === 2 && presets.some((v) => v.id === b.id),
              "请选择预设场景",
            );
            check(scene().nodes.length >= 4, "请先完成四个困难节点");
            s.preset = b.id;
            s.step = 3;
            break;
          case "answers":
          case "submit": {
            check(s.step === 3 || s.step === 4, "当前阶段无法修改方案");
            const src =
              s.step === 3 ? presets.find((v) => v.id === s.preset) : target();
            check(src, "等待分配题目");
            const a: Answer[] = b.answers;
            check(
              Array.isArray(a) &&
                a.every(
                  (c) =>
                    c &&
                    typeof c.id === "string" &&
                    (c.node === "" || src!.nodes.some((n) => n.id === c.node)) &&
                    (c.nodes === undefined ||
                      (c.kind === "交互" && Array.isArray(c.nodes) &&
                        c.nodes.every((id) => src!.nodes.some((n) => n.id === id)))) &&
                    ["AI", "交互"].includes(c.kind) &&
                    typeof c.text === "string" &&
                    c.text.trim() &&
                    typeof c.io === "string" &&
                    (c.detail === undefined || typeof c.detail === "string") &&
                    Array.isArray(c.links),
                ),
              "请完整填写卡片",
            );
            check(
              new Set(a.map((c) => c.id)).size === a.length,
              "卡片编号重复",
            );
            check(
              a.filter((c) => c.kind === "AI").length <= (s.step === 3 ? 3 : 2),
              "AI 卡超出配额",
            );
            for (const c of a) {
              check(
                c.links.every(
                  (id) =>
                    c.kind === "AI" &&
                    a.some(
                      (x) =>
                        x.id === id && answerAt(x, c.node) && x.kind === "交互",
                    ),
                ),
                "请选择同节点交互卡",
              );
              check(
                !(
                  c.kind === "AI" &&
                  c.text.length < 10 &&
                  /更聪明|理解力|懂我意思|提升算法/.test(c.text)
                ),
                "请写明具体的感知、推理或自动化步骤",
              );
              if (c.template)
                check(
                  (c.kind==="AI"?aiTemplates:templates).includes(c.template) &&
                    a.filter((x) => x.template === c.template).length === 1,
                  "预设交互卡已使用",
                );
            }
            if (s.step === 3) s.practice = a;
            else {
              s.peer = a;
              if (b.modified === true) s.peerModified = true;
            }
            if (b.action === "submit") {
              check(
                src!.nodes.every((n) => a.some((c) => answerAt(c, n.id))),
                "每个困难都需要解法",
              );
              s.step = s.step === 3 ? 35 : 5;
            }
            break;
          }
          case "publish":
            check(s.step === 35, "当前无法发布");
            s.own = scene();
            check(
              s.own.title && s.own.nodes.length >= 4,
              "需要一个场景及至少四个困难",
            );
            s.step = 4;
            s.target = "";
            break;
          case "select":
            check(s.step === 4, "当前无法选择题目");
            check(typeof b.id === "string" && b.id !== p.id, "请选择其他参与者的场景");
            check(rows.some((r) => r.id === b.id && r.s.own), "这个场景暂时不可用");
            s.target = b.id;
            s.peer = [];
            s.peerModified = false;
            break;
          case "review":
          case "complete": {
            check(s.step === 5, "当前无法批阅");
            const reviews = b.reviews;
            check(reviews && typeof reviews === "object", "缺少批阅");
            for (const [key, v] of Object.entries(reviews) as any) {
              const owner = incoming.find((r) => key.startsWith(r.id + "/"));
              const node = key.slice((owner?.id.length || 0) + 1);
              check(
                owner &&
                  s.own?.nodes.some((n) => n.id === node) &&
                  typeof v.score === "number" && Number.isFinite(v.score) &&
                  v.score >= 0 && v.score <= 100 &&
                  typeof v.comment === "string" &&
                  Array.isArray(v.accepted) &&
                  v.accepted.every((id: string) =>
                    owner.s.peer.some((c) => c.id === id && answerAt(c, node)),
                  ),
                "批阅内容无效",
              );
            }
            s.reviews = reviews;
            if (b.action === "complete") {
              check(
                incoming.length &&
                  incoming.every((r) =>
                    s.own!.nodes.every((n) =>
                      reviews[r.id + "/" + n.id]?.comment.trim() &&
                      typeof reviews[r.id + "/" + n.id]?.score === "number",
                    ),
                  ),
                "请逐个节点评分并填写评语",
              );
              s.step = 6;
            }
            break;
          }
          default:
            throw Error("未知操作");
        }
        s.revision++;
        put(p.id, s);
      }
      if (!rows.some((r) => r.id === p.id)) put(p.id, s);
      db.exec("COMMIT");
      res.json({
        s,
        own: s.own || scene(),
        target: target() || null,
        library: library(),
        incoming: incoming.map((r) => ({ id: r.id, answers: r.s.peer, sample: simulation, modified: Boolean(r.s.peerModified) })),
      });
    } catch (e) {
      db.exec("ROLLBACK");
      res.status(400).json({ error: (e as Error).message });
    }
  });
}
