export const kinds = ["场景卡", "材料卡", "困难卡", "交互卡", "AI卡"] as const;
export type Kind = (typeof kinds)[number];
export type Card = {
  parent?: string;
  id: string;
  kind: Kind;
  title: string;
  background: string;
  definition: string;
  x: number;
  y: number;
  z: number;
};
export type Workspace = {
  stage: "intro" | "scenario" | "difficulty" | "board" | "done";
  intro: number;
  cards: Card[];
  view: { x: number; y: number; scale: number };
  revision: number;
};
export type Participant = {
  id: string;
  createdAt: string;
  consentVersion: number;
  consentText: string;
  workspace: Workspace;
};
