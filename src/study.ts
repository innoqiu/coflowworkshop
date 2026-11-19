export type NodeItem = {
  id: string;
  title: string;
  background: string;
  definition: string;
  materials: string[];
};
export type Scene = { id: string; title: string; nodes: NodeItem[] };
export type Answer = {
  id: string;
  node: string;
  /** 交互卡可以作为同一个设计模板放入多个困难节点；AI 卡仍只使用 node。 */
  nodes?: string[];
  kind: "交互" | "AI";
  text: string;
  io: string;
  detail?: string;
  links: string[];
  template?: string;
};
export type Rating = { score: number | null; comment: string; accepted: string[] };
export type Study = {
  step: number;
  revision: number;
  preset: string;
  practice: Answer[];
  peer: Answer[];
  target: string;
  own: Scene | null;
  reviews: Record<string, Rating>;
};
function preset(id: string, title: string, rows: string[][]): Scene {
  return {
    id,
    title,
    nodes: rows.map(([name, background, definition, material], i) => ({
      id: id + "-" + (i + 1),
      title: name,
      background,
      definition,
      materials: material.split("、"),
    })),
  };
}
export const presets = [
  preset("health", "健康管理 · 阿宝用手机和手表记录三餐、安排运动", [
    [
      "混合餐食识别",
      "阿宝拍下午餐，一盘菜里混有多种食物。",
      "一张照片难以分辨每种食材及其热量。",
      "午餐照片",
    ],
    [
      "描述食物分量",
      "阿宝不想每餐称重，用拳头和碗描述分量。",
      "反复打字负担大，估算也不准确。",
      "餐盘照片、分量记录",
    ],
    [
      "环境与库存",
      "AI 推荐三餐和运动，但阿宝已到了健身房。",
      "食谱没有考虑冰箱库存，建议与当下环境脱节。",
      "冰箱照片、运动记录",
    ],
    [
      "筛选打卡记录",
      "阿宝要回顾一个月的减脂过程。",
      "上千张照片中难以批量选出打卡照和体重截图。",
      "相册、体重截图",
    ],
  ]),
  preset("office", "轻办公 · 小李在外出途中修改汇报 PPT 和宣传图", [
    [
      "跨设备接续",
      "电脑上已经上传资料并讨论过方案。",
      "手机新窗口取不到旧文件和对话背景。",
      "历史对话、旧文献",
    ],
    [
      "论文仅读摘要",
      "小李请 AI 检索参考论文。",
      "只读摘要造成理解偏差，需要手动下载并重传全文。",
      "论文全文",
    ],
    [
      "多材料局部映射",
      "小李汇集讲义照片、参考海报和群聊转写。",
      "每份材料的用途与目标区域都需要重新说明。",
      "讲义照片、参考海报、群聊转写、汇报稿",
    ],
    [
      "转译抽象反馈",
      "老板说整体太死板，希望更有视觉冲击力。",
      "反馈难以转成对版式和配图的具体改动。",
      "语音反馈、宣传图",
    ],
  ]),
];
export const aiTemplates = ["从所选材料提取时间和主题，列出候选对应关系供用户确认。"];
export const templates = [
  "保存文件时添加标签，长按选中同类文件",
  "圈选画布局部，将修改说明绑定到选区",
];
export function answerNodes(answer: Answer) {
  if (answer.kind === "AI") return answer.node ? [answer.node] : [];
  return answer.nodes?.length
    ? Array.from(new Set(answer.nodes))
    : answer.node
      ? [answer.node]
      : [];
}
export function answerAt(answer: Answer, node: string) {
  return answerNodes(answer).includes(node);
}
export const initialStudy = (): Study => ({
  step: 2,
  revision: 0,
  preset: "",
  practice: [],
  peer: [],
  target: "",
  own: null,
  reviews: {},
});
