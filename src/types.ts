/**
 * 类型定义
 */

export interface TurnLog {
  turn: number;
  tools: ToolCall[];
  finalText: string;
}

export interface ToolCall {
  name: string;
  args: any;
  result?: string;
}

export interface TaskLog {
  task: string;
  instruction: string;
  success: boolean;
  turns: TurnLog[];
  totalTools: number;
}

export interface AgentOptions {
  cwd?: string;
  model?: string;
  apiKey?: string;
  skills?: boolean;
  logging?: boolean;
}

export interface Logger {
  info(msg: string): void;
  error(msg: string): void;
  tool(name: string, args: any): void;
}
