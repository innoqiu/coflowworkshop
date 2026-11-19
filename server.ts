import {initialStudy} from './src/study.ts';
import {buildExportFiles} from './src/export-data.ts';
import {installStudy} from './study-server.ts';
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { kinds } from "./src/types.ts";
import type { Workspace } from "./src/types.ts";
const app = express(),
  dir = process.env.DATA_DIR || "data";
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "workshop.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER,text TEXT,published INTEGER);
INSERT OR IGNORE INTO config VALUES(1,1,'【待核定模板】\n本工作坊收集您自愿填写的卡片内容与最终排布，用于研究 AI 使用困难和交互设计。参与是自愿的，您可以随时停止。\n请研究负责人补充：研究机构、负责人及联系方式、数据用途、保存期限、撤回方式与适用的审批信息。',0);
CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,token TEXT UNIQUE,created TEXT,consent_version INTEGER,consent_text TEXT,workspace TEXT);
CREATE TABLE IF NOT EXISTS workspace_history(participant_id TEXT NOT NULL,revision INTEGER NOT NULL,saved TEXT NOT NULL,workspace TEXT NOT NULL,PRIMARY KEY(participant_id,revision));
`);
db.exec("INSERT OR IGNORE INTO workspace_history SELECT id,CAST(json_extract(workspace,'$.revision') AS INTEGER),created,workspace FROM participants");
const defaultConsent =
  "本工作坊邀请您构想日常使用 AI 的场景与困难。参与完全自愿，您可以随时停止。\n\n应用自动分配匿名参与者 ID，并记录您创建的卡片内容与最终排布，用于本次工作坊的讨论与研究分析。定稿的场景会分配给同场参与者解题，解法将返回给出题人评分和批阅。请勿填写姓名、联系方式等个人敏感信息。\n\n如有疑问或希望撤回参与，请联系现场主持人。勾选下方选项表示您已阅读以上说明，并自愿参与。";
const currentConsent = db
  .prepare("SELECT * FROM config WHERE id=1")
  .get() as any;
if (currentConsent.text.startsWith("【待核定模板】") || (currentConsent.text.startsWith("本工作坊邀请您构想") && currentConsent.text !== defaultConsent))
  db.prepare(
    "UPDATE config SET text=?,version=version+1,published=1 WHERE id=1",
  ).run(defaultConsent);
app.disable("x-powered-by");
app.use((req,res,next)=>{if(req.url.startsWith('/solo-api/'))req.url=req.url.replace('/solo-api/','/api/');next()});
const soloRequest=(req:express.Request)=>req.originalUrl.startsWith('/solo-api/');
const sessionCookie=(req:express.Request)=>soloRequest(req)?'solo_participant':'participant';
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !==
        `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`
    ) {
      res.status(403).json({ error: "请求来源不匹配" });
      return;
    }
  }
  next();
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const exportToken = process.env.EXPORT_TOKEN || "";
const cookie = (req: express.Request, name: string) => {
  const raw = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="));
  return raw?.slice(name.length + 1) || "";
};
const setCookie = (
  res: express.Response,
  name: string,
  token: string,
  age: number,
) =>
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: age,
    path: "/",
  });
function participant(req: express.Request) {
  return db
    .prepare("SELECT * FROM participants WHERE token=?")
    .get(hash(cookie(req, sessionCookie(req)))) as any;
}
const publicParticipant = (p: any) => ({
  id: p.id,
  createdAt: p.created,
  consentVersion: p.consent_version,
  consentText: p.consent_text,
  workspace: JSON.parse(p.workspace),
});
app.get("/health", (_req, res) => {
  db.prepare("SELECT 1").get();
  res.json({ ok: true });
});
app.get("/api/consent", (_req, res) =>
  res.json(db.prepare("SELECT version,text FROM config WHERE id=1").get()),
);
app.post("/api/join", (req, res) => {
  const existing = participant(req);
  if (existing) {
    res.json(publicParticipant(existing));
    return;
  }
  const c = db.prepare("SELECT * FROM config WHERE id=1").get() as any;
  if (req.body.version !== c.version || req.body.agreed !== true) {
    res.status(400).json({ error: "请阅读并同意当前发布的知情同意书" });
    return;
  }
  const token = randomBytes(32).toString("hex"),
    id = (soloRequest(req)?"TEST-":"P-") + randomUUID().slice(0, 8).toUpperCase();
  const w: Workspace = {
    stage: "intro",
    intro: 0,
    cards: [],
    view: { x: 0, y: 0, scale: 1 },
    revision: 0,
  };
  const room=soloRequest(req)?id:"session:"+String(req.body.room||new Date().toISOString().slice(0,10)).slice(0,100);
  const created=new Date().toISOString(),workspace=JSON.stringify(w),study=JSON.stringify(initialStudy());
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO participants VALUES(?,?,?,?,?,?)").run(id,hash(token),created,c.version,c.text,workspace);
    db.prepare('INSERT INTO workspace_history VALUES(?,?,?,?)').run(id,w.revision,created,workspace);
    db.prepare('INSERT INTO study_group VALUES(?,?)').run(id,room);
    db.prepare('INSERT INTO study VALUES(?,?)').run(id,study);
    db.prepare('INSERT INTO study_history VALUES(?,?,?,?)').run(id,0,created,study);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  setCookie(res, sessionCookie(req), token, 365 * 86400000);
  res.json(publicParticipant(db.prepare("SELECT * FROM participants WHERE id=?").get(id)));
});
app.get("/api/me", (req, res) => {
  const p = participant(req);
  if (!p) {
    res.status(401).json({ error: "尚未参与" });
    return;
  }
  res.json(publicParticipant(p));
});
app.post("/api/reset", (req, res) => {
  if (!soloRequest(req)) {
    res.status(403).json({ error: "仅单人测试可以重新开始" });
    return;
  }
  const p = participant(req);
  if (p) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM study WHERE id=?").run(p.id);
      db.prepare("DELETE FROM study_history WHERE participant_id=?").run(p.id);
      db.prepare("DELETE FROM study_group WHERE id=?").run(p.id);
      db.prepare("DELETE FROM workspace_history WHERE participant_id=?").run(p.id);
      db.prepare("DELETE FROM participants WHERE id=?").run(p.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  res.clearCookie("solo_participant", { path: "/" });
  res.json({ ok: true });
});
function valid(w: any): w is Workspace {
  return (
    w &&
    ["intro", "scenario", "difficulty", "board", "done"].includes(w.stage) &&
    Number.isInteger(w.intro) &&
    w.intro >= 0 &&
    w.intro <= 10 &&
    Number.isInteger(w.revision) &&
    w.view &&
    [w.view.x, w.view.y, w.view.scale].every(Number.isFinite) &&
    w.view.scale >= 0.3 &&
    w.view.scale <= 2 &&
    Array.isArray(w.cards) &&
    w.cards.length <= 100 &&
    new Set(w.cards.map((c: any) => c.id)).size === w.cards.length &&
    w.cards.filter((c: any) => c.kind === "场景卡").length <= 1 &&
    w.cards.every(
      (c: any) =>
        typeof c.id === "string" &&
        c.id.length <= 80 &&
        kinds.includes(c.kind) &&
        ["title", "background", "definition"].every(
          (k) => typeof c[k] === "string" && c[k].length <= 5000,
        ) &&
        c.title.trim() &&
        (c.kind === "场景卡" || c.definition.trim()) &&
        [c.x, c.y, c.z].every(Number.isFinite) &&
        (c.kind !== "困难卡" || (c.background.trim() && c.definition.trim())),
    )
  );
}
app.put("/api/workspace", (req, res) => {
  const p = participant(req);
  if (!p) {
    res.status(401).json({ error: "参与会话已失效" });
    return;
  }
  const frozen=db.prepare("SELECT json_extract(data,'$.own.id') AS owner FROM study WHERE id=?").get(p.id);
  if(frozen?.owner){res.status(409).json({error:'场景已定稿'});return;}
  const w = req.body;
  if (!valid(w)) {
    res.status(400).json({ error: "卡片数据不完整或格式错误" });
    return;
  }
  if (
    w.stage === "done" &&
    (!w.cards.some((c) => c.kind === "场景卡") ||
      !w.cards.some((c) => c.kind === "困难卡"))
  ) {
    res.status(400).json({ error: "请先完成场景卡与困难卡" });
    return;
  }
  const old = JSON.parse(p.workspace);
  if (old.revision !== w.revision) {
    res
      .status(409)
      .json({ error: "其他页面已更新此画布，请加载最新版本", workspace: old });
    return;
  }
  const updated = { ...w, revision: w.revision + 1 };
  const serialized=JSON.stringify(updated);
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare("UPDATE participants SET workspace=? WHERE id=? AND workspace=?").run(serialized,p.id,p.workspace);
    if (!result.changes) {
      db.exec("ROLLBACK");
      res.status(409).json({ error: "版本冲突，请加载最新版本" });
      return;
    }
    db.prepare("INSERT INTO workspace_history VALUES(?,?,?,?)").run(p.id,updated.revision,new Date().toISOString(),serialized);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
  res.json(updated);
});
const exportNames = new Set([
  "workshop.json",
  "cards.csv",
  "export_nodes_and_solutions.csv",
  "export_peer_scenarios.csv",
  "export_ai_cards_hotspot.csv",
  "workshop.sqlite",
]);
app.post("/api/export/:name", (req, res, next) => {
  if (exportToken.length < 24) {
    res.status(503).json({ error: "下载功能尚未配置" });
    return;
  }
  const supplied = String(req.headers["x-export-token"] || "");
  if (!supplied || hash(supplied) !== hash(exportToken)) {
    res.status(401).json({ error: "下载密钥不正确" });
    return;
  }
  const name = req.params.name;
  if (!exportNames.has(name)) {
    res.status(404).json({ error: "导出文件不存在" });
    return;
  }
  if (name === "workshop.sqlite") {
    const snapshot = path.join(dir, `backup-${randomUUID()}.sqlite`);
    try {
      db.prepare("VACUUM INTO ?").run(path.resolve(snapshot));
      const date = new Date().toISOString().slice(0, 10);
      res.download(snapshot, `workshop-backup-${date}.sqlite`, (error) => {
        try { unlinkSync(snapshot); } catch {}
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      try { unlinkSync(snapshot); } catch {}
      next(error);
    }
    return;
  }
  try {
    db.exec("BEGIN");
    const content = buildExportFiles(db).files[name];
    db.exec("COMMIT");
    res.type(name.endsWith(".json") ? "application/json" : "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(content);
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    next(error);
  }
});
installStudy(app,db,participant);
app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
app.use(express.static("dist"));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.resolve("dist/index.html")),
);
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.message);
    res.status(500).json({ error: "服务暂时不可用，请稍后重试" });
  },
);
app.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
  console.log("Workshop listening on " + (process.env.PORT || 3000)),
);
