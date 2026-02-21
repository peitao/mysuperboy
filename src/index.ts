/**
 * mysuperboy - 基于 pi-mono 的终端编码 Agent
 * 
 * 用法:
 *   npx tsx src/index.ts -t <任务名> -c <目录> -m <模型> "<指令>"
 */

import { createAgentSession, SessionManager, type AgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { SkillManager } from "./skills/index.js";
import { join } from "path";
import { writeFileSync, existsSync, mkdirSync } from "fs";

// ========== 类型定义 ==========

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

interface AgentOptions {
  cwd?: string;
  model?: string;
  skills?: boolean;
}

// ========== Agent 核心 ==========

async function createAgent(options: AgentOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const skillsDir = join(cwd, "skills");
  const skillManager = new SkillManager(skillsDir);
  await skillManager.loadSkillsMeta();
  
  // 解析模型
  const parts = (options.model || "openrouter/minimax/minimax-m2.5").split("/");
  const provider = parts[0];
  const modelId = parts.slice(1).join("/");
  const model = getModel(provider, modelId);
  
  if (!model) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    cwd,
    model,
  });

  return { session, skillManager };
}

// ========== 运行任务 ==========

async function runOnce(instruction: string, options: AgentOptions = {}): Promise<TaskLog> {
  const taskLog: TaskLog = {
    task: "",
    instruction,
    success: false,
    turns: [],
    totalTools: 0
  };
  
  const { session, skillManager } = await createAgent(options);
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
          if (lastText.length > 500) lastText = lastText.slice(-500);
        }
        break;
      case "tool_execution_start":
        currentTurn.tools.push({
          name: event.toolName,
          args: event.args,
        });
        taskLog.totalTools++;
        console.error(`\n  > [${event.toolName}] ${JSON.stringify(event.args).slice(0, 100)}`);
        break;
      case "tool_execution_end":
        const lastTool = currentTurn.tools[currentTurn.tools.length - 1];
        if (lastTool) {
          lastTool.result = event.result ? JSON.stringify(event.result).slice(0, 300) : "done";
        }
        console.error(`  > [完成]`);
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

  // 发送 skills
  if (options.skills !== false) {
    const skillPrompt = skillManager.getSystemPrompt();
    if (skillPrompt) {
      await session.prompt(skillPrompt);
    }
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

// ========== CLI 入口 ==========

async function main() {
  const args = process.argv.slice(2);
  
  let cwd = process.cwd();
  let taskName = "";
  let instruction = "";
  let model = "openrouter/minimax/minimax-m2.5";
  let enableSkills = true;
  
  // 解析参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-t" || args[i] === "--task") {
      taskName = args[++i];
    } else if (args[i] === "-c" || args[i] === "--cwd") {
      cwd = args[++i];
    } else if (args[i] === "-m" || args[i] === "--model") {
      model = args[++i];
    } else if (args[i] === "--no-skills") {
      enableSkills = false;
    } else {
      instruction += args[i] + " ";
    }
  }
  
  instruction = instruction.trim();
  
  if (!instruction) {
    console.error(`
用法: npx tsx src/index.ts [选项] <指令>

选项:
  -t, --task <名称>   任务名称（用于日志）
  -c, --cwd <目录>    工作目录
  -m, --model <模型>  模型 (默认: openrouter/minimax/minimax-m2.5)
  --no-skills         禁用 skills

示例:
  npx tsx src/index.ts -t hello "Create hello.txt"
  npx tsx src/index.ts -c /tmp -m openrouter/qwen/qwen3-8b "Hi"
`);
    process.exit(1);
  }
  
  if (taskName) {
    console.error(`\n========== ${taskName} ==========\n`);
  }
  
  const log = await runOnce(instruction, { cwd, model, skills: enableSkills });
  log.task = taskName;
  
  // 保存日志
  if (taskName) {
    const logsDir = join(process.cwd(), "logs");
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    const logFile = join(logsDir, `${taskName}.json`);
    writeFileSync(logFile, JSON.stringify(log, null, 2));
    console.error(`📝 日志已保存: ${logFile}`);
  }
}

main();
