# 发版指南

> 给「超级小金」桌面客户端发布新版本的标准操作流程。

---

## 1. 谁能发版

- **自动**：任何能 push 到 `origin`（GitHub `Healer-star-code/education-web-backed`）的人，只要打 tag 就触发。
- **半自动**：仓库管理员也可在 GitHub Actions 页面"Run workflow"手动触发并指定版本号。

---

## 2. 标准发版流程（推荐：tag 触发）

```bash
# 1. 在 v4 目录里改版本号
cd E:\EducationalAgent\v4
# 编辑 package.json -> "version": "0.1.1"

# 2. 提交版本号
git add package.json
git commit -m "chore: bump version to 0.1.1"
git push origin feat/desktop-p0   # 或者其它常驻分支

# 3. 打 tag 并 push（关键：tag 必须以 v 开头）
git tag v0.1.1
git push origin v0.1.1

# 4. 等待 ~5 分钟
#    GitHub Actions 会自动完成：
#    - Windows runner: 类型检查 -> 打包 setup.exe + portable.exe
#    - Linux runner:   打包 AppImage
#    - Ubuntu runner:  汇总产物 -> 创建 GitHub Release v0.1.1
```

观察 Actions 状态：

```text
https://github.com/Healer-star-code/education-web-backed/actions
```

---

## 3. 手动触发发版（应急）

如果不想 push tag：

1. 打开仓库 → `Actions` → 选 `Release` workflow
2. 点 `Run workflow`
3. 填版本号（不带 v 前缀，例如 `0.1.2`）
4. 点 `Run workflow` 按钮
5. 等待跑完

> 注意：手动触发只是生成 artifacts（CI 产物），**不会**自动创建 Release，需要管理员手动下载后用 `gh release create` 命令上传。

---

## 4. 用户端表现

发版完成后约 5 分钟内：

1. 所有已安装客户端启动时（packaged 模式）自动检查 GitHub `Releases/latest`
2. 发现新版本 → 设置面板「软件更新」区显示 `发现新版本 vX.Y.Z`
3. 用户点 `下载` → 后台下载（含差分更新，节省流量）
4. 下载完成 → 弹按钮 `重启并安装`
5. 用户点击 → 自动重启完成升级

---

## 5. CI / Release workflow 文件位置

```text
.github/workflows/ci.yml        # push 任何分支都跑：typecheck + build
.github/workflows/release.yml   # tag push 或手动触发：完整打包 + 发 Release
```

---

## 6. 常见问题

### Q: tag 推送了，但 Actions 没跑？

A: 确认 tag 格式：`v0.1.1`（必须 v 前缀 + 三段数字）。  
查看 Actions tab：`https://github.com/.../actions`

### Q: Windows runner 打包失败说找不到 electron 二进制？

A: 默认走 GitHub 自带源，需要时间。如果国内服务器搬迁版本，把 `ELECTRON_MIRROR` 改成可达的镜像。

### Q: 自动更新不工作

A: 检查：
1. 客户端是 packaged 版（dev 模式不会检查更新）
2. 仓库 Release 里有 `latest.yml`（自动生成）
3. 客户端 console 看 `updater:state` 事件是否触发；error 字段有线索

### Q: 想换成不用 GitHub Releases（公司内网）

A: 编辑 `electron-builder.yml`：
- 注释 `provider: github` 段
- 启用 `provider: generic` 段，填你的 HTTPS 静态服务器 URL
- 每次发版手动把以下文件传到该 URL：
  - `*.exe`、`*.blockmap`、`latest.yml`

---

## 7. 版本号规则

- **主版本**（X.0.0）：重大架构变更、不兼容更新
- **次版本**（0.X.0）：新功能、UI 大改
- **补丁**（0.0.X）：bug 修复、文案调整

发版前确保：

- [ ] `npm run typecheck` 通过
- [ ] `npm run dev` 本地测一遍核心流程
- [ ] `package.json` 版本号已改
- [ ] 写好对应 commit message
- [ ] 打 tag 用 `v` 开头
