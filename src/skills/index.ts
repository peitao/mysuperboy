/**
 * MySuperBoy Skill System
 * 
 * Skills extend the agent with custom tools and prompts
 */

import type { ToolDefinition, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { TSchema, Static } from "@sinclair/typebox";

export interface Skill {
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Tools provided by this skill */
  tools?: SkillTool[];
  /** System prompts to add */
  prompts?: string[];
  /** Setup function called when skill is loaded */
  setup?: () => Promise<void> | void;
}

/**
 * Simplified tool definition for skills
 */
export interface SkillTool {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (
    params: Static<TSchema>,
    ctx: ExtensionContext
  ) => Promise<{ text: string }>;
}

/**
 * Skill Manager - loads and manages skills
 */
export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  /**
   * Load all skills from the skills directory
   */
  async loadSkills(): Promise<void> {
    try {
      const { readdirSync, statSync } = await import("fs");
      const { join } = await import("path");

      const entries = readdirSync(this.skillsDir);
      
      for (const entry of entries) {
        const fullPath = join(this.skillsDir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          await this.loadSkillDir(fullPath, entry);
        } else if (entry.endsWith(".ts")) {
          await this.loadSkillFile(fullPath);
        }
      }

      console.error(`✅ Loaded ${this.skills.size} skills`);
    } catch (e) {
      console.error("⚠️ No skills directory or error loading:", e);
    }
  }

  /**
   * Load a skill from a directory (expects index.ts)
   */
  private async loadSkillDir(dirPath: string, name: string): Promise<void> {
    try {
      const { join } = await import("path");
      const indexPath = join(dirPath, "index.ts");
      const skill = await import(indexPath);
      
      if (skill.default) {
        this.register(name, skill.default);
      }
    } catch (e) {
      console.error(`⚠️ Failed to load skill ${name}:`, e);
    }
  }

  /**
   * Load a single skill file
   */
  private async loadSkillFile(filePath: string): Promise<void> {
    try {
      const skill = await import(filePath);
      const name = filePath.split("/").pop()?.replace(".ts", "") || "unknown";
      
      if (skill.default) {
        this.register(name, skill.default);
      }
    } catch (e) {
      console.error(`⚠️ Failed to load skill:`, e);
    }
  }

  /**
   * Register a skill manually
   */
  register(name: string, skill: Skill): void {
    this.skills.set(name, skill);
    console.error(`📦 Registered skill: ${name}`);
  }

  /**
   * Get all registered skills
   */
  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Convert skill tools to ToolDefinition format
   */
  getCustomTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    
    for (const skill of this.skills.values()) {
      if (skill.tools) {
        for (const tool of skill.tools) {
          tools.push({
            name: tool.name,
            label: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            execute: async (toolCallId, params, signal, onUpdate, ctx) => {
              try {
                const result = await tool.execute(params as any, ctx);
                return {
                  toolCallId,
                  result: {
                    success: true,
                    outputs: [{ type: "text" as const, text: result.text }]
                  }
                };
              } catch (e: any) {
                return {
                  toolCallId,
                  result: {
                    success: false,
                    error: e.message || String(e)
                  }
                };
              }
            }
          });
        }
      }
    }
    
    return tools;
  }

  /**
   * Get all prompts from all skills
   */
  getPrompts(): string[] {
    const prompts: string[] = [];
    for (const skill of this.skills.values()) {
      if (skill.prompts) {
        prompts.push(...skill.prompts);
      }
    }
    return prompts;
  }

  /**
   * Initialize all skills (call setup)
   */
  async init(): Promise<void> {
    for (const skill of this.skills.values()) {
      if (skill.setup) {
        await skill.setup();
      }
    }
  }
}
