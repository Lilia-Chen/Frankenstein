# 待解决问题和下一步方向

## 已解决的设计决策（2026-02-17 settled）

### ✅ 纯运动学路线，不引入 Physics Sim

- Physics-based controller（MaskedMimic、BeyondMimic）会引入"非人感"
- 虚拟 avatar 的核心诉求是"像人"不是"物理对"
- 空间感知用轻量碰撞体 + 几何查询替代（Layer 4: Spatial Runtime）

### ✅ ETL Pipeline First

- 先定义 pipeline 每段的 interface schema（ConditioningSpec、MotionFrame），让模型成为可插拔的 stage
- 不先选定模型再搭 pipeline，而是先跑通数据流
- Phase 1 用 mocap clip 播放验证全链路

### ✅ Layer 2 = DAG Workflow Runtime

- 本质上是 workflow engine（类似 Airflow/Temporal）
- Plan 格式从 flat array 升级为 DAG（v1 只实现线性 sequence，但 schema 留空间）
- 未来支持并行分支（body part 并行）和条件分支

### ✅ Basin Crossing = 协作而非禁止

- 旧设计：不让 Generator 跨 basin，Layer 2 硬管理
- 新设计：Layer 2 提供 transition hints + Generator 通过 multi-modal conditioning 协作
- Layer 2 知道 what transition，Generator 知道 how to execute

### ✅ 多模态 Conditioning 优先

- Generator 不应只接受 text，还需要 spatial target、trajectory 等
- 模型选型优先级：纯运动学 > 多模态 conditioning > 自回归/流式 > basin crossing 能力
- PRIMAL 和 DART 是 sweet spot

### ✅ Layer 4 = Spatial Runtime（非 Physics Sim）

- 碰撞体管理 + 空间查询 API + 基本约束
- 为 Generator guidance 提供 cost function 输入（distance、SDF、raycast）
- Three.js 基本碰撞体即可，不需要物理引擎

### ✅ 核心 Pipeline Schema

- ConditioningSpec（Layer 2 → 3）：多模态 conditioning 统一接口
- MotionFrame（Layer 3 → 4 → VRM）：per-frame 骨骼数据统一格式
- 这两个 schema 稳定后，Generator 和 Spatial Runtime 都是可替换的 stage

---

## 仍然 Open 的问题

### 1. Skill Library 构建 ✦ 核心待做

Skill Library 是 Layer 1 ↔ Layer 2 的接口契约。

待做：

- [ ] 统计 HumanML3D / KIT-ML 标注文本，提取高频 motion description pattern
- [ ] 确定初始 skill 词汇表（walk, run, sit, stand, wave, idle, wander 等）
- [ ] 为每个 skill 编写 conditioning template（text + spatial + trajectory）
- [ ] 定义每个 skill 的 params、body parts、type（rhythmic/discrete）、completion 类型
- [ ] 验证：用 template 生成的 conditioning 喂给 motion gen 模型，检查输出质量
- [ ] OOD 策略：不过度严格，允许适度泛化，关注 graceful degradation

### 2. ConditioningSpec 细化 ✦ 接口设计

architecture-design.md 中已有初版 TypeScript interface，但需要进一步细化：

- [ ] 确认 PRIMAL 和 DART 各自能消费哪些 conditioning 字段
- [ ] 定义 transition hints 的具体格式（from/to skill、blend_duration、intermediate_waypoints）
- [ ] 确认 spatial conditioning 的坐标系约定（世界坐标 vs avatar-local）
- [ ] 定义 ConditioningSpec 的版本策略（向后兼容）

### 3. MotionFrame 细化 ✦ 接口设计

- [ ] 确认关节命名标准（SMPL-X 命名 vs VRM 命名，还是定义自己的中间命名）
- [ ] 确认 rotation 表示（quaternion vs axis-angle vs 6D rotation）
- [ ] 确认 root translation 的坐标系和单位
- [ ] 定义 MotionFrame 的采样率约定（30fps? 60fps? 可变?）

### 4. Phase Transition 验证 ✦ 需要实验

三种策略已设计，但需要实际验证：

- [ ] 在选定的 motion gen 模型上测试 hard cut 的自回归连续性
- [ ] 测试 overlap blend 的效果
- [ ] 构建 transition table 的初始版本
- [ ] 测试 ConditioningSpec.transition hints 对过渡质量的影响

### 5. Basin Crossing 研究方向 ✦ v2+ 研究

来自 BeyondMimic 的启发，需要深入研究：

- [ ] Transition-aware training data：在训练数据中加入 skill 间过渡片段
- [ ] Adaptive guidance scheduling：过渡时调整 guidance 强度
- [ ] History ablation：过渡时减弱 history conditioning 权重
- [ ] Transition ControlNet（PRIMAL 方向）：专门训练处理过渡的 ControlNet
- [ ] 深入理解 BeyondMimic 的 classifier guidance 在运动学空间的可行性

### 6. Layer 4 Spatial Runtime 实现 ✦ 工程

- [ ] 定义 world state 的最小数据结构
- [ ] 实现基本碰撞体管理（AABB、capsule）
- [ ] 实现空间查询 API（distance、raycast、overlap）
- [ ] 实现 ground contact constraint
- [ ] 确定 world state 的更新频率

### 7. DAG Executor 设计 ✦ v2

v1 只需线性 sequence，但 v2 需要：

- [ ] 并行分支的 body part 冲突检测（SINC 论文参考）
- [ ] 条件分支的 evaluation 机制
- [ ] DAG 节点的动态插入/删除（replan 时）

---

## 脚手架层面

### 已决定

- 切换到 VRM 生态（替代 MMD）
- VRM 纯 FK，无 IK 干扰
- 坐标系和 rest pose 与 SMPL-X 一致
- Retargeting 路径 B：直接 quaternion 映射（推荐）

### 待做（全链路实现步骤）

- [ ] **Step 1: Three.js + VRM playground** — 基础渲染环境（场景 + 相机 + 灯光 + 地面）+ VRM 1.0 模型加载。验证：浏览器里看到静止角色。
- [ ] **Step 2: MotionFrame → VRM 驱动** — 定义 MotionFrame 类型、SMPL-X → VRM 骨骼名映射、axis-angle → quaternion、root translation。验证：硬编码数据驱动角色摆姿态。
- [ ] **Step 3: Mocap 回放** — 加载 AMASS/HumanML3D motion 数据，Python 转 MotionFrame JSON，前端逐帧播放。验证：角色流畅播放走路/挥手。注意 mean pose offset。
- [ ] **Step 4: Motion-gen 模型接入** — DART 或 FloodDiffusion inference 服务 + MotionFrame adapter + 前后端通信（WebSocket/HTTP）。验证：text prompt → 模型生成 → VRM 动画。
- [ ] **Step 5: ConditioningSpec + Skill Compiler** — 定义 ConditioningSpec 类型、初始技能库（walk, idle, wave, sit_down）、Skill Compiler、GeneratorCapabilities 握手。验证：技能编译出的 conditioning 能正确驱动模型。
- [ ] **Step 6: Layer 2 调度 + Layer 4 空间感知** — 线性 sequence 执行器、until 条件检查、碰撞体 + 距离查询 + ground contact、事件反馈。验证：硬编码 plan 驱动角色依次执行多个技能。
- [ ] **Step 7: LLM 全链路** — system prompt（scene state + skill 词汇表 + plan 格式）、execution history 上下文。验证：自然语言输入 → LLM plan → 全链路执行。

### 注意事项

- AMASS 数据可能有 mean pose offset（接近 A-pose），需要先减掉
- VRM 的 chest/upperChest 是 optional bone，需要处理缺失情况
- Root translation 需要单独映射

---

## 待阅读论文/资料

### 神经科学基础

- [ ] Miller & Cohen (2001) — 前额叶 context-dependent control
- [ ] Fuster (2008) — 前额叶不参与连续执行
- [ ] Bernstein (1967) — 动作通过 synergy 降维
- [ ] Grillner (2006) — 步态是脊髓级 pattern generation

### 技术论文

- [ ] BeyondMimic 论文细节 — classifier guidance 的具体实现和失败模式分析（已有 deep dive 笔记）
- [ ] PRIMAL 论文细节 — ControlNet 训练流程，如何训练新 ControlNet
- [ ] DART 论文细节 — latent noise optimization 的 spatial control 机制
- [ ] UniPhys — 单模型 state+action diffusion（参考其 Diffusion Forcing 范式）
- [ ] SMP — diffusion 做 RL reward（score distillation）
- [ ] SINC — 并行动作的 body part 冲突处理（Layer 2 DAG 并行分支参考）

---

## 讨论记录

### 2025-02-12 Session

讨论了：

1. 整体分层架构设计（attractor-based）
2. Motion-gen vs Robotics policy 的融合现状
3. 具体模型选型（DART, MotionStreamer, FloodDiffusion, PRIMAL）
4. LLM → ActionGraph → Scheduler 的可行方案
5. Attractor 切换机制（MaskedMimic vs BeyondMimic）
6. SMPL-X → VRM retargeting 技术细节
7. 脚手架和工具链选择

关键结论：

- CLoSD 验证了分层闭环架构但 planner 不是语义级的
- PRIMAL 的可插拔 ControlNet 最有前景但需要自训更多 ControlNet
- BeyondMimic 暴露了 attractor basin 断裂的 fundamental limitation
- VRM 是比 MMD 更好的 playground 选择
- LLM → ActionGraph 链路需要自己组装，没有现成端到端方案

### 2026-02-15 Session

细化了四个核心设计问题：

1. Attractor 表示：两层表示（Semantic Mode + Generator-specific conditioning），中间通过 Skill Compiler 适配
2. Phase Transition：不让 Generator 跨 basin，Layer 2 显式管理（三种策略）
3. 反馈回路：Event-driven 异步反馈
4. LLM → Layer 2 链路：结构化 plan JSON，短期一次性，用完即弃

### 2026-02-17 Session

重大设计更新：

1. **ETL Pipeline First**：先定义 schema 跑通数据流，模型可插拔。受 plast-mem 项目 Neko 建议启发。
2. **Layer 2 = DAG Workflow Runtime**：借鉴云端 workflow engine（Airflow/Temporal），Plan 格式升级为 DAG。
3. **Basin Crossing 重新思考**：从"禁止 Generator 跨 basin"改为"Layer 2 + Generator 协作跨 basin"。深入分析了 BeyondMimic 的 classifier guidance 机制和失败原因。
4. **纯运动学路线确认**：Physics sim 会引入非人感，用轻量 Spatial Runtime 替代。
5. **多模态 Conditioning 优先**：模型选型以 conditioning 灵活性为核心标准，PRIMAL/DART 为目标。
6. **Layer 4 明确为 Spatial Runtime**：碰撞体 + 空间查询 + 基本约束，不是物理仿真。
7. **核心 Schema 定义**：ConditioningSpec（Layer 2→3）和 MotionFrame（Layer 3→4→VRM）。
8. **分阶段实现**：Phase 1 mocap 验证管道 → Phase 2 接入 motion gen → Phase 3 多模态 → Phase 4 basin crossing 优化。

### 2026-02-17 Session（外部 Review 反馈整合）

收到外部 review 的 5 个改进建议，采纳 4 个：

1. ~~Reflex Signal（反射快速通道）~~ — 暂不实现
2. **Execution History Context** — 采纳。LLM replan 时携带近期执行历史（completed / failed / aborted），防止死循环。范围扩大：不仅是 failure，也包括 end confirmation 等执行反馈。
3. **Foot Contact IK（Two-Bone IK）** — 采纳。Layer 4 用轻量 Two-Bone IK 修正脚滑/脚浮，工业标准做法。
4. **Inertialization** — 采纳。替代 Strategy B 的 SLERP blend，用 spring-damper 系统保证动量守恒的平滑过渡。AAA 游戏标配。
5. **Generator Capabilities 握手** — 采纳。Generator 启动时声明支持的 conditioning 类型，Layer 2 自动降级不支持的字段。
