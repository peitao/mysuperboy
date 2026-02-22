/**
 * Gateway 类型定义
 */

import type { AgentOptions } from "../types.js";
export type { AgentOptions };

export interface GatewayConfig {
  port: number;
  telegram?: {
    botToken: string;
    webhookUrl?: string;
    polling?: boolean;
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface AgentRequest {
  instruction: string;
  options?: AgentOptions;
}

export interface AgentResponse {
  success: boolean;
  error?: string;
  // 流式输出时的事件
  event?: {
    type: string;
    data?: any;
  };
}
