/**
 * mysuperboy - 基于 pi-mono 的终端编码 Agent
 * 
 * 支持:
 * - CLI 命令行
 * - 懒加载 Skills（启动加载头部，按需读取完整内容）
 * - Terminal-Bench 评估框架
 */

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { SkillManager } from "./skills/index.js";
import { join } from "path";
import * as readline from "readline";

interface TBAgentResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * 创建 Agent Session
 */
async function createAgent(options: {
  cwd?: string;
  model?: string;
  skills?: boolean;
} = {}) {
  const cwd = options.cwd || process.cwd();
  
  // Skills
  const skillsDir = join(cwd, "skills");
  const skillManager = new SkillManager(skillsDir);
  await skillManager.loadSkillsMeta();

  // Model
  const model = getModel("openrouter", "auto");
  
  // Session
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
async function runOnce(instruction: string, cwd?: string): Promise<TBAgentResult> {
  const { session, skillManager } = await createAgent({ cwd });
  let output = "";
  let error: string | undefined;

  session.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          output += event.assistantMessageEvent.delta;
          process.stdout.write(event.assistantMessageEvent.delta);
        }
        break;
      case "tool_execution_start":
        console.error(`\n  > [${event.toolName}]`);
        break;
      case "tool_execution_end":
        console.error(`  > [完成]`);
        break;
      case "agent_end":
        console.error("\n✅ 完成");
        break;
      case "error":
        error = JSON.stringify(event);
        break;
    }
  });

  // 发送 skills 元数据
  const skillPrompt = skillManager.getSystemPrompt();
  if (skillPrompt) {
    await session.prompt(skillPrompt);
  }

  try {
    await session.prompt(instruction);
    return { success: true, output };
  } catch (e) {
    return { success: false, output, error: String(e) };
  }
}

/**
 * 交互模式
 */
async function interactive(cwd?: string) {
  const { session, skillManager } = await createAgent({ cwd });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🧒 mysuperboy - 交互模式");
  console.log(`📁 工作目录: ${cwd || process.cwd()}`);
  console.log("输入你的指令 (输入 'exit' 退出):\n");

  // 发送 skills
  const skillPrompt = skillManager.getSystemPrompt();
  if (skillPrompt) {
    await session.prompt(skillPrompt);
  }

  session.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          process.stdout.write(event.assistantMessageEvent.delta);
        }
        break;
      case "tool_execution_start":
        console.error(`\n  > [${event.toolName}]`);
        break;
      case "tool_execution_end":
        console.error(`  > [完成]`);
        break;
    }
  });

  const ask = () => {
    rl.question("> ", async (input) => {
      if (input.toLowerCase() === "exit") {
        rl.close();
        return;
      }
      console.log("");
      await session.prompt(input);
      console.log("\n");
      ask();
    });
  };

  ask();
}

/**
 * Terminal-Bench 导出
 */
export { createAgent, runOnce };
export const AgentWrapper = { createAgent, runOnce };

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2);
  
  // -i: 交互模式
  // -c <dir>: 指定工作目录
  // 其他: 指令
  
  let cwd = process.cwd();
  let instruction = "";
  let mode: "run" | "interactive" = "run";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-i" || args[i] === "--interactive") {
      mode = "interactive";
    } else if (args[i] === "-c" || args[i] === "--cwd") {
      cwd = args[++i];
    } else {
      instruction += args[i] + " ";
    }
  }

  instruction = instruction.trim();

  if (mode === "interactive" || instruction === "") {
    await interactive(cwd);
  } else {
    console.error(`🤖 mysuperboy: ${instruction}`);
    const result = await runOnce(instruction, cwd);
    if (!result.success) {
      process.exit(1);
    }
  }
}

main();
