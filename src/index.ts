/**
 * mysuperboy - 基于 pi-mono 的终端编码 Agent
 * 
 * 支持懒加载 Skills（启动加载头部，按需读取完整内容）
 */

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { SkillManager } from "./skills/index.js";
import { join } from "path";

async function main() {
  const instruction = process.argv.slice(2).join(" ") || "你好";
  
  console.error(`🤖 mysuperboy: ${instruction}`);
  
  // 懒加载 Skills（只加载头部）
  const skillsDir = join(process.cwd(), "skills");
  const skillManager = new SkillManager(skillsDir);
  await skillManager.loadSkillsMeta();

  // 获取 OpenRouter 模型
  const model = getModel("openrouter", "auto");
  console.error("📦 Model:", model?.id);

  try {
    // 创建会话
    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      cwd: process.cwd(),
      model: model,
    });
    console.error("✅ Session created");

    // 订阅事件
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
        case "agent_end":
          console.error("\n✅ 完成");
          break;
        case "error":
          console.error("❌ Error:", JSON.stringify(event));
          break;
      }
    });

    // 发送 skills 元数据（懒加载的核心！）
    const skillPrompt = skillManager.getSystemPrompt();
    if (skillPrompt) {
      console.error("📝 Sending skills meta...");
      await session.prompt(skillPrompt);
    }
    
    // 执行用户指令
    await session.prompt(instruction);
  } catch (e) {
    console.error("❌ Error:", e);
  }
}

main();
