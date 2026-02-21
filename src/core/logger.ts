/**
 * 日志记录模块
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { TaskLog, TurnLog, ToolCall } from "../types.js";

/**
 * 控制台日志记录器
 */
export class ConsoleLogger {
  private taskName: string;

  constructor(taskName: string = "task") {
    this.taskName = taskName;
  }

  info(msg: string): void {
    console.error(`[${this.taskName}] ${msg}`);
  }

  error(msg: string): void {
    console.error(`[${this.taskName}] ❌ ${msg}`);
  }

  tool(name: string, args: any): void {
    console.error(`  > [${name}] ${JSON.stringify(args).slice(0, 200)}`);
  }

  done(): void {
    console.error(`[${this.taskName}] ✅ 完成`);
  }
}

/**
 * 文件日志记录器
 */
export class FileLogger {
  private logs: TaskLog;
  private cwd: string;

  constructor(taskName: string, instruction: string, cwd: string) {
    this.cwd = cwd;
    this.logs = {
      task: taskName,
      instruction,
      success: false,
      turns: [],
      totalTools: 0,
    };
    this.currentTurn = { turn: 1, tools: [], finalText: "" };
  }

  private currentTurn: TurnLog = { turn: 1, tools: [], finalText: "" };
  private turnCount = 1;
  private lastText = "";

  toolStart(name: string, args: any): void {
    const toolCall: ToolCall = { name, args, result: undefined };
    this.currentTurn.tools.push(toolCall);
    this.logs.totalTools++;
  }

  toolEnd(result: any): void {
    const lastTool = this.currentTurn.tools[this.currentTurn.tools.length - 1];
    if (lastTool) {
      lastTool.result = result ? JSON.stringify(result).slice(0, 300) : "done";
    }
  }

  textDelta(text: string): void {
    this.lastText += text;
    process.stdout.write(text);
    if (this.lastText.length > 500) {
      this.lastText = this.lastText.slice(-500);
    }
  }

  turnStart(): void {
    this.turnCount++;
    this.currentTurn.finalText = this.lastText.slice(-500);
    this.logs.turns.push(this.currentTurn);
    this.currentTurn = { turn: this.turnCount, tools: [], finalText: "" };
    this.lastText = "";
  }

  success(): void {
    this.logs.success = true;
    this.currentTurn.finalText = this.lastText.slice(-500);
    this.logs.turns.push(this.currentTurn);
  }

  save(): void {
    const logsDir = join(this.cwd, "logs");
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    const logFile = join(logsDir, `${this.logs.task}.json`);
    writeFileSync(logFile, JSON.stringify(this.logs, null, 2));
    console.error(`📝 Log saved: ${logFile}`);
  }
}
