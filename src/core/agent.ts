/**
 * Agent 核心模块
 */

import { createAgentSession, SessionManager, type AgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { AgentOptions, Logger } from "../types.js";

/**
 * 创建 Agent Session
 */
export async function createSession(options: AgentOptions = {}, logger?: Logger) {
  const cwd = options.cwd || process.cwd();
  const model = options.model || "minimax/minimax-m2.5";
  
  // 获取模型
  const resolvedModel = getModel("openrouter", model);
  if (!resolvedModel) {
    throw new Error(`Model not found: ${model}`);
  }

  logger?.info(`Creating session with model: ${model}`);

  // 创建会话
  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    cwd,
    model: resolvedModel,
  });

  return session;
}

/**
 * 运行单次任务
 */
export async function runTask(
  session: AgentSession,
  instruction: string,
  logger?: Logger
): Promise<void> {
  logger?.info(`Running task: ${instruction.slice(0, 100)}...`);
  
  await session.prompt(instruction);
  
  logger?.info("Task completed");
}
