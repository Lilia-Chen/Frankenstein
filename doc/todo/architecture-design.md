# 架构设计详情

## 设计原则

1. **ETL Pipeline First**：先定义 pipeline 每段的 interface schema，让模型成为可插拔的 stage。先跑通数据流，再针对性选择和调优模型。
2. **纯运动学路线**：不引入 physics simulation（IsaacGym 等）。物理仿真会引入"非人感"——机器人式的过度物理正确性。虚拟 avatar 的核心诉求是"像人"，不是"物理对"。
3. **空间感知 ≠ 物理仿真**：用轻量碰撞体 + 几何查询替代物理引擎，提供 avatar 所需的空间感知能力。
4. **多模态 Conditioning**：Generator 不应只接受 text，还需要 spatial target、trajectory 等 conditioning，为未来扩展留空间。
5. **Basin Crossing = 协作**：不是"禁止 Generator 跨 basin"，而是 Layer 2 提供 transition hints + Generator 通过 multi-modal conditioning 协作完成过渡。

---

## 分层结构

### Layer 1: 主脑 LLM / Planner

- 职责：根据对话上下文和 world state，生成短期行为计划
- 频率：低频，事件驱动（用户说话、plan 执行完毕、异常事件）
- 输出格式：结构化 plan（DAG 结构），不是自由文本
- 神经科学对应：前额叶皮层
  - Miller & Cohen (2001)：前额叶负责 "context-dependent control"
  - Fuster (2008)：前额叶不参与连续执行，只参与决策与切换

#### LLM 的环境感知

- 测试阶段：全知模式，playground 的 scene state 直接以结构化 JSON 塞入 LLM context
- Scene state 包含：对象列表（id, type, position, state）、avatar 状态（position, facing）、可行走区域
- 未来可扩展为 scene graph / RAG 检索

```json
{
  "scene": {
    "objects": [
      {"id": "chair_1", "type": "chair", "position": [2.0, 0, 3.5]},
      {"id": "table_1", "type": "table", "position": [2.0, 0, 4.0]},
      {"id": "door_1", "type": "door", "position": [0, 0, 6.0], "state": "closed"}
    ],
    "avatar": {"position": [0, 0, 0], "facing": [0, 0, 1]},
    "walkable_area": "rectangular, 0-5 x 0-8"
  },
  "execution_history": [
    {"type": "completed", "skill": "walk", "target": "door_1", "timestamp": 1234},
    {"type": "failed", "skill": "open", "target": "door_1", "reason": "locked", "timestamp": 1240},
    {"type": "completed", "skill": "wave", "target": null, "timestamp": 1250}
  ]
}
```

#### Execution History（执行反馈 Context）

LLM replan 时必须携带近期执行历史，防止死循环（如反复尝试开一扇锁着的门）。

`execution_history` 包含：

- **completed**：skill 正常完成（end confirmation）
- **failed**：skill 执行失败 + 失败原因
- **aborted**：skill 被新 plan 打断

Layer 2 在请求 replan 时自动附带最近 N 条（短期记忆），避免 context 膨胀。LLM 应根据 failure 记录避免重复相同的失败 plan。

#### Plan 格式

v1 为线性 sequence，但 schema 设计上为 DAG 留空间（支持未来的并行分支和条件分支）：

```json
{
  "plan": {
    "nodes": [
      {
        "id": "n1",
        "skill": "walk",
        "params": {"speed": "normal", "direction": "toward:chair_1"},
        "until": {"type": "near", "target": "chair_1", "threshold": 0.5},
        "depends_on": []
      },
      {
        "id": "n2",
        "skill": "sit_down",
        "params": {"target": "chair_1"},
        "until": {"type": "pose_settled", "timeout": 3.0},
        "depends_on": ["n1"]
      },
      {
        "id": "n3",
        "skill": "wave",
        "params": {"hand": "right"},
        "until": {"type": "timeout", "duration": 2.0},
        "depends_on": ["n2"]
      },
      {
        "id": "n4",
        "skill": "idle",
        "params": {"style": "relaxed"},
        "until": {"type": "interrupted"},
        "depends_on": ["n3"]
      }
    ]
  }
}
```

DAG 未来可支持：

- **并行分支**：`n_walk` 和 `n_wave` 同时 depends_on `n_prev`，body part 并行（走路 + 挥手）
- **条件分支**：`n_alt` 带 `condition` 字段，如 `{"if": "chair_1.occupied", "then": "n_walk_to_chair_2"}`

规则：**plan 必须以一个 `until: interrupted` 的 skill 结尾**（idle / wander），确保 avatar 永远不会僵住。

#### Plan 的生命周期

- Plan 是短期的、一次性的、用完即弃的
- 环境变化或用户新输入 → LLM 直接生成新 plan 整个替换旧 plan
- 不在旧 plan 上 patch，不做增量修改
- 当前正在执行的 skill 被打断，Layer 3 从新 skill 的 conditioning 开始生成

---

### Layer 2: Attractor Scheduler（DAG Workflow Runtime）

Layer 2 本质上是一个 **workflow runtime**，类似云端的 DAG 编排器（Airflow/Temporal）。它做三件事：

1. 执行 plan 的 DAG 逻辑（推进、终止条件检查、并行/条件分支）
2. 把 skill 编译成 Layer 3 能消费的 **多模态 ConditioningSpec**
3. 为 phase transition 生成 **transition hints**，辅助 Generator 跨 basin

#### 与 Workflow/DAG 的对应关系

| 云端概念 | 我们的对应 |
|---------|-----------|
| DAG node | plan 里的一个 skill 节点 |
| Task state (pending/running/success/failed) | skill 的 until 条件判断 |
| Retry / fallback | GOAL_UNREACHABLE → replan |
| Event trigger | Layer 3/4 上报的 events |
| Orchestrator (Airflow/Temporal) | Layer 2 Scheduler |
| Task dependency | DAG 的 depends_on |
| Parallel branches | body part 并行的 skill |

#### 神经科学对应

- 基底节（Basal Ganglia）+ 运动皮层选择机制
- 协同学（Synergetics）里的模式选择
- Dynamic Patterns：运动模式是 attractors，模式切换是 phase transition
- Bernstein (1967)：动作通过 synergy 降维后被选择

#### Attractor = Motor Primitive

neuroscience 意义上的 attractor 对应 motor primitive——完整的、可自主执行的运动技能单元：

- **Rhythmic**（周期性）：走路、跑步 —— limit cycle attractor，不给停止信号就一直跑
- **Discrete**（一次性）：坐下、挥手、捡东西 —— point attractor，执行完自然收敛到终态

这个粒度就是 Layer 1 和 Layer 2 之间的接口粒度。

#### Skill Library（Layer 1 ↔ Layer 2 的接口契约）

Skill Library 同时定义了：

- LLM 可用的词汇表（Layer 1 → 2 的 API）
- 每个 skill 对应的 Layer 3 conditioning 编译规则（Layer 2 → 3）

```yaml
skills:
  walk:
    type: rhythmic
    params: [speed, direction, style]
    body: [legs, torso]
    completion: goal_reached | interrupted
    conditioning:
      text: "a person walks {speed} {style}"
      spatial: target_position        # 目标位置
      trajectory: waypoints           # 可选：路径点序列

  sit_down:
    type: discrete
    params: [target_object]
    body: [full]
    completion: pose_converged
    conditioning:
      text: "a person sits down on a {target_object}"
      spatial: target_object_position

  wave:
    type: discrete
    params: [hand, intensity]
    body: [right_arm | left_arm]
    completion: timeout
    conditioning:
      text: "a person waves their {hand} hand"

  idle:
    type: rhythmic
    params: [style]
    body: [full]
    completion: interrupted
    conditioning:
      text: "a person stands idle {style}"

  wander:
    type: rhythmic
    params: [style, range]
    body: [legs, torso]
    completion: timeout | interrupted
    conditioning:
      text: "a person walks around casually"
      spatial: random_waypoints_in_range
```

**关键约束**：text 字段里的词应尽量使用 motion gen 训练集（HumanML3D / KIT-ML）里高频出现的描述，降低 OOD 风险。但不需要过度严格——训练数据有限，适度的 OOD 是可接受的，Generator 的泛化能力也在持续提升。

#### Skill Compiler → ConditioningSpec

Skill Compiler 把 skill + params 翻译成统一的 **ConditioningSpec**，这是 Layer 2 → Layer 3 的核心接口：

```typescript
interface ConditioningSpec {
  // 文本 conditioning（所有 Generator 都支持）
  text?: string;

  // 空间 conditioning（PRIMAL ControlNet / DART spatial control）
  spatial?: {
    target_position?: [number, number, number];
    target_facing?: [number, number, number];
    waypoints?: [number, number, number][];
  };

  // 轨迹 conditioning（未来扩展）
  trajectory?: {
    joint_targets?: Record<string, [number, number, number]>;
    velocity?: [number, number, number];
  };

  // 过渡 hints（辅助 basin crossing）
  transition?: {
    from_skill?: string;
    to_skill?: string;
    blend_duration?: number;
    intermediate_waypoints?: [number, number, number][];
  };
}
```

不同 Generator 的 adapter 从 ConditioningSpec 中提取自己能消费的字段：

```
ConditioningSpec → PRIMAL adapter:  text + spatial (ControlNet)
ConditioningSpec → DART adapter:    text + spatial (latent optimization)
ConditioningSpec → FloodDiffusion:  text + timing (text_end)
ConditioningSpec → Mocap playback:  skill name → clip lookup (Phase 1)
```

Generator 可替换而不影响上层。

#### Generator Capabilities 握手

Generator 启动时必须声明自己支持的 conditioning 类型，Layer 2 据此自动降级：

```typescript
interface GeneratorCapabilities {
  supportsText: boolean;        // 文本 conditioning
  supportsSpatial: boolean;     // 空间目标（position, waypoints）
  supportsTrajectory: boolean;  // 轨迹 / 关节目标
  supportsTransition: boolean;  // transition hints
}
```

Layer 2 Skill Compiler 在编译 ConditioningSpec 时检查 `layer3.capabilities`：

- 如果 Generator 不支持 spatial → 自动降级为 text 描述（e.g., `target_position: [10,0,0]` → `"walk forward a long distance"`）
- 如果 Generator 不支持 transition → 跳过 transition hints，仅依赖 Layer 2 的过渡策略
- 降级映射在 Skill Library 中定义（每个 skill 的 conditioning 字段都有 text fallback）

各模型的 capabilities：

```
PRIMAL:          { text: ✅, spatial: ✅, trajectory: ❌, transition: ❌ }
DART:            { text: ✅, spatial: ✅, trajectory: ❌, transition: ❌ }
FloodDiffusion:  { text: ✅, spatial: ❌, trajectory: ❌, transition: ❌ }
MotionStreamer:   { text: ✅, spatial: ❌, trajectory: ❌, transition: ❌ }
Mocap playback:  { text: ❌, spatial: ❌, trajectory: ❌, transition: ❌ }
```

#### 终止条件（until）类型

| until 类型 | 语义 | 数据来源 |
|-----------|------|---------|
| `near(target, threshold)` | 到达空间目标 | Layer 4 空间查询 |
| `pose_settled` | 姿态收敛到终态 | Layer 3 motion 输出 |
| `timeout(duration)` | 固定时长 | 计时器 |
| `interrupted` | 永远不自行结束，只能被新 plan 替换 | Layer 1 |

#### 运行时逻辑（v1: 线性 sequence）

```
Layer2 Runtime:

  current_plan = null
  current_index = 0

  on new_plan_received:
    current_plan = new_plan
    current_index = 0
    // 立即开始执行，打断当前 skill

  loop:
    if current_plan == null: return

    node = current_plan.nodes[current_index]

    // 持续给 Layer 3 喂 conditioning
    spec = skill_library.compile(node.skill, node.params)
    feed_to_layer3(spec)

    // 检查终止条件
    if evaluate(node.until, world_state):
      current_index++
      if current_index >= plan.nodes.length:
        emit(PLAN_COMPLETED)
```

v2 可扩展为真正的 DAG executor（并行分支、条件分支）。

#### v2+ 演进方向

| 阶段 | Layer 2 实现 | LLM 输出 |
|------|-------------|---------|
| v1 | 线性 sequence 状态机 | skill sequence + until |
| v2 | DAG executor（并行/条件分支） | DAG plan |
| v3 | RL Policy（Options Framework） | 高层目标（"去坐那把椅子"） |

v1 的状态机行为可以作为 v3 RL policy 的 expert demonstration（imitation learning warm-start）。

---

### Layer 3: Continuous Motion Generator（流式模型）

- 职责：在给定 ConditioningSpec + 当前 state 下，连续、流式、实时地产生骨骼动作
- 神经科学对应：
  - 脑干 + 脊髓 + 小脑
  - Central Pattern Generators (CPG)：可在无高级皮层输入下运行
  - Limit-cycle attractors（步态）：Grillner (2006) 步态是脊髓级 pattern generation
- 关键特性：一旦进入 attractor，连续执行不再需要语义或前额叶参与

#### 输出格式：MotionFrame

Generator 输出统一的 **MotionFrame**，这是 Layer 3 → Layer 4 / VRM 的核心接口：

```typescript
interface MotionFrame {
  timestamp: number;

  // Root（世界坐标）
  root_position: [number, number, number];
  root_rotation: Quaternion;

  // 关节旋转（local space，相对父骨骼）
  joint_rotations: Record<string, Quaternion>;
  // 标准关节名使用 SMPL-X 命名（pelvis, spine1, spine2, ...）

  // 可选：关节位置（用于 Layer 4 空间查询）
  joint_positions?: Record<string, [number, number, number]>;

  // 可选：速度信息（用于 until 条件评估和 guidance）
  root_velocity?: [number, number, number];
}
```

不同 Generator 的 adapter 负责把模型原生输出转换为 MotionFrame：

- PRIMAL: SMPL-X 267-dim → MotionFrame（axis-angle → quaternion）
- DART: latent → decoded motion → MotionFrame
- FloodDiffusion: HumanML3D 263-dim → MotionFrame（需要 IK 或直接用 joint positions）
- Mocap playback: BVH/clip → MotionFrame

#### 模型选型标准

基于今天的讨论，选型优先级：

1. **纯运动学**（不依赖 physics sim）— 保留"人味"
2. **多模态 conditioning**（text + spatial + 可扩展）— 未来灵活性
3. **自回归 / 流式**— 实时交互
4. **Basin crossing 能力**— 通过 conditioning 辅助过渡

| 模型 | 运动学 | 多模态 Conditioning | 自回归 | 适合阶段 |
|------|--------|-------------------|--------|---------|
| Mocap playback | ✅ | N/A | N/A | Phase 1（管道验证） |
| FloodDiffusion | ✅ | text + timing | 非自回归 | Phase 2（快速原型） |
| DART | ✅ | text + spatial（latent opt / RL） | ✅ >300fps | Phase 2-3 |
| PRIMAL | ✅ | text + ControlNet（可扩展） | ✅ | Phase 3（目标） |
| MotionStreamer | ✅ | text only | ✅ | 备选 |

**PRIMAL 和 DART 是 sweet spot**——运动学空间保留人味，同时支持多模态 conditioning。

---

### Layer 4: Spatial Runtime（轻量空间感知层）

Layer 4 **不是物理仿真器**，而是一个轻量的空间查询和约束层。

#### 为什么不用 Physics Sim

Physics-based controller（MaskedMimic、BeyondMimic）优化的是物理可行性（关节力矩、平衡、接触力），但人类运动恰恰不是物理"最优"的。人有犹豫、有惯性上的"浪费"、有个人风格的微小不对称。这些在物理优化器看来是"误差"，在观感上却是让人看起来像人的关键。

那些 physics-based 论文的目标场景是 humanoid robot（Unitree G1 等），机器人看着稍微机械是可接受的。但虚拟 avatar 的核心诉求是"像人"不是"物理对"。

#### 空间感知 ≠ 物理仿真

avatar 需要的"物理"其实是几何/空间计算：

| 需求 | 全物理仿真 | 我们的方案 |
|------|-----------|-----------|
| 不穿墙/不穿家具 | 刚体碰撞 | AABB / 碰撞体 + raycast |
| 知道离目标多远 | 仿真器 state query | position distance 计算 |
| 脚不穿地板 | 接触力计算 | ground plane constraint（Y ≥ 0） |
| 手碰到物体 | 接触检测 | sphere/capsule overlap test |
| 障碍物回避 | SDF from physics mesh | 预计算 SDF 或 raycast |

这些在 Three.js 里用基本碰撞体就能做到，不需要物理引擎。

#### Layer 4 职责

```
Layer 4: Spatial Runtime
  │
  ├─ 碰撞体管理（场景里的 AABB / capsule / mesh collider）
  ├─ 空间查询 API
  │    ├─ distance(avatar, target) → float
  │    ├─ SDF(position) → float（离最近障碍物的距离）
  │    ├─ raycast(origin, direction) → hit point
  │    └─ overlap(capsule) → bool（是否穿模）
  ├─ 基本约束
  │    ├─ Foot Contact IK（脚不穿地，详见下文）
  │    └─ penetration correction（穿模修正）
  └─ World State 回传
       ├─ avatar position / facing / velocity
       ├─ 与目标的距离（until 条件评估）
       └─ 碰撞事件（穿模、到达目标等）
```

#### 空间查询对 Guidance 的支持

BeyondMimic 的 classifier guidance 在 physics sim 的 state-action 空间操作。但同样的思路可以在运动学空间实现——DART 已经证明了这一点（latent noise optimization）。

Layer 4 的空间查询为 guidance cost function 提供输入：

```
Layer 4 空间查询 → cost function 输入 → Generator guidance（如果支持）
  distance(avatar, obstacle) → obstacle avoidance cost
  distance(avatar, target)   → goal reaching cost
```

这让 Generator 有能力通过 guidance 做空间感知的运动调整，而不需要物理仿真器。

#### Foot Contact IK（Two-Bone IK）

纯运动学 motion gen 模型的常见问题：脚滑（foot skating）和脚浮（floating feet）。Layer 4 用轻量的 Two-Bone IK 修正，这是游戏工业标准做法，性能开销极小：

1. **Raycast**：从脚踝位置向下打射线，找到真实地面高度 `ground_y`
2. **Offset**：计算脚底需要抬高/降低的 `delta_y = ground_y - foot_y`
3. **IK Solve**：保持脚底在 `ground_y`，用 Two-Bone IK 调整膝盖（upperLeg + lowerLeg）角度
4. **Hips Adjust**：如果腿不够长（`delta_y` 超过阈值），把 hips 往下拉，保证姿态自然

这不是物理仿真——是纯几何约束求解，和 physics engine 完全不同量级。

---

## Phase Transition（Attractor 切换）— 更新

### 核心问题

BeyondMimic 明确指出：diffusion model 的 score field 在两个 mode 之间有低概率沟壑，gradient flow 过不去。

Basin crossing 失败的根本原因：

| 因素 | 详情 |
|------|------|
| 训练数据缺失 | 模式间的"谷地"没有训练数据，score field 未定义 |
| History conditioning 锁定 | 历史帧把模型锚定在当前 basin |
| Guidance 的两难 | 需要强 guidance 逃离 basin，但强 guidance 在高方差状态下不稳定 |
| Prediction horizon 太短 | 短 horizon 不够规划跨 basin 的轨迹 |

### 设计原则（更新）

**旧设计**：不让 Generator 跨 basin，Layer 2 硬管理一切过渡。
**新设计**：Layer 2 提供 transition hints + Generator 通过 multi-modal conditioning 协作完成过渡。

- Layer 2 知道 **what** transition to make（语义级决策）
- Generator 知道 **how** to physically execute it（动力学级执行）
- Layer 2 通过 ConditioningSpec.transition 给 Generator 提供"过渡路标"

### 三种过渡策略（保留，但语义变化）

由 Layer 2 根据 skill 对选择策略，同时通过 ConditioningSpec 给 Generator 提供辅助信息：

#### 策略 A: Hard Cut + Autoregressive Continuity

- 适用于：语义上本身就是断裂的切换（站着 → 突然坐下）
- 做法：直接切换 conditioning，依赖 Generator 自回归特性保证物理连续性
- Layer 2 在 ConditioningSpec.transition 中标注 from/to skill，Generator 可利用此信息

#### 策略 B: Inertialization + Spatial Guidance

- 适用于：需要平滑过渡的切换（走路 → 跑步）
- 做法：使用 Inertialization（惯性插值）而非简单的 SLERP/Cross-fade
- 如果 Generator 支持 spatial guidance，Layer 2 可提供 intermediate waypoints 辅助过渡

**Inertialization 机制**（AAA 游戏工业标准，The Last of Us / Assassin's Creed 等使用）：

不强行混合两个动作的姿态，而是：
1. 记录源动作结束瞬间的 position + velocity（每个关节）
2. 计算与目标动作对应帧的 offset（position diff + velocity diff）
3. 用 spring-damper 系统将 offset 衰减到零，"甩"到目标动作上

优势：保证切换瞬间的动量守恒感，不会出现 cross-fade 的"鬼畜"中间态。

参考：GDC "Inertialization" talks, Spring Damper Inertialization 算法。纯数学实现，不依赖特定模型。

#### 策略 C: Transition Skill

- 适用于：两个 mode 之间有明确的过渡动作（走路 → [减速停步] → 坐下）
- 做法：Layer 2 在两个 skill 之间插入一个专门的 transition skill
- 这个 transition 本身也是 Skill Library 里的一个 entry

#### Transition Table

```
transition_policy = {
    ("locomotion", "sit"):     "transition",   // 插入减速停步
    ("locomotion", "gesture"): "overlap",       // 上半身渐变
    ("idle", "locomotion"):    "hard_cut",      // 直接起步
    ("gesture_A", "gesture_B"): "overlap",      // 手势混合
}
```

### Basin Crossing 的改进方向（来自 BeyondMimic 启发）

1. **Transition-aware training data**：在 motion gen 训练数据中加入 skill 间的过渡片段
2. **Adaptive guidance scheduling**：过渡时调整 guidance 强度（早期强推、后期轻调）
3. **History ablation**：过渡时减弱 history conditioning 权重，释放模型从当前 basin 的锁定
4. **Longer prediction horizon**：过渡时临时扩展 horizon，让模型"看到"目标 basin
5. **Transition ControlNet**（PRIMAL 方向）：专门训练一个处理过渡的 ControlNet

这些是 v2+ 的研究方向，v1 先用三种策略 + 简单的 ConditioningSpec.transition hints。

---

## 反馈回路

### 设计原则

Event-driven 异步反馈，不是 tick-driven 同步反馈。Generator 大部分时间自主运行（CPG 特性），只在异常时上报。

### Event 类型

| Event | 触发条件 | 响应 |
|-------|---------|------|
| `GOAL_REACHED` | Layer 4 空间查询确认到达目标 | Layer 2 推进到下一个 skill |
| `GOAL_UNREACHABLE` | N 帧内目标距离没有减小 | 通知 Layer 1，触发 replan |
| `TIMEOUT` | 超过预期时长 | Layer 2 强制推进 |
| `COLLISION` | Layer 4 检测到穿模 | Layer 4 自行修正，严重时上报 |
| `PLAN_COMPLETED` | plan 所有节点执行完 | 通知 Layer 1（正常不会发生，因为最后节点是 interrupted） |

### 信息流

```
Layer 3 ──(MotionFrame)──→ Layer 4 ──(world state + events)──→ Layer 2
                                                                   │
                                                    大部分 event 自行处理（推进 plan）
                                                    只有异常才上报 Layer 1 触发 replan
```

---

## Pipeline Schema 总览

```
LLM
  │  输入: 对话上下文 + scene state JSON
  │  输出: plan (DAG of skill nodes + params + until)
  │
  ▼
Layer 2: Attractor Scheduler (DAG Workflow Runtime)
  │  执行 plan DAG
  │  检查 until 条件（需要 Layer 4 world state）
  │  通过 Skill Compiler 编译 ConditioningSpec（多模态）
  │  管理 phase transition（策略选择 + transition hints）
  │
  ▼  ConditioningSpec
Layer 3: Continuous Motion Generator
  │  接收 ConditioningSpec
  │  自回归生成连续骨骼动作
  │  输出 MotionFrame
  │
  ▼  MotionFrame
Layer 4: Spatial Runtime
  │  空间查询（碰撞检测、距离计算）
  │  基本约束（ground contact、penetration correction）
  │  回传 world state + events 给 Layer 2
  │
  ▼  MotionFrame (corrected)
VRM Avatar (Three.js playground)
  │  MotionFrame → quaternion → VRM bone
  │  axis-angle → quaternion 转换（如果需要）
  │  直接 FK 驱动
```

### 核心 Schema

Pipeline 的稳定性取决于两个核心 schema：

1. **ConditioningSpec**（Layer 2 → 3）：多模态 conditioning 的统一接口
2. **MotionFrame**（Layer 3 → 4 → VRM）：per-frame 骨骼数据的统一格式

这两个 schema 稳定后，Generator 和 Spatial Runtime 都是可替换的 stage。

---

## 分阶段实现计划（ETL-first）

| Phase | 目标 | Layer 3 | 验证内容 |
|-------|------|---------|---------|
| Phase 1 | 跑通全链路 | Mocap clip 播放 | Pipeline schema、VRM 驱动、Layer 2 状态机、Layer 4 空间查询 |
| Phase 2 | 接入 motion gen | FloodDiffusion 或 DART | Skill Library → ConditioningSpec → motion → VRM 链路 |
| Phase 3 | 多模态 conditioning | PRIMAL / DART spatial | spatial target、trajectory guidance |
| Phase 4 | Basin crossing 优化 | 研究方向 | transition-aware training、adaptive guidance |
