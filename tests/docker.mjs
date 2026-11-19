import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const exec = promisify(execFile),
  name = "codesign-verify-" + randomUUID().slice(0, 8),
  volume = name + "-data",
  base = "http://127.0.0.1:3103";
async function docker(...args) {
  return (await exec("docker", args)).stdout.trim();
}
async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Container did not become ready");
}
async function req(route, method = "GET", body, cookie = "") {
  const r = await fetch(base + "/api" + route, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert(r.ok, await r.clone().text());
  return { data: await r.json(), cookie: r.headers.get("set-cookie") };
}
async function run() {
  await docker(
    "run",
    "--detach",
    "--name",
    name,
    "--publish",
    "127.0.0.1:3103:3000",
    "--mount",
    `type=volume,src=${volume},dst=/app/data`,
    "--health-interval=1s",
    "codesign-workshop:local",
  );
  await ready();
}
try {
  await docker("volume", "create", volume);
  await run();
  assert.equal(await docker("exec", name, "id", "-un"), "node");
  const c = await req("/consent");
  const p = await req("/join", "POST", {
    agreed: true,
    version: c.data.version,
  });
  assert(p.cookie.includes("Secure"));
  assert(p.cookie.includes("HttpOnly"));
  const pc = p.cookie.split(";")[0];
  const card = (kind, id, x) => ({
    id,
    kind,
    title: kind + "示例",
    background: "阿宝跨设备使用 AI",
    definition: "由于文件分散造成上传困难",
    x,
    y: 90,
    z: x,
  });
  await req(
    "/workspace",
    "PUT",
    {
      ...p.data.workspace,
      stage: "done",
      cards: [card("场景卡", "scene", 45), card("困难卡", "difficulty", 390)],
    },
    pc,
  );
  await docker("rm", "--force", name);
  await run();
  const restored = await req("/me", "GET", undefined, pc);
  assert.equal(restored.data.id, p.data.id);
  assert.equal(restored.data.workspace.stage, "done");
  assert.equal(restored.data.workspace.cards[1].x, 390);
  assert.equal(restored.data.consentText, c.data.text);
  await docker(
    "exec",
    name,
    "node",
    "scripts/export.mjs",
    "/app/data",
    "/app/data/export",
  );
  const exported = JSON.parse(
    await docker("exec", name, "cat", "/app/data/export/workshop.json"),
  );
  assert.equal(exported.participants.length, 1);
  for (let i = 0; i < 25; i++) {
    if (
      (await docker(
        "inspect",
        "--format",
        "{{.State.Health.Status}}",
        name,
      )) === "healthy"
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(
    await docker("inspect", "--format", "{{.State.Health.Status}}", name),
    "healthy",
  );
  console.log(
    "PASS: production Docker image, non-root runtime, healthcheck, Secure/HttpOnly cookies, persisted consent, cards, positions and sessions across container replacement.",
  );
} finally {
  await docker("rm", "--force", name).catch(() => {});
  await docker("volume", "rm", volume).catch(() => {});
}
