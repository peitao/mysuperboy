/**
 * mysuperboy - 基于 pi-mono 的终端编码 Agent
 * 
 * 支持:
 * - 交互模式
 * - 命令行单次执行
 * - Terminal-Bench 评估框架集成
 */

import { createAgentSession, SessionManager, type AgentSession } from "@mariozechner/pi-coding-agent";
import { getModel, type Model } from "@mariozechner/pi-ai";
import * as readline from "readline";

interface AgentOptions {
  model?: string;
  workspace?: string;
  apiKey?: string;
  thinking?: "off" | "low" | "medium" | "high" | "xhigh";
}

interface TBAgentResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * MySuperBoy Agent 类
 */
export class MySuperBoy {
  private session: AgentSession | null = null;
  private options: Required<AgentOptions>;

  constructor(options: AgentOptions = {}) {
    this.options = {
      model: options.model || process.env.MODEL || "openrouter/qwen/qwen3-8b",
      workspace: options.workspace || process.env.AGENT_WORKSPACE || "/app",
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY || "",
      thinking: options.thinking || "medium",
    };
  }

  /**
   * 获取模型
   */
  private resolveModel(): Model {
    const [provider, modelId] = this.options.model.split("/");
    const model = getModel(provider as any, modelId);
    if (!model) {
      throw new Error(`Unknown model: ${this.options.model}`);
    }
    return model;
  }

  /**
   * 初始化会话
   */
  async init(): Promise<void> {
    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      cwd: this.options.workspace,
    });
    this.session = session;
  }

  /**
   * 执行单个任务（Terminal-Bench 格式）
   */
  async runTask(instruction: string): Promise<TBAgentResult> {
    if (!this.session) {
      await this.init();
    }

    let output = "";
    let error: string | undefined;

    this.session!.subscribe((event) => {
      switch (event.type) {
        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            output += event.assistantMessageEvent.delta;
            process.stdout.write(event.assistantMessageEvent.delta);
          }
          break;
        case "tool_execution_start":
          console.error(`[TOOL] ${event.toolName}: ${JSON.stringify(event.args).slice(0, 200)}`);
          break;
        case "tool_execution_end":
          console.error(`[TOOL] ${event.toolName} completed`);
          break;
        case "error":
          error = JSON.stringify(event);
          console.error(`[ERROR] ${error}`);
          break;
        case "agent_end":
          console.error(`[DONE] Agent finished`);
          break;
      }
    });

    try {
      await this.session!.prompt(instruction);
      return { success: true, output };
    } catch (e) {
      return { success: false, output, error: String(e) };
    }
  }

  /**
   * 交互模式
   */
  async interactive(): Promise<void> {
    if (!this.session) {
      await this.init();
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("🧒 mysuperboy - 交互模式");
    console.log(`📁 工作目录: ${this.options.workspace}`);
    console.log(`🤖 模型: ${this.options.model}`);
    console.log("输入你的指令 (输入 'exit' 退出):\n");

    const ask = () => {
      rl.question("> ", async (input) => {
        if (input.toLowerCase() === "exit") {
          rl.close();
          return;
        }

        console.log("");
        await this.session!.prompt(input);
        console.log("\n");
        ask();
      });
    };

    ask();
  }

  /**
   * 关闭会话
   */
  async close(): Promise<void> {
    // 清理资源
  }
}

/**
 * Terminal-Bench Agent Wrapper 导出
 * 用于 tb run --agent-import-path
 */
export const AgentWrapper = MySuperBoy;

// CLI 入口
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // 交互模式
    const agent = new MySuperBoy();
    await agent.interactive();
  } else {
    // 单次执行
    const instruction = args.join(" ");
    const agent = new MySuperBoy();
    
    console.error(`[Agent] 执行: ${instruction.slice(0, 100)}...`);
    
    const result = await agent.runTask(instruction);
    
    if (!result.success) {
      process.exit(1);
    }
  }
}

main().catch(console.error);
