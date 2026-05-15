# Slice 0 探索发现报告

> 在 fork 后的 openreel-video 中对架构、时间线模型、Three.js 集成点做的初次探查。
> 这一节直接影响 Slice 1 的 `GeneratedObject` 接口设计。

## 1. 仓库结构（pnpm monorepo）

```
openreel-video/
├── apps/
│   ├── web/        ← 视频编辑器主应用（@openreel/web，pnpm dev 启的就是它）
│   └── image/      ← 独立的图片编辑器（Photoshop-like），可暂时不动
├── packages/
│   ├── core/       ← @openreel/core，共享引擎/类型（关键）
│   ├── ui/         ← @openreel/ui，共享 UI 组件
│   └── image-core/ ← 图片编辑引擎，不涉及
├── infra/          ← 基础设施配置
├── scripts/        ← 构建脚本
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── package.json    ← 根 package.json，启动脚本 `pnpm --filter @openreel/web dev`
└── mediabunny.d.ts ← mediabunny 库类型定义（视频解析/编码）
```

**关键脚本**：
- `pnpm dev` → 在 `apps/web` 启动 Vite dev server
- `pnpm build` → 先编译 wasm（`@openreel/core build:wasm`）再编译 web
- 端口：默认 Vite 5173

## 2. 主要技术栈（apps/web）

| 类别 | 选型 |
|---|---|
| 框架 | React 18.3.1 + TypeScript 5.4 |
| 构建 | Vite 5.3 |
| 状态 | Zustand 4.5 |
| UI 原语 | Radix UI（shadcn 风格）+ Tailwind CSS 3.4 |
| 动画 | Framer Motion 12 + GSAP 3.14 |
| **3D** | **Three.js 0.182** ← 关键：项目已经依赖 Three.js |
| 视频/音频底层 | mediabunny + @ffmpeg/core（在根 package.json）|
| 测试 | Vitest |

## 3. 数据模型（核心发现）

### 3.1 Track 类型（5 种轨道）
来自 `apps/web/src/stores/project/types.ts:122`：
```
"video" | "audio" | "image" | "text" | "graphics"
```

### 3.2 Clip 子类型（从 `@openreel/core` 导出）
- **VideoClip** — 媒体视频
- **AudioClip** — 音频
- **ImageClip** — 图片
- **TextClip** — 富文本（支持 `TextAnimation` 预设 + 关键帧）
- **ShapeClip** — 几何形状（`ShapeType` + `ShapeStyle`）
- **SVGClip** — 导入 SVG
- **StickerClip** — 贴纸 / emoji

每种 Clip 在 `ProjectState`（`stores/project/types.ts`）都有完整 CRUD：
- `createXxxClip(trackId, startTime, ...)`
- `updateXxxStyle / updateXxxTransform / updateXxxAnimation / updateXxxKeyframes`
- `getXxxClip / getAllXxxClips / deleteXxxClip`

### 3.3 共享概念
- **Transform**：`position`/`scale`/`rotation`/`rotate3d`/`perspective`/`opacity`
- **Keyframe**：通用关键帧，绑定到任意 Clip
- **Effect / VideoEffect**：可叠加在 Clip 上的特效链
- **Transition**：Clip 之间的转场
- **AnimationEngine**：通用动画求值引擎（`@openreel/core` 导出）

## 4. Three.js 集成点（最关键发现）

**文件**：`apps/web/src/components/editor/preview/threejs-layer-renderer.ts`

**核心类**：`ThreeJSLayerRenderer`
- 内部维护：`THREE.Scene`、`THREE.OrthographicCamera`、`THREE.WebGLRenderer`（offscreen canvas，`preserveDrawingBuffer: true` 用于截帧）
- 投影：**正交相机**（2D 风格），frustum 跟 canvas 等大
- 公开方法（已实现）：
  - `resize(w, h)`
  - `createTextTexture(textClip, w, h)` → `CanvasTexture`
  - `applyTransform(mesh, transform, w, h)` — 把 Transform 转换为 mesh.position/scale/rotation
  - `applyBlendMode(material, blendMode, opacity)` — CSS blend mode → THREE.Blending
  - `renderTextClip(...)`、（同款的 renderShapeClip / renderSVGClip / renderStickerClip）
- **Blend mode 映射**：CSS 的 normal/multiply/screen/overlay 等 → `THREE.NormalBlending` 系列（部分近似）

**编排器**：`apps/web/src/components/editor/preview/canvas-renderers.ts`
- 持有单例 `threeJSRenderer: ThreeJSLayerRenderer`
- 持有 `animationEngine = new AnimationEngine()`
- 实现 `applyEmphasisAnimation(animation, time)` 等帧级动画求值（pulse / shake / bounce / float…）
- **就是这里在每帧把所有 graphic clips 的状态喂给 ThreeJSLayerRenderer**

**其他 Three.js 用法**：
- `WelcomeHero3D.tsx` — 欢迎页 3D 装饰（不重要）
- `ParticleRenderer.tsx` — 粒子特效
- `ColorWheelsControl.tsx` — 色轮 UI 控件

## 5. 我们的 `GeneratedObject` 怎么接入（明确路径）

**已经存在所有需要的"插槽"**——只需要在每一层新增一种类型，**不需要重写架构**：

| 层 | 操作 | 文件 |
|---|---|---|
| Clip 类型定义 | 新增 `GeneratedClip` 接口 | `packages/core/src/graphics/types.ts`（与 ShapeClip/SVGClip 并列）|
| AI 模块 | 新增 `src/ai/` 目录 + provider 抽象 | `apps/web/src/ai/`（新建）|
| 项目 store 方法 | 新增 `createGeneratedClip` / `updateGeneratedSource` / `getGeneratedClip` etc | `apps/web/src/stores/project/`（增加 action helpers）|
| 渲染器 | 给 `ThreeJSLayerRenderer` 加 `renderGeneratedClip(clip)` 方法，或新增 sister 类共用 scene/camera | `apps/web/src/components/editor/preview/threejs-layer-renderer.ts` |
| 编排器 | 在 `canvas-renderers.ts` 的渲染分发里加 generated case | `apps/web/src/components/editor/preview/canvas-renderers.ts` |
| 时间线 UI | 让 graphics track 接受新 clip 类型（应该已经泛化）| `apps/web/src/stores/timeline-store.ts` |
| 沙箱 | AI 源码 → Web Worker / esbuild-wasm 编译执行 | `apps/web/src/objects/Sandbox.ts`（新建）|
| AI 面板 / 参数面板 / 源码编辑器 | 三个新 React 组件 | `apps/web/src/components/AIPanel/` 等（新建）|

`GeneratedClip` 建议的初始 schema（与现有 Clip 风格一致）：
```ts
interface GeneratedClip extends BaseClip {
  type: 'generated';
  source: string;                    // AI 生成的 TS 源码
  sourceLanguage: 'typescript' | 'javascript';
  providerId: string;                // 哪个 AI 生成的（claude/openai/deepseek/...）
  promptHistory: { role, content }[];// 对话历史，支持"让 AI 改一下"
  paramsSchema: JsonSchema;
  params: Record<string, unknown>;
  transform: Transform;              // 复用现有
  keyframes: Keyframe[];             // 复用现有，参数路径指向 params.xxx
  blendMode: BlendMode;
  blendOpacity: number;
}
```

## 6. 与原 plan 的差异（需要更新 plan）

原 plan 里"修改 openreel 轨道模型"标记为风险。**实际看下来是低风险**：
- 现有架构已经在 packages/core 抽象了 Clip 类型；新增一种类型是惯例，不是侵入式改动
- ThreeJSLayerRenderer 已经处理了 transform / blend mode / 动画 — 我们的 GeneratedClip 复用这些
- 关键帧系统是通用的，绑定到任意 Clip 的属性路径，paramsSchema 里的字段直接可以加关键帧

唯一新增的"绿地"工程：
- AI provider 抽象层（src/ai/）
- 沙箱执行（src/objects/Sandbox.ts）
- 三个新组件（AI 面板 / 参数面板 / 源码编辑器）

## 7. 不确定点 / 后续要确认

- [ ] `canvas-renderers.ts` 的 graphics 分发函数具体形态（只看了前 120 行）
- [ ] `packages/core/src/graphics/types.ts` 里 BaseClip 的具体字段
- [ ] 沙箱方案：Web Worker + Comlink vs `new Function` + 限制 globals — 取决于安全要求
- [ ] 关键帧系统对"嵌套参数路径"的支持程度（params.color vs 顶层属性）
- [ ] dev server 是否能在这台机器顺利运行（已启动，待验证端口和首屏加载）

## 8. 启动方式

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
cd D:\Desktop\Claude_code\meta_pixel\openreel-video
pnpm dev
# 浏览器打开 http://localhost:5173
```

环境配置已就绪：
- Node 24.15、pnpm 11、git、gh CLI 全部到位
- npm registry 指向 npmmirror（GFW 兼容）
- `.npmrc` 已创建在仓库根目录
- ExecutionPolicy 已改 RemoteSigned（CurrentUser scope）
