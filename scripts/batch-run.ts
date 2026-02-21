/**
 * 批量测试运行器
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const execAsync = promisify(exec);

const TASKS_DIR = "/Users/tao.peipt/codes/terminal-bench/original-tasks";
const WORK_DIR = "/Users/tao.peipt/codes/mysuperboy";
const API_KEY = "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";

function getTaskInstruction(taskName: string): string | null {
  const taskYaml = join(TASKS_DIR, taskName, "task.yaml");
  if (!existsSync(taskYaml)) return null;
  
  const content = readFileSync(taskYaml, "utf-8");
  
  // 匹配 instruction: |- 或 instruction: |
  const match = content.match(/instruction:\s*(\|-?|)\s*([\s\S]*?)(?=\n\w+:|---|\nauthor_|\ncategory_|\ndifficulty:)/);
  if (!match) return null;
  
  let instruction = match[2].trim();
  // 移除注释行
  instruction = instruction.replace(/^#.*$/gm, "").trim();
  if (!instruction) return null;
  
  return instruction;
}

async function runTask(taskName: string): Promise<{success: boolean; error?: string}> {
  const instruction = getTaskInstruction(taskName);
  if (!instruction) {
    return { success: false, error: "No instruction found" };
  }

  const workDir = `/tmp/bench-${taskName}`;
  await execAsync(`mkdir -p ${workDir}`);

  const cmd = `cd ${WORK_DIR} && \
    export OPENROUTER_API_KEY="${API_KEY}" && \
    npx tsx src/index.ts -t ${taskName} -c ${workDir} "${instruction.slice(0, 400)}" 2>&1`;

  try {
    await execAsync(cmd, { timeout: 300000 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[0]) || 10;
  const start = parseInt(args[1]) || 0;

  const doneFile = join(WORK_DIR, "logs", "batch-done.json");
  const done: string[] = existsSync(doneFile) ? JSON.parse(readFileSync(doneFile, "utf-8")) : [];

  const { stdout } = await execAsync(`ls ${TASKS_DIR}`);
  const allTasks = stdout.trim().split("\n");
  const pendingTasks = allTasks.filter(t => !done.includes(t));

  console.log(`Total: ${allTasks.length}, Done: ${done.length}, Pending: ${pendingTasks.length}`);

  for (let i = start; i < Math.min(start + limit, pendingTasks.length); i++) {
    const task = pendingTasks[i];
    console.log(`\n[${i + 1}/${pendingTasks.length}] Running: ${task}...`);
    
    const result = await runTask(task);
    
    if (result.success) {
      console.log(`✅ ${task}`);
      done.push(task);
    } else {
      console.log(`❌ ${task} - ${result.error?.slice(0, 80)}`);
    }

    writeFileSync(doneFile, JSON.stringify(done, null, 2));
  }

  console.log("\n✅ Complete!");
}

main();
