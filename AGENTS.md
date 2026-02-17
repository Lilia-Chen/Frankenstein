# Frankenstein Monorepo Agents Guide

pnpm monorepo，主应用是 `apps/motion-gen-web`（Vite + React + Three.js）。

## Quick Commands

- `pnpm dev` — 启动前端开发服务器（port 5173）
- `pnpm build` — TypeScript 检查 + 生产构建
- `pnpm lint` — TypeScript 类型检查
- `pnpm --filter motion-gen-web test` — 运行单元测试
- `pnpm --filter motion-gen-web test:watch` — 测试 watch 模式

## Front End Architecture

详细架构文档见 `doc/architecture/frontend.md`。

关键文件：

| 职责 | 文件 |
|------|------|
| 入口 | `apps/motion-gen-web/src/App.tsx` |
| VRM 渲染 | `apps/motion-gen-web/src/components/VrmViewer.tsx` |
| 3D 场景 | `apps/motion-gen-web/src/components/Scene.tsx` |
| UI 面板 | `apps/motion-gen-web/src/components/ControlPanel.tsx` |
| 骨骼驱动 | `apps/motion-gen-web/src/pipeline/adapter.ts` |
| 帧回放 | `apps/motion-gen-web/src/pipeline/player.ts` |
| WebSocket 数据源 | `apps/motion-gen-web/src/pipeline/sources/websocket-source.ts` |
| Mocap 数据源 | `apps/motion-gen-web/src/pipeline/sources/mocap-source.ts` |
| 数据源接口 | `apps/motion-gen-web/src/pipeline/sources/types.ts` |
| 核心类型 | `apps/motion-gen-web/src/types/motion.ts` |
| 骨骼映射 | `apps/motion-gen-web/src/types/vrm.ts` |
| VRM 加载 hook | `apps/motion-gen-web/src/hooks/use-vrm.ts` |
| Pipeline 编排 hook | `apps/motion-gen-web/src/hooks/use-motion-pipeline.ts` |

## Motion Streaming Contract

- WebSocket 默认 URL：`ws://localhost:8000/ws/motion`
- 客户端发送 `GenerateRequest`，payload 包含 `ConditioningSpec`（多模态指令）+ duration + fps
- 服务端流式返回 `FrameMessage`，每帧包含 root position/rotation + 22 joint quaternions
- 坐标系：Y-up 右手系（Three.js 标准），单位米
- Quaternion 格式：xyzw
- 模型格式：VRM 1.0，骨骼通过 SMPL-X → VRM humanoid 映射驱动

## Testing

- 框架：Vitest + happy-dom
- 测试文件与源码 co-located（`.test.ts` 后缀）
- 覆盖：pipeline 层全覆盖（player、adapter、websocket-source、mocap-source）

## Common Tasks

- 动作显示异常 → 检查 `pipeline/adapter.ts`（骨骼映射和 quaternion 稳定化）
- 回放时序问题 → 检查 `pipeline/player.ts`（帧缓冲和时间计算）
- 连接问题 → 检查 `pipeline/sources/websocket-source.ts`
- VRM 模型加载问题 → 检查 `hooks/use-vrm.ts`

## Style Expectations

- UI 使用 `styles.css` 中的 `.control-panel__*` BEM 类名
- 组件保持小而聚焦，避免不必要的 Canvas 重渲染
- 3D 相关逻辑放 `pipeline/` 和 `hooks/`，UI 逻辑放 `components/`
