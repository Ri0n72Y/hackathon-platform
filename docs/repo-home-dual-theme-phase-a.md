# Repo Home Phase A · Dark Blurple / Light Lime 实施与验证

## 范围
- Lead Request: [Coder #54](https://github.com/Ri0n72Y/hackathon-platform/issues/54#issuecomment-6855493714)；设计依据是已合并的 [PR #67](https://github.com/Ri0n72Y/hackathon-platform/pull/67) 和 `docs/LabourChain-Visual-Component-Coder-Handoff.md`。开发起点 main `f8a94da4189c8548ecdd3a6e9a79d4c75aab0ef2`。
- 独立分支 `feat/repo-home-dual-theme-visual`，仅修改 Repo Home / SafeMarkdown 现有 CSS Modules、Repo Home 的可选受控 theme prop、既有 Playground 的 Repo Fixture 装配及对应测试。**未修改 TopicPage PR #64、它的开发分支或其他业务路径。**
- 两种主题共用 Hero → Team 单行头像条 → Repo Feed 单列长文。原有 Description 优先、README 兜底、成员 JSON 顺序、Issue Open/Closed、更新倒序/PR 过滤、Markdown 原文顺序、展开、真实路由链接、分支展示、刷新、分页、重试和失败状态继续由原业务代码负责。
- Repo Home 的布局上限从原 `960px` 调整为候选 `1120px`，但 **Feed 独立限宽 `760px`**；其他 Repo 成员/登记页面仍保留原宽度。本阶段交由用户 D4 视觉校准。
- Dark 蓝紫主按钮 `#5368E9`／白字，Light Lime 主按钮 `#D3E985`／深字 `#283327`；Light 正文链接 `#4A661B`，无 Light 蓝紫／独立品牌黄。状态错误仍使用实际语义色，图像不反色。

## 可复现的受控 Playground 入口
以下均使用已有 Repo Home Cordis 插件和 `repo-fixture.ts` 数据替身，不能宣称生产 GitHub 数据。仅当 `repoFixture=1` 才注入页面内 `repoTheme`：

- Dark：`/sample/repo?repoFixture=1&repoTheme=dark&fixtureCase=description&fixtureCount=21`
- Light Lime：`/sample/repo?repoFixture=1&repoTheme=light&fixtureCase=description&fixtureCount=21`
- 缺少简介：`/sample/repo?repoFixture=1&repoTheme=light&fixtureCase=readme-missing&fixtureCount=0`
- 团队缺失／无效／错误：`/sample/repo?repoFixture=1&repoTheme=dark&fixtureTeam=missing|empty|invalid|error`（依次将参数替换成其中一个字符串）
- README 错误：`/sample/repo?repoFixture=1&repoTheme=light&fixtureCase=readme-error`
- Repo 元数据错误：`/sample/repo?repoFixture=1&repoTheme=dark&fixtureCase=intro-error`
- Issue 空态：`/sample/repo?repoFixture=1&repoTheme=light&fixtureCount=0`
- Issue 第 2 页失败、重试：`/sample/repo?repoFixture=1&repoTheme=dark&fixtureCase=feed-error&fixtureCount=21`
- 大段 Markdown：使用默认 `fixtureCount>=1` 展开第 1 个普通 Issue；包含 H1-H6、图片和视频**外链**，按源码顺序出现。
- 320px、375px、768px 视口及 200% 缩放：核对整页不横向溢出、Avatar 局部横滚、控件可用、Markdown 长链接与代码区域局部滚动；这些需要真实浏览器手工检查，本轮尚未执行。

### 外观装配边界
`createRepoHomePlugin(api,{theme})` 是既有插件的可选展示参数。普通生产 `repoHome` 未指定该参数；无 query 时使用现有兼容外观，不提供 UI 主题切换、不选择用户首次默认、不自动读取系统主题、**不保存主题偏好**。本阶段“可分别渲染”仅指明确 `repoFixture=1&repoTheme=dark|light`。不以本 PR 声称全站双主题或正式用户切换交付。

## 自动化及工程检查
- CI 现有 `npm run build`（TypeScript/Vite）、`npm run test:installation` 与 Router Tests，不新增依赖或修改 CI 配置。
- `tests/repo-theme.test.mjs` 加入既有 Installation 测试入口，通过 SSR 验证两种作用域属性、无主题未注入、样式 Token 的 Dark/Light 对应关系、页面专属 CSS Modules/单列 Feed/焦点/窄屏、受控不同主题相同数据与 Markdown 顺序、既有业务动作/路由保留。
- 受控 Node/SSR/Fixture 测试仅覆盖可执行替身和静态契约；无法证明鼠标 Hover、真实窗口滚动、图片加载或 200% 缩放视觉合格。

## 未经授权或未验证
- 未新增 PR 功能、Issue 分类筛选、虚构统计/成员/图片、3D 资产、主题选项、存储、真实 GitHub 写操作、Vercel Functions、App scope、路由、额外 Cordis Root、第三方依赖。
- 没有实际操作 Playground 浏览器，未执行 Vercel Runtime/真实 OAuth/真实仓库/移动浏览器及用户 #51 D4；不得将 CI/Mock 当作线上验收。PR 仅交 Independent Reviewer 对最新 Head 做静态 Code QA，由 Owner/Lead 管理合并。
