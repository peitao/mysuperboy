# mysuperboy

基于 pi-mono 的终端编码 Agent，用于 Terminal-Bench 评估。

## 项目结构

```
mysuperboy/
├── src/
│   └── agent.ts        # Agent 核心代码
├── package.json
└── README.md
```

## 安装

```bash
cd ~/codes/mysuperboy
npm install
```

## 开发

```bash
# 安装 pi-mono 依赖（链接本地开发版本）
cd ~/codes/pi-mono
npm install
npm run build
```

## 使用

### 作为命令行工具

```bash
# 设置 API Key
export ANTHROPIC_API_KEY=sk-ant-xxxx

# 交互模式
npm start

# 单次执行
npm run prompt -- "读取当前目录的 package.json"
```

### 用于 Terminal-Bench 评估

```bash
# 构建
npm run build

# 运行评估
tb run \
  --dataset terminal-bench-core \
  --dataset-version 0.1.1 \
  --agent-import-path mysuperboy.agent:AgentWrapper \
  --model anthropic/claude-sonnet-4-20250514 \
  --task-id hello-world
```

## 配置

支持的环境变量：

- `ANTHROPIC_API_KEY` - Anthropic API Key
- `OPENAI_API_KEY` - OpenAI API Key  
- `OPENROUTER_API_KEY` - OpenRouter API Key
- `MODEL` - 使用的模型（默认: anthropic/claude-sonnet-4-20250514）
- `AGENT_WORKSPACE` - 工作目录（默认: /app）
