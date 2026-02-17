# WebSocket Motion Generation Protocol Spec

后端对接前端 WebSocket 协议的完整规范。

## 连接

前端通过标准 WebSocket 连接后端，URL 由用户在 UI 中填写（默认 `ws://localhost:8080`）。

连接建立后，后端应立即发送一条 `handshake` 消息声明自己的能力。

## 消息格式

所有消息均为 JSON 文本帧。

---

## 后端 → 前端（ServerMessage）

### 1. handshake — 连接后立即发送

```json
{
  "type": "handshake",
  "capabilities": {
    "supportsText": true,
    "supportsSpatial": false,
    "supportsTrajectory": false,
    "supportsTransition": false
  }
}
```

四个布尔值声明后端支持哪些 conditioning 类型。当前阶段只需要 `supportsText: true`，其余三个设 `false`。

### 2. frame — 流式返回动作帧

```json
{
  "type": "frame",
  "id": "<与请求相同的 request id>",
  "frame": {
    "timestamp": 0.0333,
    "root_position": [0, 0.95, 0],
    "root_rotation": [0, 0, 0, 1],
    "joint_rotations": {
      "pelvis": [0, 0, 0, 1],
      "spine1": [0, 0, 0, 1],
      "left_hip": [0.1, 0, 0, 0.995]
    }
  }
}
```

`frame` 字段结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | `number` | 秒，从 0 开始递增 |
| `root_position` | `[x, y, z]` | 世界坐标位置 |
| `root_rotation` | `[x, y, z, w]` | 世界旋转，四元数 |
| `joint_rotations` | `Record<JointName, [x, y, z, w]>` | 各关节相对父骨骼的局部旋转四元数 |
| `joint_positions` | `Record<JointName, [x, y, z]>` (可选) | 关节世界坐标，留给未来空间感知用 |
| `root_velocity` | `[x, y, z]` (可选) | 根节点速度 |

支持的 22 个关节名（SMPL-X 命名）：

```
pelvis, spine1, spine2, spine3, neck, head,
left_hip, left_knee, left_ankle, left_foot,
right_hip, right_knee, right_ankle, right_foot,
left_collar, left_shoulder, left_elbow, left_wrist,
right_collar, right_shoulder, right_elbow, right_wrist
```

`joint_rotations` 是 partial 的，不要求每帧包含全部 22 个关节，缺失的关节前端会保持上一帧的值。

坐标系：Y-up 右手系，与 VRM/Three.js 一致，四元数直接传递不需要轴翻转。

### 3. done — 生成完成

```json
{
  "type": "done",
  "id": "<request id>",
  "metadata": {
    "total_frames": 150,
    "generation_time_ms": 2340,
    "model_name": "your-model-name"
  }
}
```

### 4. error — 出错

```json
{
  "type": "error",
  "id": "<request id>",
  "error": "human-readable error message"
}
```

---

## 前端 → 后端（ClientMessage）

### 1. generate — 请求生成动作

```json
{
  "type": "generate",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "conditioning": {
      "text": "a person walks forward slowly"
    },
    "duration_seconds": 5,
    "fps": 30,
    "current_frame": null
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 前端生成的 UUID，后续所有 frame/done/error 消息需要带回这个 id |
| `payload.conditioning` | `ConditioningSpec` | 当前只会有 `text` 字段 |
| `payload.duration_seconds` | `number` (可选) | 期望生成时长 |
| `payload.fps` | `number` (可选) | 期望帧率 |
| `payload.current_frame` | `MotionFrame` (可选) | 当前角色姿态，用于接续生成 |

### 2. cancel — 取消生成

```json
{
  "type": "cancel",
  "id": "<要取消的 request id>"
}
```

收到 cancel 后，后端应停止发送该 id 的 frame，可以选择发一条 `done` 或直接静默停止。

---

## 时序流程

```
前端                              后端
 │                                 │
 │──── WebSocket connect ─────────>│
 │<─── handshake (capabilities) ───│
 │                                 │
 │──── generate (id, text, ...) ──>│
 │<─── frame (id, frame) ─────────│  ← 流式，逐帧发
 │<─── frame (id, frame) ─────────│
 │<─── ...                         │
 │<─── done (id, metadata) ───────│
 │                                 │
 │──── generate (id2, ...) ───────>│  ← 可以发起新请求
 │──── cancel (id2) ──────────────>│  ← 也可以中途取消
 │                                 │
```

---

## 注意事项

1. `id` 是前端用 `crypto.randomUUID()` 生成的，后端所有响应消息必须带回对应的 `id`（`handshake` 除外，没有 id）
2. frame 消息应尽快逐帧发送，前端有帧缓冲机制，按 `timestamp` 做 wall-clock 回放
3. `timestamp` 应从 0 开始单调递增，间隔取决于 fps（如 30fps → 0, 0.0333, 0.0667, ...）
4. 四元数格式是 `[x, y, z, w]`，不是 `[w, x, y, z]`（scipy 默认是 xyzw，但部分库如 PyBullet 用 wxyz，注意区分）
5. 当前阶段 `conditioning` 只会有 `text` 字段，`spatial` / `trajectory` / `transition` 暂时忽略

## 相关前端源码

- 类型定义：`apps/motion-gen-web/src/types/motion.ts`
- WebSocket 客户端：`apps/motion-gen-web/src/pipeline/sources/websocket-source.ts`
- 状态管理：`apps/motion-gen-web/src/hooks/use-motion-pipeline.ts`
