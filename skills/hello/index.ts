/**
 * Hello Skill - 示例 skill
 * 
 * 展示如何创建自定义 skill
 */

import type { Skill, SkillTool } from "../../src/skills/index.js";
import { Type } from "@sinclair/typebox";

/**
 * 自定义 hello 工具
 */
const helloTool: SkillTool = {
  name: "hello",
  description: "Say hello to someone. Input should be a JSON object with a 'name' field.",
  parameters: Type.Object({
    name: Type.String({ description: "Name of person to greet" })
  }),
  execute: async ({ name }, ctx) => {
    return {
      text: `Hello, ${name}! 👋 (from skill)`
    };
  }
};

/**
 * 当前时间工具
 */
const currentTimeTool: SkillTool = {
  name: "current_time",
  description: "Get the current time. No input required.",
  parameters: Type.Object({}),
  execute: async ({}, ctx) => {
    const now = new Date();
    return {
      text: `Current time: ${now.toISOString()}`
    };
  }
};

/**
 * Echo 工具 - 回显输入
 */
const echoTool: SkillTool = {
  name: "echo",
  description: "Echo back the input text. Useful for testing.",
  parameters: Type.Object({
    text: Type.String({ description: "Text to echo back" })
  }),
  execute: async ({ text }, ctx) => {
    return {
      text: `Echo: ${text}`
    };
  }
};

const skill: Skill = {
  name: "hello",
  description: "A simple hello skill with greeting and time tools",
  
  tools: [helloTool, currentTimeTool, echoTool],
  
  prompts: [
    "You have access to custom tools:",
    "- hello: Say hello to someone (参数: name)",
    "- current_time: Get current time",
    "- echo: Echo back text (参数: text)",
    "Use these tools when appropriate to help the user."
  ],

  setup: async () => {
    console.error("🎯 Hello skill loaded!");
  }
};

export default skill;
