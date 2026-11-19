import type { DatabaseSync } from "node:sqlite";
import { answerAt, presets } from "./study.ts";

const escapeCsv = (value: unknown) =>
  '"' + String(value ?? "").replace(/^[=+@\-]/, "'$&").replaceAll('"', '""') + '"';
const csv = (rows: unknown[][]) =>
  "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");

export function buildExportFiles(db: DatabaseSync) {
  const participants = db.prepare("SELECT id,created,consent_version,consent_text,workspace FROM participants WHERE id NOT LIKE 'TEST-%' ORDER BY created").all().map((participant: any) => ({
    id: participant.id,
    createdAt: participant.created,
    consentVersion: participant.consent_version,
    consentText: participant.consent_text,
    workspace: JSON.parse(participant.workspace),
  }));
  const studies: Record<string, any> = db.prepare("SELECT name FROM sqlite_master WHERE name='study'").get()
    ? Object.fromEntries(db.prepare("SELECT * FROM study WHERE id NOT LIKE 'TEST-%'").all().map((row: any) => [row.id, JSON.parse(row.data)]))
    : {};
  const workspaceHistory = db.prepare("SELECT name FROM sqlite_master WHERE name='workspace_history'").get()
    ? db.prepare("SELECT participant_id,revision,saved,workspace FROM workspace_history WHERE participant_id NOT LIKE 'TEST-%' ORDER BY participant_id,revision").all().map((row: any) => ({ participantId: row.participant_id, revision: row.revision, savedAt: row.saved, workspace: JSON.parse(row.workspace) }))
    : [];
  const studyHistory = db.prepare("SELECT name FROM sqlite_master WHERE name='study_history'").get()
    ? db.prepare("SELECT participant_id,revision,saved,data FROM study_history WHERE participant_id NOT LIKE 'TEST-%' ORDER BY participant_id,revision").all().map((row: any) => ({ participantId: row.participant_id, revision: row.revision, savedAt: row.saved, study: JSON.parse(row.data) }))
    : [];
  const exportedAt = new Date().toISOString();
  const files: Record<string, string> = {};
  files["workshop.json"] = JSON.stringify({ exportedAt, canvas: { width: 2000, height: 1400 }, participants, studies, history: { workspaces: workspaceHistory, studies: studyHistory } }, null, 2);
  files["cards.csv"] = csv([
    ["participant", "stage", "consentVersion", "signedAt", "cardId", "type", "title", "background", "definition", "x", "y", "z"],
    ...participants.flatMap((participant: any) => participant.workspace.cards.map((card: any) => [
      participant.id, participant.workspace.stage, participant.consentVersion, participant.createdAt,
      card.id, card.kind, card.title, card.background, card.definition, card.x, card.y, card.z,
    ])),
  ]);

  const nodeRows: unknown[][] = [["场景", "出题人", "解题人", "序号", "困难", "背景", "定义", "材料", "交互卡", "AI卡", "方案是否修改过", "评分", "评语", "采纳卡"]];
  const ownRows: unknown[][] = [["出题人", "场景", "序号", "困难", "背景", "定义", "材料"]];
  const hotspots = new Map<string, number>();
  for (const [participantId, study] of Object.entries(studies)) {
    if (study.own) study.own.nodes.forEach((node: any, index: number) => ownRows.push([
      participantId, study.own.title, index + 1, node.title, node.background, node.definition, JSON.stringify(node.materials),
    ]));
    const submissions: Array<[any, any[], boolean, boolean]> = [
      [presets.find((preset) => preset.id === study.preset), study.practice || [], [35, 4, 5, 6].includes(study.step), Boolean(study.practiceModified)],
      [studies[study.target]?.own, study.peer || [], [5, 6].includes(study.step), Boolean(study.peerModified)],
    ];
    for (const [scene, cards, submitted, modified] of submissions) {
      if (!scene || !submitted) continue;
      scene.nodes.forEach((node: any, index: number) => {
        const here = cards.filter((card) => answerAt(card, node.id));
        const ai = here.filter((card) => card.kind === "AI");
        const rating = studies[scene.id]?.reviews?.[participantId + "/" + node.id];
        nodeRows.push([
          scene.title, scene.id, participantId, index + 1, node.title, node.background, node.definition,
          JSON.stringify(node.materials), JSON.stringify(here.filter((card) => card.kind === "交互")), JSON.stringify(ai),
          modified ? "是" : "否", rating?.score ?? "", rating?.comment ?? "", JSON.stringify(rating?.accepted || []),
        ]);
        const key = JSON.stringify([scene.id, node.id, node.title]);
        hotspots.set(key, (hotspots.get(key) || 0) + ai.length);
      });
    }
  }
  files["export_nodes_and_solutions.csv"] = csv(nodeRows);
  files["export_peer_scenarios.csv"] = csv(ownRows);
  files["export_ai_cards_hotspot.csv"] = csv([
    ["场景ID", "节点ID", "困难", "AI卡使用数"],
    ...Array.from(hotspots, ([key, value]) => [...JSON.parse(key), value]).sort((a, b) => Number(b[3]) - Number(a[3])),
  ]);
  return { files, participantCount: participants.length, exportedAt };
}
