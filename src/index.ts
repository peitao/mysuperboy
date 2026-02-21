/**
 * mysuperboy - 基于 pi-mono 的终端编码 Agent
 */

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { SkillManager } from "./skills/index.js";
import { join } from "path";
import { writeFileSync, existsSync, mkdirSync } from "fs";

interface TurnLog {
  turn: number;
  tools: ToolCall[];
  finalText: string;
}

interface ToolCall {
  name: string;
  args: any;
  result?: string;
}

interface TaskLog {
  task: string;
  instruction: string;
  success: boolean;
  turns: TurnLog[];
  totalTools: number;
}

/**
 * 创建 Agent Session
 */
async function createAgent(options: { cwd?: string } = {}) {
  const cwd = options.cwd || process.cwd();
  const skillsDir = join(cwd, "skills");
  const skillManager = new SkillManager(skillsDir);
  await skillManager.loadSkillsMeta();
  const model = getModel("openrouter", "minimax/minimax-m2.5");
  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    cwd,
    model,
  });
  return { session, skillManager };
}

/**
 * 单次执行
 */
async function runOnce(instruction: string, cwd?: string): Promise<TaskLog> {
  const taskLog: TaskLog = {
    task: "",
    instruction,
    success: false,
    turns: [],
    totalTools: 0
  };
  
  const { session, skillManager } = await createAgent({ cwd });
  let currentTurn: TurnLog = { turn: 1, tools: [], finalText: "" };
  let turnCount = 1;
  let lastText = "";

  session.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          const text = event.assistantMessageEvent.delta;
          process.stdout.write(text);
          lastText += text;
          // 保留最后 500 字符
          if (lastText.length > 500) lastText = lastText.slice(-500);
        }
        break;
      case "tool_execution_start":
        const toolCall: ToolCall = {
          name: event.toolName,
          args: event.args,
          result: undefined
        };
        currentTurn.tools.push(toolCall);
        taskLog.totalTools++;
        console.error(`\n  > [${event.toolName}] ${JSON.stringify(event.args).slice(0, 200)}`);
        break;
      case "tool_execution_end":
        const lastTool = currentTurn.tools[currentTurn.tools.length - 1];
        if (lastTool) {
          lastTool.result = event.result ? JSON.stringify(event.result).slice(0, 300) : "done";
        }
        console.error(`  > [完成] ${currentTurn.tools[currentTurn.tools.length - 1]?.result || ""}`);
        break;
      case "turn_start":
        turnCount++;
        currentTurn.finalText = lastText.slice(-500);
        taskLog.turns.push(currentTurn);
        currentTurn = { turn: turnCount, tools: [], finalText: "" };
        lastText = "";
        break;
      case "agent_end":
        taskLog.success = true;
        console.error("\n✅ 完成");
        break;
      case "error":
        console.error("❌ Error:", JSON.stringify(event).slice(0, 200));
        break;
    }
  });

  const skillPrompt = skillManager.getSystemPrompt();
  if (skillPrompt) {
    await session.prompt(skillPrompt);
  }

  try {
    await session.prompt(instruction);
    currentTurn.finalText = lastText.slice(-500);
    taskLog.turns.push(currentTurn);
    return taskLog;
  } catch (e) {
    currentTurn.finalText = lastText.slice(-500);
    taskLog.turns.push(currentTurn);
    return taskLog;
  }
}

/**
 * 运行任务
 */
async function runTask(taskName: string, instruction: string, cwd?: string) {
  console.error(`\n========== ${taskName} ==========\n`);
  console.error(`指令: ${instruction}\n`);
  
  const log = await runOnce(instruction, cwd);
  log.task = taskName;
  
  const logsDir = join(process.cwd(), "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  
  const logFile = join(logsDir, `${taskName}.json`);
  writeFileSync(logFile, JSON.stringify(log, null, 2));
  console.error(`📝 日志已保存: ${logFile}`);
  
  return log;
}

/**
 * CLI
 */
async function main() {
  const args = process.argv.slice(2);
  
  let cwd = process.cwd();
  let taskName = "test";
  let instruction = "";
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-t" || args[i] === "--task") {
      taskName = args[++i];
    } else if (args[i] === "-c" || args[i] === "--cwd") {
      cwd = args[++i];
    } else {
      instruction += args[i] + " ";
    }
  }
  
  instruction = instruction.trim();
  
  if (instruction === "") {
    console.error("用法: npx tsx src/index.ts -t <任务名> -c <目录> <指令>");
    process.exit(1);
  }
  
  await runTask(taskName, instruction, cwd);
}

main();
