/**
 * mysuperboy - 终端编码 Agent
 * 
 * 基于 pi-mono 构建，支持自定义 Skills
 */

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { SkillManager } from "./skills/index.js";
import { ConsoleLogger, FileLogger } from "./core/logger.js";
import type { AgentOptions } from "./types.js";
import { readFileSync, existsSync } from "fs";

/**
 * 创建 Agent 并运行任务
 */
export async function run(
  instruction: string,
  options: AgentOptions = {}
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const taskName = options.task || "test";
  const model = options.model || "minimax/minimax-m2.5";
  const saveLog = options.logging !== false;

  const logger = new ConsoleLogger(taskName);
  const fileLogger = saveLog ? new FileLogger(taskName, instruction, cwd) : null;

  logger.info(`Model: ${model}`);
  logger.info(`CWD: ${cwd}`);

  // 加载 Skills
  const skillsDir = `${cwd}/skills`;
  const skillManager = new SkillManager(skillsDir);
  await skillManager.loadSkillsMeta();

  // 获取模型
  const resolvedModel = getModel("openrouter", model);
  if (!resolvedModel) {
    throw new Error(`Model not found: ${model}`);
  }

  // 创建会话
  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    cwd,
    model: resolvedModel,
  });

  // 订阅事件
  session.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          fileLogger?.textDelta(event.assistantMessageEvent.delta);
        }
        break;
      case "message_start":
        // 开始新的助手消息
        if (event.message?.role === "assistant") {
          fileLogger?.turnStart();
        }
        break;
      case "message_end":
        // 消息结束，保存完整内容
        if (event.message?.role === "assistant" && event.message?.content) {
          // 从 content 提取文本
          const content = event.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "output_text") {
                fileLogger?.textDelta(block.text || "");
              }
            }
          }
        }
        break;
      case "tool_execution_start":
        logger.tool(event.toolName, event.args);
        fileLogger?.toolStart(event.toolName, event.args);
        break;
      case "tool_execution_end":
        fileLogger?.toolEnd(event.result);
        break;
      case "turn_start":
        fileLogger?.turnStart();
        break;
      case "agent_end":
        fileLogger?.success();
        logger.done();
        break;
      case "error":
        logger.error(JSON.stringify(event).slice(0, 200));
        break;
    }
  });

  // 发送 skill 提示
  const skillPrompt = skillManager.getSystemPrompt();
  if (skillPrompt) {
    await session.prompt(skillPrompt);
  }

  // 执行任务
  await session.prompt(instruction);

  // 从 session.state.messages 获取完整输出
  const assistantMessages = session.state.messages.filter((m) => m.role === "assistant");
  console.error(`[debug] assistant messages: ${assistantMessages.length}`);
  for (const msg of assistantMessages) {
    console.error(`[debug] msg content:`, JSON.stringify(msg.content)?.slice(0, 500));
    if (msg.content) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "output_text") {
            fileLogger?.textDelta(block.text || "");
          }
        }
      }
    }
  }

  // 保存日志
  fileLogger?.save();
}

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2);
  
  let cwd = process.cwd();
  let task = "test";
  let instruction = "";
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-t" || args[i] === "--task") {
      task = args[++i];
    } else if (args[i] === "-c" || args[i] === "--cwd") {
      cwd = args[++i];
    } else if (args[i] === "-i" || args[i] === "--instruction-file") {
      const file = args[++i];
      if (existsSync(file)) {
        instruction = readFileSync(file, "utf-8");
      }
    } else if (args[i] === "-m" || args[i] === "--model") {
      i++;
    } else {
      instruction += args[i] + " ";
    }
  }
  
  instruction = instruction.trim();
  
  if (!instruction) {
    console.error("用法: npx tsx src/index.ts -t <任务名> -c <目录> <指令>");
    process.exit(1);
  }

  await run(instruction, { cwd, task, logging: true });
}

// 只在直接运行时执行
if (process.argv[1]?.endsWith("index.ts")) {
  main();
}
