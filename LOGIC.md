# Passkey 钱包生成逻辑说明

## 1. 核心概述

在 `injective-pass-backend` 中，后端主要充当 **FIDO2 Relying Party (RP)** 的角色。
它的核心职责是协调 Passkey 的**密钥生成**和**验证**，而**不直接负责** Injective 钱包地址（如 `inj1...`）的派生逻辑。

*   **Backend 职责**: 生成注册挑战 (Challenge)，验证设备签名，存储公钥 (Public Key)。
*   **Frontend 职责**: 接收 Backend 返回的公钥，派生 Injective 地址，并发起交易签名。

## 2. 详细交互流程

整个“生成钱包”的过程实际上是一个标准的 **WebAuthn 注册流程**，分为两个主要步骤：

### 第一步：生成挑战 (Generate Challenge)

*   **接口**: `POST /passkey/challenge`
*   **代码入口**: [passkey.service.ts: generateChallenge](file:///Users/vyi/Desktop/program/injective/inj-pass-upgrade/injective-pass-backend/src/passkey/passkey.service.ts#L43)
*   **逻辑细节**:
    1.  **接收请求**: 客户端请求 `action: 'register'`。
    2.  **生成选项**: 使用 `@simplewebauthn/server` 库生成注册参数。
        *   `authenticatorAttachment: 'platform'`: 强制要求使用设备内置验证器（如 FaceID, TouchID, Windows Hello）。
        *   `userVerification: 'required'`: 强制要求用户验证。
        *   `supportedAlgorithmIDs`: 支持 ES256 (-7) 和 RS256 (-257) 算法。
    3.  **缓存挑战**: 将生成的随机 `challenge` 字符串存入 **Redis**，设置 60 秒过期时间。
    4.  **返回**: 将配置下发给前端，前端调用浏览器 API (`navigator.credentials.create`) 唤起系统弹窗。

### 第二步：验证与存储 (Verify & Store)

*   **接口**: `POST /passkey/verify`
*   **代码入口**: [passkey.service.ts: verifyPasskey](file:///Users/vyi/Desktop/program/injective/inj-pass-upgrade/injective-pass-backend/src/passkey/passkey.service.ts#L93)
*   **逻辑细节**:
    1.  **提取挑战**: 根据请求中的 ID 从 Redis 取回原始 Challenge。如果不存在或已过期，则拒绝。
    2.  **防重放**: 取出后立即从 Redis 删除该 Challenge。
    3.  **密码学验证**: 调用 `verifyRegistrationResponse` 验证前端提交的 `attestation` 数据。
        *   验证签名是否由设备的私钥生成。
        *   验证 `origin` (来源域名) 和 `rpID` 是否符合环境变量配置。
    4.  **数据落库**: 验证通过后，提取关键信息并存入 **PostgreSQL** (`passkey_credentials` 表)：
        *   `credentialId`: 凭证唯一标识。
        *   `publicKey`: 公钥数据 (以 `bytea` 二进制格式存储)。
        *   `counter`: 签名计数器，用于防克隆检测。
    5.  **返回结果**: 返回 `credentialId` 和 Base64 编码的 `publicKey` 给前端。

## 3. 数据与服务架构

*   **PasskeyService**: 核心业务逻辑层，处理 WebAuthn 协议细节。
*   **ChallengeStorageService**: 数据访问层。
    *   **Redis**: 负责 Challenge 的临时存储 (TTL 60s)。
    *   **TypeORM (PostgreSQL)**: 负责持久化存储用户的 Passkey 凭证。

## 4. 关键代码引用

*   **注册选项生成**: [passkey.service.ts L48-61](file:///Users/vyi/Desktop/program/injective/inj-pass-upgrade/injective-pass-backend/src/passkey/passkey.service.ts#L48-L61)
*   **注册验证逻辑**: [passkey.service.ts L107-141](file:///Users/vyi/Desktop/program/injective/inj-pass-upgrade/injective-pass-backend/src/passkey/passkey.service.ts#L107-L141)
*   **数据库实体**: [credential.entity.ts](file:///Users/vyi/Desktop/program/injective/inj-pass-upgrade/injective-pass-backend/src/passkey/entities/credential.entity.ts)

## 5. 交互流程图 (Sequence Diagram)

```ascii
+----------+             +-----------------+             +-----------+             +--------------+
| Client   |             | Backend API     |             | Redis     |             | PostgreSQL   |
+----+-----+             +--------+--------+             +-----+-----+             +-------+------+
     |                            |                            |                           |
     | 1. POST /passkey/challenge |                            |                           |
     | (action: 'register')       |                            |                           |
     +--------------------------->|                            |                           |
     |                            | 2. Generate Options        |                           |
     |                            |    (Challenge, RP Info)    |                           |
     |                            +--------------------------->|                           |
     |                            | 3. Store Challenge (60s)   |                           |
     |                            |                            |                           |
     | 4. Return Options          |                            |                           |
     |<---------------------------+                            |                           |
     |                            |                            |                           |
     | 5. User Authenticates      |                            |                           |
     |    (FaceID/TouchID)        |                            |                           |
     |                            |                            |                           |
     | 6. POST /passkey/verify    |                            |                           |
     | (Attestation Response)     |                            |                           |
     +--------------------------->|                            |                           |
     |                            | 7. Retrieve Challenge      |                           |
     |                            +--------------------------->|                           |
     |                            |                            |                           |
     |                            | 8. Verify Signature &      |                           |
     |                            |    RP ID / Origin          |                           |
     |                            |                            |                           |
     |                            | 9. Store Credential        |                           |
     |                            |    (Pubkey, Counter)       |                           |
     |                            +------------------------------------------------------->|
     |                            |                            |                           |
     | 10. Return Success         |                            |                           |
     |     (CredentialId, Pubkey) |                            |                           |
     |<---------------------------+                            |                           |
     |                            |                            |                           |
+----+-----+             +--------+--------+             +-----+-----+             +-------+------+
```

## 6. 常见问题 (FAQ)

### Q: 60秒过期意味着什么？还能解锁钱包吗？

**A: 60秒仅指“单次验证请求”的有效期，您的钱包本身永久有效。**

*   **挑战 (Challenge) 过期**: 为了安全，每次点击“解锁”或“注册”时生成的随机码 (Challenge) 只有 60 秒有效期。
*   **场景**:
    1.  您点击“解锁钱包”。
    2.  后端生成一个 Challenge。
    3.  系统弹出 FaceID/TouchID 框。
    4.  **如果您去喝了杯水，超过 60 秒才回来扫脸** -> **验证会失败** (Redis 中的 Challenge 已删除)。
*   **解决方法**:
    *   只要**重新点击**一次“解锁钱包”按钮即可。
    *   后端会生成一个新的 Challenge，您再次扫脸即可成功解锁。
*   **钱包资产**: 您的私钥（在设备中）和公钥（在数据库中）是持久存储的，不会因为 60 秒超时而丢失。
