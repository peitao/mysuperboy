/**
 * Telegram Bot 处理模块
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { run } from "../index.js";
import type { TelegramUpdate, TelegramMessage, AgentOptions } from "./types.js";

export class TelegramHandler {
  private botToken: string;
  private chatId: number | null = null;
  private isProcessing = false;
  private messageBuffer: string[] = [];
  private bufferTimeout: NodeJS.Timeout | null = null;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  /**
   * 处理 Telegram Webhook 或 Polling 收到的更新
   */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    console.log("[Telegram] 收到更新:", JSON.stringify(update).slice(0, 200));
    
    const message = update.message || update.edited_message;
    if (!message) {
      console.log("[Telegram] 无消息内容");
      return;
    }

    // 只处理私聊消息
    if (message.chat.type !== "private") {
      console.log("[Telegram] 非私聊消息，跳过");
      return;
    }

    const chatId = message.chat.id;
    const text = message.text;

    if (!text) {
      console.log("[Telegram] 无文本内容");
      return;
    }

    console.log(`[Telegram] 收到消息 from ${chatId}: ${text.slice(0, 50)}`);

    // 保存 chatId 用于发送回复
    this.chatId = chatId;

    // 发送"正在思考"状态
    console.log("[Telegram] 发送 typing 状态...");
    try {
      await this.sendChatAction(chatId, "typing");
    } catch (e: any) {
      console.error("[Telegram] typing 失败:", e.message);
    }
    console.log("[Telegram] 继续处理...");

    // 收集消息（支持多段输入）
    this.messageBuffer.push(text);

    // 清空之前的超时
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
    }

    // 500ms 后再处理，给用户时间输入多段消息
    console.log("[Telegram] 设置 500ms 延迟处理...");
    this.bufferTimeout = setTimeout(async () => {
      console.log("[Telegram] 开始处理消息...");
      const fullInstruction = this.messageBuffer.join("\n");
      this.messageBuffer = [];
      console.log(`[Telegram] 指令: ${fullInstruction.slice(0, 50)}`);

      if (this.isProcessing) {
        await this.sendMessage(chatId, "⏳ 正在处理上一条消息，请稍候...");
        return;
      }

      await this.processMessage(chatId, fullInstruction);
    }, 500);
  }

  /**
   * 处理单条消息，调用 Agent
   */
  private async processMessage(chatId: number, instruction: string): Promise<void> {
    this.isProcessing = true;

    const taskName = `telegram-${chatId}`;

    try {
      console.log(`[Telegram] 开始处理: ${instruction.slice(0, 20)}...`);

      // 直接用子进程运行，捕获 stdout
      const { spawn } = await import("child_process");
      
      // 读取 .env 文件获取 API key
      const envPath = join(process.cwd(), ".env");
      const env: Record<string, string> = { ...process.env };
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf-8");
        for (const line of envContent.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...valueParts] = trimmed.split("=");
            if (key && valueParts.length > 0) {
              env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
            }
          }
        }
      }
      
      const agentProcess = spawn("npx", [
        "tsx", "src/index.ts",
        "-t", taskName,
        "-c", process.cwd(),
        instruction
      ], {
        cwd: process.cwd(),
        env,
      });

      let output = "";
      agentProcess.stdout?.on("data", (data) => {
        output += data.toString();
      });
      agentProcess.stderr?.on("data", (data) => {
        output += data.toString();
      });

      await new Promise<void>((resolve) => {
        agentProcess.on("close", () => resolve());
      });

      // 提取 Agent 输出部分（去掉日志前缀）
      const lines = output.split("\n");
      const agentOutput = lines
        .filter(line => !line.match(/^\[.*\]/) && line.trim())
        .join("\n")
        .trim();

      const responseText = agentOutput || "✅ Agent 已完成处理";

      console.log(`[Telegram] 输出长度: ${responseText.length}`);
      // 发送回复
      await this.sendLongMessage(chatId, responseText);
      console.log("[Telegram] 回复已发送");

    } catch (error: any) {
      console.log(`[Telegram] 错误: ${error.message}`);
      await this.sendMessage(chatId, `❌ 错误: ${error.message || error}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 发送聊天动作（typing, uploading_document 等）
   */
  async sendChatAction(chatId: number, action: string): Promise<void> {
    await this.api("sendChatAction", {
      chat_id: chatId,
      action,
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.api("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    });
  }

  /**
   * 发送长消息（自动分段）
   */
  async sendLongMessage(chatId: number, text: string, maxLength = 4000): Promise<void> {
    // 移除 markdown 中可能导致问题的字符
    text = text.replace(/[*_`]/g, (m) => (m === "*" ? "★" : m === "_" ? "_" : "'"));

    if (text.length <= maxLength) {
      await this.sendMessage(chatId, text);
      return;
    }

    // 分段发送
    const chunks = this.splitMessage(text, maxLength);
    for (let i = 0; i < chunks.length; i++) {
      await this.sendMessage(chatId, `${chunks[i]}\n\n--- [${i + 1}/${chunks.length}] ---`);
      // 添加延迟避免触发限流
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * 简单分段
   */
  private splitMessage(text: string, maxLength: number): string[] {
    const lines = text.split("\n");
    const chunks: string[] = [];
    let current = "";

    for (const line of lines) {
      if (current.length + line.length + 1 > maxLength) {
        if (current) chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }
    if (current) chunks.push(current);

    return chunks;
  }

  /**
   * 调用 Telegram API
   */
  private async api(method: string, params: Record<string, any>): Promise<any> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Telegram API error: ${error}`);
      throw new Error(`Telegram API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * 设置 Webhook
   */
  async setWebhook(url: string): Promise<void> {
    await this.api("setWebhook", { url });
    console.log(`✅ Webhook 设置成功: ${url}`);
  }

  /**
   * 删除 Webhook
   */
  async deleteWebhook(): Promise<void> {
    await this.api("deleteWebhook");
    console.log("✅ Webhook 已删除");
  }

  /**
   * 获取 Bot 信息
   */
  async getMe(): Promise<any> {
    return this.api("getMe");
  }
}
