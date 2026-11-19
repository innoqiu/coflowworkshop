import { presets } from "../src/study.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const data = path.resolve(process.argv[2] || process.env.DATA_DIR || "data");
const out = path.resolve(process.argv[3] || "exports");
const db = new DatabaseSync(path.join(data, "workshop.sqlite"), {
  readOnly: true,
});
const participants = db
  .prepare(
    "SELECT id,created,consent_version,consent_text,workspace FROM participants WHERE id NOT LIKE 'TEST-%' ORDER BY created",
  )
  .all()
  .map((p) => ({
    id: p.id,
    createdAt: p.created,
    consentVersion: p.consent_version,
    consentText: p.consent_text,
    workspace: JSON.parse(p.workspace),
  }));
const studies = db
  .prepare("SELECT name FROM sqlite_master WHERE name='study'")
  .get()
  ? Object.fromEntries(
      db
        .prepare("SELECT * FROM study WHERE id NOT LIKE 'TEST-%'")
        .all()
        .map((r) => [r.id, JSON.parse(r.data)]),
    )
  : {};
db.close();
mkdirSync(out, { recursive: true });
writeFileSync(
  path.join(out, "workshop.json"),
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      canvas: { width: 2000, height: 1400 },
      participants,
      studies,
    },
    null,
    2,
  ),
);
const rows = [
  [
    "participant",
    "stage",
    "consentVersion",
    "signedAt",
    "cardId",
    "type",
    "title",
    "background",
    "definition",
    "x",
    "y",
    "z",
  ],
  ...participants.flatMap((p) =>
    p.workspace.cards.map((c) => [
      p.id,
      p.workspace.stage,
      p.consentVersion,
      p.createdAt,
      c.id,
      c.kind,
      c.title,
      c.background,
      c.definition,
      c.x,
      c.y,
      c.z,
    ]),
  ),
];
const escape = (v) =>
  '"' +
  String(v ?? "")
    .replace(/^[=+@\-]/, "'$&")
    .replaceAll('"', '""') +
  '"';
writeFileSync(
  path.join(out, "cards.csv"),
  "\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n"),
);
console.log(`已导出 ${participants.length} 位参与者至 ${out}`);
const nodeRows = [
  [
    "场景",
    "出题人",
    "解题人",
    "序号",
    "困难",
    "背景",
    "定义",
    "材料",
    "交互卡",
    "AI卡",
    "评分",
    "评语",
    "采纳卡",
  ],
];
const ownRows = [["出题人", "场景", "序号", "困难", "背景", "定义", "材料"]];
const hotspots = new Map();
for (const [id, s] of Object.entries(studies)) {
  if (s.own)
    s.own.nodes.forEach((n, i) =>
      ownRows.push([
        id,
        s.own.title,
        i + 1,
        n.title,
        n.background,
        n.definition,
        JSON.stringify(n.materials),
      ]),
    );
  for (const [scene, cards, submitted] of [
    [
      presets.find((p) => p.id === s.preset),
      s.practice,
      [35, 4, 5, 6].includes(s.step),
    ],
    [studies[s.target]?.own, s.peer, [5, 6].includes(s.step)],
  ]) {
    if (!scene || !submitted) continue;
    scene.nodes.forEach((n, i) => {
      const here = cards.filter((c) => c.node === n.id),
        ai = here.filter((c) => c.kind === "AI"),
        rating = studies[scene.id]?.reviews[id + "/" + n.id];
      nodeRows.push([
        scene.title,
        scene.id,
        id,
        i + 1,
        n.title,
        n.background,
        n.definition,
        JSON.stringify(n.materials),
        JSON.stringify(here.filter((c) => c.kind === "交互")),
        JSON.stringify(ai),
        rating?.score || "",
        rating?.comment || "",
        JSON.stringify(rating?.accepted || []),
      ]);
      const key = JSON.stringify([scene.id, n.id, n.title]);
      hotspots.set(key, (hotspots.get(key) || 0) + ai.length);
    });
  }
}
for (const [name, table] of [
  ["export_nodes_and_solutions", nodeRows],
  ["export_peer_scenarios", ownRows],
  [
    "export_ai_cards_hotspot",
    [
      ["场景ID", "节点ID", "困难", "AI卡使用数"],
      ...Array.from(hotspots, ([k, v]) => [...JSON.parse(k), v]).sort(
        (a, b) => b[3] - a[3],
      ),
    ],
  ],
])
  writeFileSync(
    path.join(out, name + ".csv"),
    "\uFEFF" + table.map((r) => r.map(escape).join(",")).join("\r\n"),
  );
