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
  const match = content.match(/instruction:\s*(\|-?|)\s*([\s\S]*?)(?=\n\w+:|---|\nauthor_|\ncategory_|\ndifficulty:)/);
  if (!match) return null;
  
  let instruction = match[2].trim();
  instruction = instruction.replace(/^#.*$/gm, "").trim();
  if (!instruction) return null;
  
  return instruction;
}

async function runTask(taskName: string): Promise<{success: boolean; error?: string}> {
  const instruction = getTaskInstruction(taskName);
  if (!instruction) {
    return { success: false, error: "No instruction" };
  }

  const workDir = `/tmp/bench-${taskName}`;
  await execAsync(`mkdir -p ${workDir}`);

  // 写入指令到临时文件
  const instrFile = join(workDir, "instruction.txt");
  writeFileSync(instrFile, instruction);

  const cmd = `cd ${WORK_DIR} && \
    export OPENROUTER_API_KEY="${API_KEY}" && \
    npx tsx src/index.ts -t ${taskName} -c ${workDir} -i ${instrFile} 2>&1`;

  try {
    await execAsync(cmd, { timeout: 300000 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let limit = parseInt(args[0]) || 5; // 默认只跑5个
  const timeLimitMin = parseInt(args[1]) || 0; // 时间限制（分钟），0=不限制
  const shuffle = args.includes("--shuffle");
  
  const startTime = Date.now();

  const doneFile = join(WORK_DIR, "logs", "batch-done.json");
  const done: string[] = existsSync(doneFile) ? JSON.parse(readFileSync(doneFile, "utf-8")) : [];

  const { stdout } = await execAsync(`ls ${TASKS_DIR}`);
  let allTasks = stdout.trim().split("\n");
  let pendingTasks = allTasks.filter(t => !done.includes(t));
  
  // 随机打乱
  if (shuffle) {
    pendingTasks = pendingTasks.sort(() => Math.random() - 0.5);
  }

  console.log(`Total: ${allTasks.length}, Done: ${done.length}, Pending: ${pendingTasks.length}, Limit: ${limit}, TimeLimit: ${timeLimitMin ? timeLimitMin + 'min' : 'none'}`);

  for (let i = 0; i < Math.min(limit, pendingTasks.length); i++) {
    // 检查时间限制
    if (timeLimitMin > 0) {
      const elapsed = (Date.now() - startTime) / 60000;
      if (elapsed >= timeLimitMin) {
        console.log(`\n⏰ Time limit reached (${elapsed.toFixed(1)}min), stopping...`);
        break;
      }
    }
    
    const task = pendingTasks[i];
    console.log(`\n[${i + 1}/${limit}] Running: ${task}...`);
    
    const result = await runTask(task);
    
    if (result.success) {
      console.log(`✅ ${task}`);
      done.push(task);
    } else {
      console.log(`❌ ${task} - ${result.error?.slice(0, 60)}`);
    }

    writeFileSync(doneFile, JSON.stringify(done, null, 2));
  }

  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n✅ Done! (${elapsed}min)`);
}

main();
