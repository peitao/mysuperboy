/**
 * Gateway Server - HTTP + Telegram Bot
 * 
 * 启动方式:
 *   npx tsx src/gateway/server.ts
 *   # 或
 *   TELEGRAM_BOT_TOKEN=xxx PORT=3000 npx tsx src/gateway/server.ts
 */

import http from "http";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { TelegramHandler } from "./telegram.js";
import type { GatewayConfig, TelegramUpdate } from "./types.js";

// 加载环境变量
function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
        }
      }
    }
  }
}

loadEnv();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const PORT = parseInt(process.env.PORT || "3000");

class GatewayServer {
  private server: http.Server | null = null;
  private telegram: TelegramHandler | null = null;

  async start(config: GatewayConfig): Promise<void> {
    const { port, telegram } = config;

    // 启动 HTTP 服务器
    this.server = http.createServer(this.handleRequest.bind(this));
    
    this.server.listen(port, () => {
      console.log(`🚀 Gateway Server 启动成功: http://localhost:${port}`);
    });

    // 启动 Telegram Bot
    if (telegram?.botToken) {
      await this.startTelegramBot(telegram.botToken, telegram.webhookUrl, telegram.polling);
    }
  }

  /**
   * 启动 Telegram Bot
   */
  private async startTelegramBot(botToken: string, webhookUrl?: string, polling = false): Promise<void> {
    this.telegram = new TelegramHandler(botToken);

    // 获取 Bot 信息
    try {
      const botInfo = await this.telegram.getMe();
      console.log(`✅ Telegram Bot 已连接: @${botInfo.result.username}`);
    } catch (error) {
      console.error("❌ Telegram Bot 连接失败:", error);
      return;
    }

    // 设置 Webhook 或使用 Polling
    if (webhookUrl) {
      await this.telegram.setWebhook(webhookUrl);
    } else if (polling) {
      await this.startPolling();
    } else {
      // 默认使用 Webhook（适合生产环境）
      console.log("📝 使用 Webhook 模式，请设置 TELEGRAM_WEBHOOK_URL");
    }
  }

  /**
   * 简单的 Polling 实现
   */
  private async startPolling(): Promise<void> {
    if (!this.telegram) return;

    let offset = 0;
    console.log("🔄 开始 Polling...");

    const poll = async () => {
      try {
        const url = `https://api.telegram.org/bot${this.telegram?.botToken}/getUpdates?offset=${offset}&timeout=10`;
        console.log("[Polling] 请求更新...");
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
          console.error("[Polling] API 错误:", data.description);
          if (data.error_code === 409) {
            console.log("[Polling] 409 冲突，等待 5 秒重试...");
            await new Promise(r => setTimeout(r, 5000));
            offset = 0;
          }
        } else if (data.result?.length > 0) {
          console.log(`[Polling] 收到 ${data.result.length} 条更新`);
          for (const update of data.result) {
            await this.telegram!.handleUpdate(update as TelegramUpdate);
            offset = (update.update_id || 0) + 1;
          }
        } else {
          console.log("[Polling] 无新消息");
        }
      } catch (error) {
        console.error("[Polling] 错误:", error);
      }

      // 继续轮询
      setTimeout(poll, 1000);
    };

    poll();
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || "";
    const method = req.method || "GET";

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Telegram Webhook
    if (method === "POST" && url === "/webhook") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }

        const update: TelegramUpdate = JSON.parse(body);
        
        if (this.telegram) {
          await this.telegram.handleUpdate(update);
        }

        res.writeHead(200);
        res.end("OK");
      } catch (error: any) {
        console.error("Webhook error:", error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // 健康检查
    if (method === "GET" && url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
      return;
    }

    // API: 调用 Agent
    if (method === "POST" && url === "/agent") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }

        const { instruction, options } = JSON.parse(body);

        if (!instruction) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "instruction is required" }));
          return;
        }

        // 导入并运行 Agent
        const { run } = await import("../index.js");
        
        // 收集输出
        let output = "";
        const originalLog = console.log;
        console.log = (...args) => { output += args.join(" ") + "\n"; };
        
        try {
          await run(instruction, {
            task: "api-request",
            cwd: process.cwd(),
            logging: false,
            ...options,
          });
        } finally {
          console.log = originalLog;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, output }));
      } catch (error: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // 根路径
    if (method === "GET" && (url === "/" || url === "")) {
      res.writeHead(200);
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MySuperBoy Gateway</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    .info { background: #f5f5f5; padding: 15px; border-radius: 8px; }
    .info p { margin: 8px 0; }
    code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🤖 MySuperBoy Gateway</h1>
  <div class="info">
    <p><strong>状态:</strong> 运行中</p>
    <p><strong>Telegram:</strong> ${TELEGRAM_BOT_TOKEN ? "✅ 已配置" : "❌ 未配置"}</p>
    <p><strong>端口:</strong> ${PORT}</p>
  </div>
  <h2>API</h2>
  <ul>
    <li><code>POST /agent</code> - 调用 Agent</li>
    <li><code>POST /webhook</code> - Telegram Webhook</li>
    <li><code>GET /health</code> - 健康检查</li>
  </ul>
</body>
</html>
      `);
      return;
    }

    // 404
    res.writeHead(404);
    res.end("Not Found");
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    console.log("🛑 Gateway Server 已停止");
  }
}

// 主入口
async function main() {
  console.log("🤖 MySuperBoy Gateway 启动中...\n");

  if (!TELEGRAM_BOT_TOKEN) {
    console.log("⚠️  未设置 TELEGRAM_BOT_TOKEN，请创建 .env 文件:");
    console.log(`
TELEGRAM_BOT_TOKEN=your_bot_token_here
PORT=3000
# 可选:
# TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook
# TELEGRAM_POLLING=true
`);
  }

  const server = new GatewayServer();

  // 优雅关闭
  process.on("SIGINT", async () => {
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.stop();
    process.exit(0);
  });

  await server.start({
    port: PORT,
    telegram: TELEGRAM_BOT_TOKEN
      ? {
          botToken: TELEGRAM_BOT_TOKEN,
          webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
          polling: process.env.TELEGRAM_POLLING === "true",
        }
      : undefined,
  });
}

main();
