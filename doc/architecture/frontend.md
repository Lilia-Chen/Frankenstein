# 前端架构

## 技术栈

- React 19 + TypeScript 5.9
- Three.js 0.180 + React Three Fiber (R3F)
- @pixiv/three-vrm — VRM 1.0 模型加载、humanoid 骨骼、springbone 物理
- Vite 7 — 开发服务器 + 构建
- Vitest + happy-dom — 单元测试
- Leva — 调试控件

## 目录结构

```
apps/motion-gen-web/src/
  main.tsx                              入口
  App.tsx                               根组件，组合 Scene + VrmViewer + ControlPanel
  styles.css                            UI 样式

  types/
    motion.ts                           MotionFrame, ConditioningSpec, 消息类型
    vrm.ts                              SMPL-X → VRM 骨骼映射表

  pipeline/
    adapter.ts                          VRM 骨骼驱动（apply / read MotionFrame）
    player.ts                           帧缓冲 + 基于时间戳的回放
    sources/
      types.ts                          MotionSource 统一接口
      websocket-source.ts               WebSocket 流式数据源
      mocap-source.ts                   JSON mocap 回放数据源

  hooks/
    use-vrm.ts                          VRM 模型加载 hook
    use-motion-pipeline.ts              编排 source → player → viewer 的状态管理

  components/
    Scene.tsx                           R3F Canvas + 灯光 + Grid + OrbitControls
    VrmViewer.tsx                       VRM 模型渲染 + 逐帧骨骼驱动
    ControlPanel.tsx                    UI 控制面板（WebSocket / Mocap 双模式）
```

## 数据流

```
MotionSource (WebSocket / Mocap JSON)
  │  onFrame callback
  ▼
MotionPlayer (帧缓冲)
  │  getFrameAtNow() — 按 wall clock 查找当前帧
  ▼
applyMotionFrameToVrm(frame, boneMap)
  │  写入 root position/rotation + 22 joint local quaternions
  ▼
vrm.update(delta)
  │  同步 normalized → raw bones, 更新 springbone 物理
  ▼
Three.js 渲染
```

## 核心类型

### MotionFrame

每帧骨骼数据，生成层输出的统一格式。

- `timestamp` — 秒
- `root_position` — 世界坐标 [x, y, z]
- `root_rotation` — 世界旋转 quaternion [x, y, z, w]
- `joint_rotations` — 各关节相对父骨骼的局部旋转 quaternion
- 可选：`joint_positions`、`root_velocity`

### ConditioningSpec

调度层 → 生成层的多模态指令格式。

- `text?` — 文字描述
- `spatial?` — 空间目标（target_position, target_facing, waypoints）
- `trajectory?` — 轨迹引导（joint_targets, velocity）
- `transition?` — 过渡提示（from_skill, to_skill, blend_duration）

当前 v1 只使用 text 字段，其余字段 schema 已定义，留给后续阶段。

### GeneratorCapabilities

生成模型启动时声明支持的 conditioning 类型，用于能力握手和自动降级。

## 骨骼映射

SMPL-X 22 关节 → VRM humanoid bone，定义在 `types/vrm.ts` 的 `SMPLX_TO_VRM` 常量中。

SMPL-X 使用 Z-up 右手系（X-right Y-forward Z-up），VRM/Three.js 使用 Y-up 右手系。adapter 负责坐标变换：

- position: `[x, y, z] → [-x, z, y]`
- root rotation: premultiply `R = Ry(180°) · Rx(-90°)`（不是 conjugation）
- joint local rotations: 直接透传，不做变换（FK 证明世界旋转下局部旋转不变）
- pelvis 从 joints map 中排除，避免覆盖 root rotation

VRM 的 chest / upperChest 是 optional bone，adapter 中 `createVrmBoneMap()` 会跳过返回 null 的骨骼。

使用 `getNormalizedBoneNode()`（标准 T-pose），不是 `getRawBoneNode()`。`vrm.update(delta)` 自动同步 normalized → raw。

## 数据源抽象

`MotionSource` 接口统一了不同数据来源：

```typescript
interface MotionSource {
  start(callbacks: MotionSourceCallbacks): void
  stop(): void
  dispose(): void
}
```

两种实现：

- **WebSocketSource** — 连接后端 WebSocket，发送 `GenerateRequest`（包含 ConditioningSpec），接收流式 FrameMessage。支持 handshake 获取 GeneratorCapabilities。
- **MocapSource** — fetch JSON 文件（MotionFrame[] 格式），按 timestamp 间隔逐帧 emit。用于管道验证。

`useMotionPipeline` hook 管理数据源生命周期、MotionPlayer 实例和 UI 状态。

## Quaternion 稳定化

`adapter.ts` 中的 `stabilize()` 函数防止连续帧之间的 quaternion 符号翻转。两个 quaternion q 和 -q 表示相同旋转，但插值时会走长弧。通过检查与上一帧的 dot product，如果 < 0 则 negate，保证始终走短弧。

## 测试

测试文件与源码 co-located，使用 `.test.ts` 后缀。

- `player.test.ts` — 纯状态机逻辑，mock `performance.now()`
- `adapter.test.ts` — 用真实 Three.js Object3D 测试骨骼驱动和 quaternion 稳定化
- `websocket-source.test.ts` — mock WebSocket class 测试连接生命周期和消息分发
- `mocap-source.test.ts` — mock fetch + `vi.useFakeTimers()` 测试异步加载和定时回放

运行：`pnpm --filter motion-gen-web test`
Watch 模式：`pnpm --filter motion-gen-web test:watch`
