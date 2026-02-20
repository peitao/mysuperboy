/**
 * MySuperBoy Skill System
 * 
 * 支持懒加载：启动时只加载 SKILL.md 头部，按需读取完整内容
 */

import type { ToolDefinition, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { TSchema, Static } from "@sinclair/typebox";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";

export interface SkillMeta {
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Skill 目录路径 */
  path: string;
}

export interface Skill {
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** 完整文件路径 */
  fullPath: string;
  /** 工具（可选，需要时加载） */
  tools?: SkillTool[];
  /** 懒加载函数 */
  load?: () => Promise<void>;
}

/**
 * 简化工具定义
 */
export interface SkillTool {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (params: Static<TSchema>, ctx: ExtensionContext) => Promise<{ text: string }>;
}

/**
 * Skill Manager - 懒加载系统
 */
export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  /**
   * 启动时加载：只读取 SKILL.md 头部
   */
  async loadSkillsMeta(): Promise<void> {
    if (!existsSync(this.skillsDir)) {
      console.error("⚠️ Skills directory not found:", this.skillsDir);
      return;
    }

    const entries = readdirSync(this.skillsDir);
    
    for (const entry of entries) {
      const skillPath = join(this.skillsDir, entry);
      const stat = statSync(skillPath);
      
      if (stat.isDirectory()) {
        const skillFile = join(skillPath, "SKILL.md");
        if (existsSync(skillFile)) {
          const meta = this.parseSkillHeader(skillFile, entry);
          if (meta) {
            this.skills.set(entry, {
              name: meta.name,
              description: meta.description,
              fullPath: skillFile
            });
          }
        }
      }
    }

    console.error(`✅ Loaded ${this.skills.size} skills (meta only)`);
  }

  /**
   * 解析 SKILL.md 头部（YAML frontmatter）
   */
  private parseSkillHeader(filePath: string, defaultName: string): SkillMeta | null {
    try {
      const content = readFileSync(filePath, "utf-8");
      
      // 检查是否有 frontmatter
      if (!content.startsWith("---")) {
        return {
          name: defaultName,
          description: content.slice(0, 200), // 取前200字符作为描述
          path: filePath
        };
      }

      // 解析 frontmatter
      const endIndex = content.indexOf("---", 3);
      if (endIndex === -1) return null;

      const frontmatter = content.slice(3, endIndex).trim();
      const lines = frontmatter.split("\n");
      
      let name = defaultName;
      let description = "";

      for (const line of lines) {
        if (line.startsWith("name:")) {
          name = line.replace("name:", "").trim();
        } else if (line.startsWith("description:")) {
          description = line.replace("description:", "").trim();
        }
      }

      return { name, description, path: filePath };
    } catch (e) {
      console.error("⚠️ Failed to parse skill:", filePath, e);
      return null;
    }
  }

  /**
   * 获取所有 skill 元数据（用于告诉 LLM 有哪些 skills）
   */
  getSkillsMeta(): SkillMeta[] {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description,
      path: s.fullPath
    }));
  }

  /**
   * 获取完整 skill 内容（LLM 按需读取）
   */
  async getSkillContent(name: string): Promise<string | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;

    try {
      return readFileSync(skill.fullPath, "utf-8");
    } catch (e) {
      console.error("⚠️ Failed to read skill:", skill.fullPath, e);
      return null;
    }
  }

  /**
   * 获取自定义工具（目前为空，后续可扩展）
   */
  getCustomTools(): ToolDefinition[] {
    return [];
  }

  /**
   * 生成 system prompt（告诉 LLM 有哪些 skills 可用）
   */
  getSystemPrompt(): string {
    const skills = this.getSkillsMeta();
    if (skills.length === 0) return "";

    const lines = ["## Available Skills"];
    for (const skill of skills) {
      lines.push(`- **${skill.name}**: ${skill.description}`);
      lines.push(`  - Path: ${skill.path}`);
    }
    lines.push("", "When a user asks about a skill, read its full content using the read tool.");

    return lines.join("\n");
  }

  /**
   * 初始化（空实现，保留接口）
   */
  async init(): Promise<void> {}
}
