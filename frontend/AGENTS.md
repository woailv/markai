### 背景

按照项目规范重构

### 目标结构(权威版)

```
src/
├── app/                          # 应用外壳(入口 + Provider + 路由装配)
│   ├── providers/                # ThemeProvider、TooltipProvider 等
│   ├── main.tsx                  # 唯一入口
│   ├── app.tsx                   # 顶层 App(替代根 App.tsx)
│   └── router.tsx                # 路由(替代 src/router/)
├── components
│   └── ui/                       # shadcn 基础组件
├── pages/
│   └── home/
│       ├── home-page.tsx         # 只做布局编排,≤ 80 行
│       ├── main-layout.tsx       # 三栏 Resizable 布局
│       ├── status-bar.tsx
│       └── index.ts              # export { HomePage }
│
├── features/                     # 每个 feature 自包含,对外只经 index.ts
│   ├── conversation/
│   │   ├── model/ (store + hooks + types + 领域逻辑)
│   │   ├── ui/ (React 组件)
│   │   └── index.ts
│   ├── assistant/  ...
│   ├── composer/   ...
│   ├── executor/   ...
│   ├── file-buffer/...
│   ├── tabs/       ...
│   ├── template/   ...
│   └── workspace/  ...
│
├── widgets/                      # 组合多个 feature 的复合块(如 recent-list)
│   └── recent-list/
│
├── entities/                     # 跨 feature 的领域模型(message 等)
│   └── message/
│       ├── types.ts
│       └── message-content.tsx
├── lib/                          # utils、file-context、template-context
├── shared/                       # 通用能力,零业务
│   ├── rich-editor/              # 通用富文本编辑器(原 components/rich-editor)
│   ├── hooks/
│   └── config/                   # 布局常量等(WORKSPACE_LAYOUT 等)
│
├── types/                        # 全局共享 TS 类型(保留)
├── index.css
└── vite-env.d.ts
```

### 依赖方向(硬约束)

```
app → pages → widgets → features → entities → shared
```

反向禁止;**feature 之间不得互相 import**,如需共享必须下沉到 `entities` 或 `shared`。

#### 步骤:文件搬迁映射

**布局常量**(`WORKSPACE_LAYOUT`、`CHAT_PANEL_LAYOUT` 等)从 store 抽出,放到 `src/shared/config/layout.ts`。 
#### 步骤:为每个 feature 建 barrel

在每个 `features/*/index.ts` 中**只导出必需的公共 API**(组件 + store hook + 必要类型),内部实现禁止外部 import。示例:

```ts
// features/conversation/index.ts
export { ChatPanel } from "./ui/chat-panel"
export { PanelHeader } from "./ui/panel-header"
export { useConversationStore } from "./model/conversation.store"
export { useChatSession } from "./model/use-chat-session"
export type { Conversation, Message } from "./model/types"
```

# 二、AI 编码指导手册

---

## AI 编码指导手册(v1)

### 1. 架构公约

#### 1.1 分层与依赖方向
```
app → pages → widgets → features → entities → shared
```
**只能上层依赖下层,反向严禁。** 平级之间(feature ↔ feature)**禁止直接依赖**,共享物下沉到 `entities` 或 `shared`。

#### 1.2 Feature 结构
每个 `features/<name>/` 必须包含:
- `model/`:store、hooks、纯领域逻辑、类型。**无 JSX**。
- `ui/`:React 组件。**不写领域计算**,只做展示与事件转发。
- `index.ts`:barrel,**唯一对外出口**,外部只能从此 import。

#### 1.3 命名
- 文件:`kebab-case.ts` / `kebab-case.tsx`。
- 组件:`PascalCase`。
- Hook:`useXxx`,置于 `model/` 或 `shared/hooks/`。
- Store:`xxx.store.ts`,导出 `useXxxStore`。
- 类型文件:`types.ts`,导出的类型 `PascalCase`,枚举/常量 `SCREAMING_SNAKE_CASE`。
- 布尔:`is / has / can / should` 前缀。

#### 1.4 路径别名
永远用别名,禁止相对路径超过一层(`../` OK,`../../` 不 OK):
```
@/app/*  @/pages/*  @/widgets/*  @/features/*  @/entities/*  @/shared/*
```

### 2. React 规范

- **函数组件 + Hook**,不写 class。
- **props 显式类型化**,禁止 `any`,不确定用 `unknown` + 类型收窄。
- **组件单一职责**:一个组件超过 200 行 或 useState 超过 5 个,考虑拆分或抽 hook。
- **Props drilling 超过 2 层**:抽 Context 或走 store。
- **不在 render 里 new / 创建函数**,用 `useCallback` / `useMemo` 稳定引用,但**不要为了 memo 而 memo**——只有当子组件被 `React.memo` 包裹或作为 hook deps 时才需要。
- **Effect 三问**:同步了什么外部系统?依赖数组完整吗?清理函数写了吗?没有外部同步就不该有 effect。
- **key 必须稳定唯一**,禁用 index 作 key(列表可增删场景)。
- 事件处理器命名 `handleXxx`,props 里叫 `onXxx`。

### 3. TypeScript 规范

- `strict: true`,禁用 `any`;确需宽松用 `unknown` + 类型守卫。
- 优先 `type`,继承/合并才用 `interface`。
- **Discriminated Union > 可选字段大杂烩**:
  ```ts
  type Tab =
    | { kind: "file"; path: string }
    | { kind: "template"; templateId: number }
  ```
- 导出的公共 API 必须显式标注返回类型,内部函数可推断。
- 禁止 `as` 强转,除非有充分注释说明为何安全。
- 时间用 `number`(ms)或 `Date`,不用字符串;金额用整数分,不用浮点。

### 4. Zustand Store 规范

- **一个 store 一个域**,不做上帝 store。
- Store 定义 selector,组件订阅**具体字段**,不订阅整对象:
  ```ts
  // ✅
  const width = useWorkspaceStore(s => s.width)
  // ❌
  const { width, collapsed } = useWorkspaceStore()
  ```
- 派生数据用 selector 计算,不塞进 state。
- action 命名动词开头:`setXxx / loadXxx / removeXxx / toggleXxx`。
- **异步 action 内部处理错误**,不 throw 出组件;需要通知 UI 时走 toast。
- persist 白名单化,只持久化必要字段。

### 5. 样式规范(Tailwind v4)

- 优先 Tailwind utility,自定义样式用 CSS 变量;禁写行内 `style`(动态尺寸除外)。
- 类名顺序交给 `prettier-plugin-tailwindcss`,不手工排。
- 条件类用 `cn()`(基于 `clsx` + `tailwind-merge`),不用字符串拼接。
- **禁止**在业务组件里直接写颜色 hex,统一走主题 token(`bg-border / text-primary` 等)。
- shadcn 组件放 `components/ui/`,业务组件不改动其内部实现,只通过 `className` 覆写。

### 6. 状态与副作用

- **数据流方向**:store → hook(封装业务) → component(消费)。组件不直接调后端 API,统一走 hook / action。
- 派生状态优先 `useMemo` / selector,不用 `useState + useEffect` 同步。
- **AbortController 是默认动作**:所有可能返回的异步都要能被取消。

### 7. 错误处理

- 用户可见的错误 → toast + 可读文案,不暴露堆栈。
- 开发者错误 → `console.error` 带上下文,或抛出到最近的 ErrorBoundary。
- 每个路由 / 大 feature 包一层 ErrorBoundary。
- **不吞异常**:`catch` 里要么 log 要么 rethrow,禁止空 catch。

### 8. 性能

- 长列表 > 100 项用虚拟滚动(考虑 `@tanstack/react-virtual`)。
- 图片、CodeMirror 等重资源懒加载(`React.lazy` + `Suspense`)。
- 避免在顶层 store 存整棵大树,能拆则拆。
- 拖拽/滚动等高频事件用 `requestAnimationFrame` 或节流。

### 9. 给 AI 的硬性指令

写代码前:
1. **先读**目标文件所在 feature 的 `index.ts` 和相邻同类文件,遵循既有 pattern。
2. **不要发明新 API**:能用现有 hook / util 就复用,新增前先搜索。
3. **不要跨越依赖方向**,发现自己在 feature 里 import 另一个 feature,立即停下,提出下沉方案让人拍板。
4. **不要静默改动无关文件**,格式化、重命名等都要单独讲清。
5. **不要引入新依赖**:必须新增时说明理由、体积、替代方案。

写代码时:
- 每个函数、hook、组件顶部一句 JSDoc 说明**做什么、为何存在**,不写实现细节。
- 中文注释可,代码标识符英文。
- 复杂逻辑加"为什么这么写"的注释,不加"这行做什么"的废话。

写完代码:
- 自查:是否有未使用 import?是否有 `console.log`?是否有 `TODO` 未记录?是否漏了 error 分支?依赖数组是否完整?
- 报告:改了哪些文件、为什么、如何验证。

### 10. 禁止清单(hard no)

- ❌ Feature 互相 import
- ❌ 绕过 barrel 深引用 `@/features/x/ui/y`
- ❌ 在 store 里存 DOM 引用、React 元素
- ❌ 在 render 中副作用(setState、路由跳转、写 store)
- ❌ 无 cleanup 的订阅、定时器、事件监听
- ❌ 无 key 或 index 作 key 的可变列表
- ❌ 一次 PR 混合"搬迁 + 改逻辑 + 改样式"