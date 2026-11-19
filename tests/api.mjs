import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "codesign-test-")),
  port = 3101,
  base = `http://127.0.0.1:${port}`;
let child;
function start() {
  child = spawn(process.execPath, ["--experimental-strip-types", "server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
}
async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Server did not start");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise((r) => {
    child.once("exit", r);
    child.kill();
  });
}
async function req(route, method = "GET", body, cookie = "") {
  const r = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const card = (kind, id, x) => ({
  id,
  kind,
  title: "测试 " + kind,
  background: kind === "困难卡" ? "想跨设备上传材料" : "",
  definition: kind === "困难卡" ? "由于设备分散造成上传困难" : "描述",
  x,
  y: 50,
  z: x,
});
try {
  start();
  await ready();
  assert.equal((await req("/api/me")).status, 401);
  assert.equal((await req("/api/admin/participants")).status, 404);
  const consent = (await req("/api/consent")).data;
  assert(!consent.text.includes("待核定"));
  assert(!consent.text.includes("请研究负责人补充"));
  assert.equal(
    (
      await req("/api/join", "POST", {
        agreed: false,
        version: consent.version,
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("/api/join", "POST", { agreed: true, version: -1 })).status,
    400,
  );
  const people = await Promise.all(
    Array.from({ length: 6 }, () =>
      req("/api/join", "POST", { agreed: true, version: consent.version }),
    ),
  );
  people.forEach((p) => assert.equal(p.status, 200));
  assert.equal(new Set(people.map((p) => p.data.id)).size, 6);
  const saved = await Promise.all(
    people.map((p, i) =>
      req(
        "/api/workspace",
        "PUT",
        {
          ...p.data.workspace,
          stage: "done",
          cards: [
            card("场景卡", "s", 30 + i),
            card("困难卡", "d", 350 + i),
            card("材料卡", "m", 650 + i),
            card("交互卡", "i", 950 + i),
            card("AI卡", "a", 1250 + i),
          ],
        },
        p.cookie,
      ),
    ),
  );
  saved.forEach((p) => assert.equal(p.status, 200));
  for (let i = 0; i < 6; i++) {
    const p = await req("/api/me", "GET", undefined, people[i].cookie);
    assert.equal(p.data.workspace.cards[0].x, 30 + i);
    assert.equal(p.data.consentText, consent.text);
    assert.equal(p.data.workspace.revision, 1);
  }
  assert.equal(
    (
      await req(
        "/api/workspace",
        "PUT",
        people[0].data.workspace,
        people[0].cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await req(
        "/api/workspace",
        "PUT",
        { ...saved[0].data, cards: [] },
        people[0].cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/api/workspace",
        "PUT",
        { ...saved[0].data, cards: [card("未知", "bad", 0)] },
        people[0].cookie,
      )
    ).status,
    400,
  );
  assert.equal((await req("/api/workspace", "PUT", saved[0].data)).status, 401);
  execFileSync(process.execPath, [
    "scripts/export.mjs",
    dir,
    path.join(dir, "export"),
  ]);
  const exported = JSON.parse(
    readFileSync(path.join(dir, "export/workshop.json"), "utf8"),
  );
  assert.equal(exported.participants.length, 6);
  assert(!JSON.stringify(exported).includes("token"));
  assert.equal(
    readFileSync(path.join(dir, "export/cards.csv"), "utf8").split("\r\n")
      .length,
    31,
  );
  await stop();
  start();
  await ready();
  assert.equal(
    (await req("/api/me", "GET", undefined, people[0].cookie)).data.workspace
      .cards.length,
    5,
  );
  // Six real sessions each publish, freely select a distinct colleague's brief and review the returned solution.
  async function getStudy(p){return (await req('/api/study','GET',undefined,p.cookie)).data}
  async function act(p,action,body={}){const {s}=await getStudy(p);const r=await req('/api/study','POST',{action,revision:s.revision,...body},p.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r.data}
  const answer=n=>({id:n.id+'-solution',node:n.id,kind:'交互',text:'长按圈选并确认材料用途',io:'从文档中建立选区',links:[]});
  for(const p of people){const w=(await req('/api/me','GET',undefined,p.cookie)).data.workspace;w.cards.push(...[1,2,3].map(i=>card('困难卡','extra'+i,150*i)));await req('/api/workspace','PUT',w,p.cookie);await act(p,'choose',{id:'health'});await act(p,'submit',{answers:[1,2,3,4].map(i=>answer({id:'health-'+i}))});}
  for(const p of people)await act(p,'publish');
  const assigned=new Set();
  for(let i=0;i<people.length;i++){const p=people[i];const {library}=await getStudy(p);const picked=library.find(scene=>scene.id===people[(i+1)%people.length].data.id);assert(picked&&picked.id!==p.data.id);await act(p,'select',{id:picked.id});const {target}=await getStudy(p);assert.equal(target.id,picked.id);assigned.add(target.id);const shared={id:'shared-'+p.data.id,node:target.nodes[0].id,nodes:target.nodes.map(n=>n.id),kind:'交互',text:'长按圈选并确认材料用途',io:'从文档中建立选区',links:[]};await act(p,'submit',{answers:[shared]});}
  assert.equal(assigned.size,6);
  for(const p of people){const {incoming,own}=await getStudy(p);assert.equal(incoming.length,1);const shared=incoming[0].answers[0].id;const reviews=Object.fromEntries(own.nodes.map(n=>[incoming[0].id+'/'+n.id,{score:88,comment:'操作能解决这一困难',accepted:[shared]}]));assert.equal((await act(p,'complete',{reviews})).s.step,6);}
  console.log(
    "PASS: direct entry without host configuration, consent, six concurrent participants, five card types, isolation, validation, conflicts, CLI export and persistent restart.",
  );
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
