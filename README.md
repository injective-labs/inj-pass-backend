# INJ Pass Backend

INJ Pass 后端服务，基于 NestJS 框架，提供 WebAuthn 认证、NIJIA 积分系统、AI 对话代理等功能。

## 技术栈

- **框架**: NestJS
- **数据库**: PostgreSQL (Supabase)
- **缓存**: Redis (Upstash)
- **认证**: WebAuthn (Passkey)
- **AI**: Anthropic API

## 项目定位

**AI 方向**：后端专注于 NIJIA 积分系统和 AI 对话计费，不涉及区块链签名操作。

```
┌─────────────────────────────────────────────────────────┐
│  前端 (inj-pass-frontend-nfc)                          │
│  - WebAuthn 认证                                        │
│  - 私钥管理 + 区块链签名                                │
│  - AI 对话 + 工具执行                                   │
│  - Tap Game                                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  后端 (inj-pass-backend)                               │
│  - NIJIA 积分管理                                       │
│  - AI 对话记录 + 计费                                   │
│  - 邀请码系统                                           │
└─────────────────────────────────────────────────────────┘
```

## 项目结构

```
src/
├── main.ts                    # 应用入口
├── app.module.ts              # 根模块
├── config/
│   ├── points.config.ts       # NIJIA 积分配置
│   └── ai-pricing.config.ts   # AI 计费配置 (NIJIA 与 AI token 兑换比例)
├── auth/
│   ├── auth.module.ts
│   ├── auth.service.ts        # JWT token 管理
│   └── jwt-auth.guard.ts
├── passkey/
│   ├── passkey.module.ts
│   ├── passkey.controller.ts  # Passkey API 接口
│   ├── passkey.service.ts     # WebAuthn 认证逻辑
│   ├── challenge-storage.service.ts
│   ├── dto/
│   │   └── passkey.dto.ts
│   └── entities/
│       └── credential.entity.ts
├── user/
│   ├── user.module.ts
│   ├── user.controller.ts     # 用户 API 接口
│   ├── user.service.ts        # 用户业务逻辑
│   └── entities/
│       └── user.entity.ts
├── points/
│   ├── points.module.ts
│   ├── points.controller.ts   # 积分 API 接口
│   ├── points.service.ts      # 积分业务逻辑
│   └── entities/
│       ├── points-transaction.entity.ts
│       └── ai-usage-log.entity.ts
├── referral/
│   ├── referral.module.ts
│   ├── referral.controller.ts # 邀请 API 接口
│   ├── referral.service.ts    # 邀请业务逻辑
│   └── entities/
│       └── referral-log.entity.ts
└── ai/
    ├── ai.module.ts
    ├── ai.controller.ts       # AI API 接口
    ├── ai.service.ts           # AI 对话记录 + 计费逻辑
    ├── agents/
    │   ├── agents.module.ts
    │   ├── agents.config.ts     # 系统提示词 + 工具定义 (前端执行参考)
    │   └── tools/
    │       ├── wallet.tools.ts  # 钱包工具
    │       ├── swap.tools.ts    # 兑换工具
    │       └── game.tools.ts    # 游戏工具
    └── entities/
        ├── conversation.entity.ts
        └── message.entity.ts
```

## 数据库表

| 表名 | 描述 |
|------|------|
| passkey_credentials | Passkey 凭证存储 |
| users | 用户信息 (NIJIA 余额、邀请码、邀请人 ID) |
| points_transactions | NIJIA 积分变动记录 |
| ai_usage_logs | AI 使用记录 (计费明细) |
| referral_logs | 邀请记录 (被邀请人、奖励发放状态) |
| conversations | AI 对话备份 |
| messages | 对话消息 |

## API 接口

### Passkey 认证

```
POST /api/passkey/challenge     # 获取认证挑战
POST /api/passkey/verify        # 验证注册/登录
POST /api/passkey/verify-token # 验证 token
POST /api/passkey/refresh-token # 刷新 token
POST /api/passkey/logout        # 登出
GET  /api/passkey/stats         # 存储统计
```

### 用户

```
GET  /api/user/profile          # 获取用户信息 (包含 NIJIA 余额、邀请码)
```

### 积分

```
GET  /api/points/balance        # 查询 NIJIA 余额
GET  /api/points/transactions    # 积分变动历史
POST /api/points/sync-tap        # 同步 Tap Game 获得积分 (游戏倒计时结束后调用)
```

### 邀请

```
GET  /api/referral/code          # 获取自己的邀请码
POST /api/referral/register-with-code # 注册时绑定邀请码并发放奖励
GET  /api/referral/stats         # 邀请统计 (成功邀请数、累计奖励)
```

### AI 对话

```
POST /api/ai/chat/record         # 记录对话并扣费 (前端执行工具，后端计费)
GET  /api/ai/conversations       # 获取对话列表
GET  /api/ai/conversations/:id   # 获取对话详情
DELETE /api/ai/conversations/:id # 删除对话
```

### AI 对话记录 API 详情

**POST /api/ai/chat/record**

前端在完成一轮对话后（包括工具调用），将完整的消息记录发送给后端。

Request:
```json
{
  "conversationId": "uuid-可选",  // 新对话不传，旧对话传 ID
  "title": "可选的对话标题",
  "messages": [
    { "role": "user", "content": "swap 10 INJ to USDT" },
    { "role": "assistant", "content": "", "tool_use": [...] },
    { "role": "user", "content": "", "tool_result": [...] },
    { "role": "assistant", "content": "Swap completed! tx: 0x..." }
  ],
  "model": "claude-sonnet-4-6",
  "usage": {
    "inputTokens": 500,
    "outputTokens": 1200
  }
}
```

Response:
```json
{
  "ok": true,
  "conversationId": "uuid",
  "balance": 95.5,        // 剩余 NIJIA
  "cost": {               // 本次消费详情
    "inputTokens": 500,
    "outputTokens": 1200,
    "ninjiaDeducted": 4.5,
    "currency": 0.045     // 等值美元
  }
}
```

Error (余额不足):
```json
{
  "ok": false,
  "error": "INSUFFICIENT_NINJA",
  "current": 2.0,
  "required": 4.5
}
```

## NIJIA 积分系统

### 积分配置 (ai-pricing.config.ts)

```typescript
export const AI_PRICING = {
  // 1 USD = 多少 NIJIA (动态可调)
  NINJA_PER_DOLLAR: 100,

  // 模型价格 (USD / 1M tokens)
  MODELS: {
    'claude-sonnet-4-6': {
      input: 3.0,   // $3 / 1M input tokens
      output: 15.0, // $15 / 1M output tokens
    },
    'claude-opus-4-6': {
      input: 15.0,
      output: 75.0,
    },
  },
};
```

### NIJIA 积分来源

| 来源 | 数量 | 说明 |
|------|------|------|
| 注册初始奖励 | 22 NIJIA | 新用户注册 |
| Tap Game 每次 | 10-90 NIJIA | 游戏倒计时完成后结算 |
| 邀请人奖励 | 100 NIJIA | 被邀请人首次注册 |
| 被邀请人奖励 | 50 NIJIA | 使用邀请码注册 |

### 积分规则

- NIJIA 余额可扣到负数，但 AI 对话需余额 >= 本次预估消耗才能继续
- 积分变动记录永久保存，可查询历史

## 邀请码系统

### 流程

```
用户 A (已有账号)
    │
    │ 生成邀请码 INVITE-A
    ▼
用户 B (新注册)
    │
    │ 注册时传入 inviteCode: INVITE-A
    ▼
后端验证邀请码
    │
    ├─ 邀请码有效
    │   ├─ 给 A 发放 100 NIJIA
    │   ├─ 给 B 发放 50 NIJIA
    │   └─ 记录 referral_logs
    │
    └─ 邀请码无效或已使用 → 返回错误
```

### 邀请码格式

- 8 位字母数字组合
- 每个用户一个邀请码
- 邀请码不可重复使用（同一个邀请码只能邀请一个用户）

## AI 工具定义 (前端执行参考)

后端维护工具定义，前端负责执行：

| 工具 | 功能 | 执行位置 |
|------|------|----------|
| get_wallet_info | 获取钱包地址 | 前端 |
| get_balance | 获取 INJ/USDT/USDC 余额 | 前端 |
| get_swap_quote | 获取兑换报价 | 前端 |
| execute_swap | 执行代币兑换 | 前端 (需签名) |
| send_token | 发送代币 | 前端 (需签名) |
| get_tx_history | 获取交易历史 | 前端 |
| play_hash_mahjong | 玩一次麻将 | 前端 (需签名) |
| play_hash_mahjong_multi | 玩多次麻将 | 前端 (需签名) |

前端可参考 `src/ai/agents/` 中的工具定义和提示词实现。

## 环境变量

```env
# 数据库
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# WebAuthn
RP_ID=injpass.com
ORIGINS=https://injpass.com,http://localhost:3000

# AI
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com

# Agent / Tool EVM network (optional overrides)
INJECTIVE_EVM_RPC=https://sentry.evm-rpc.injective.network/
INJECTIVE_EVM_CHAIN_ID=1776

# AI 计费配置 (可选，有默认值)
# NINJA_PER_DOLLAR=100

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d
```

## 运行

```bash
# 安装依赖
pnpm install

# 运行迁移
pnpm migration:run

# 开发模式
pnpm start:dev

# 生产构建
pnpm build
pnpm start:prod
```

## 迁移脚本

```bash
# 创建迁移
pnpm migration:generate CreateReferralLogs

# 运行迁移
pnpm migration:run
```

迁移文件位于 `migrations/` 目录。
