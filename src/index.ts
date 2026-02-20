/**
 * mysuperboy - 基于 pi-mono 的终端编码 Agent
 * 
 * 支持自定义 skills 和 tools
 */

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { SkillManager } from "./skills/index.js";
import { join } from "path";

async function main() {
  const instruction = process.argv.slice(2).join(" ") || "你好";
  
  console.error(`🤖 mysuperboy: ${instruction}`);
  
  // 加载 Skills
  const skillsDir = join(process.cwd(), "skills");
  const skillManager = new SkillManager(skillsDir);
  await skillManager.loadSkills();
  await skillManager.init();

  // 获取 OpenRouter 模型
  const model = getModel("openrouter", "auto");
  console.error("📦 Model:", model?.id);
  
  // 获取自定义 tools
  const customTools = skillManager.getCustomTools();
  console.error("🔧 Custom tools:", customTools.map(t => t.name).join(", "));

  try {
    // 创建会话，传入自定义 tools
    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      cwd: process.cwd(),
      model: model,
      customTools: customTools,
    });
    console.error("✅ Session created");

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

    // 如果有 skill prompts，先发送
    const skillPrompts = skillManager.getPrompts();
    if (skillPrompts.length > 0) {
      console.error("📝 Sending skill prompts...");
      await session.prompt(skillPrompts.join("\n"));
    }
    
    // 执行用户指令
    await session.prompt(instruction);
  } catch (e) {
    console.error("❌ Error:", e);
  }
}

main();
