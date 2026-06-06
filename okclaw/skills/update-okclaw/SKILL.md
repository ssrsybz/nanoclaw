---
name: update-okclaw
nameZh: 更新 OKClaw
description: 从上游同步 OKClaw 更新，检查冲突，构建验证
skillType: operational
category: system
allowed-tools:
  - Read
  - Bash
---

# 更新 OKClaw

从上游仓库同步 OKClaw 的最新更新，处理可能的冲突，并验证更新成功。

## 使用场景

当用户想要：
- 将 OKClaw 更新到最新版本
- 检查是否有可用更新
- 同步上游代码变更

## 前提条件

- 当前项目是一个 OKClaw 的 fork 或 clone
- 有网络连接可访问上游仓库
- 本地没有未提交的重要更改

## 步骤

### 1. 检查当前版本

```bash
cat package.json | grep '"version"'
```

记录当前版本号，以便后续对比。

### 2. 检查本地状态

```bash
git status
```

如果存在未提交的更改：
- 提醒用户先提交或暂存更改：`git stash`
- 不要在有未提交更改的情况下执行合并

### 3. 添加上游远程仓库

检查是否已配置上游仓库：

```bash
git remote -v
```

如果没有 `upstream` 远程仓库，添加它：

```bash
git remote add upstream https://github.com/qwibitai/okclaw.git
```

如果已存在但 URL 不正确，更新它：

```bash
git remote set-url upstream https://github.com/qwibitai/okclaw.git
```

### 4. 获取上游更新

```bash
git fetch upstream
```

### 5. 预览变更

在合并之前，先查看上游有哪些变更：

```bash
git log HEAD..upstream/main --oneline
```

查看具体文件变更：

```bash
git diff HEAD..upstream/main --stat
```

向用户展示变更摘要，让用户确认是否继续。

### 6. 合并更新

```bash
git merge upstream/main
```

如果出现冲突：
1. 查看冲突文件：`git diff --name-only --diff-filter=U`
2. 对每个冲突文件进行分析：
   - 读取冲突内容
   - 优先保留上游的更改（用户自定义部分需要手动重新应用）
   - 对于 `.env` 等配置文件，保留用户的自定义值
3. 解决冲突后：
   ```bash
   git add <resolved-files>
   git commit
   ```

### 7. 重新构建

```bash
npm install
npm run build
```

如果构建失败：
1. 检查错误信息
2. 尝试清除缓存后重新安装：`rm -rf node_modules && npm install && npm run build`
3. 如果仍然失败，检查 Node.js 版本是否符合要求

### 8. 验证更新

1. 检查新版本号：
   ```bash
   cat package.json | grep '"version"'
   ```

2. 启动服务进行测试：
   ```bash
   npm run dev
   ```

3. 验证基本功能：
   - Web 界面可访问（http://localhost:3100）
   - 消息收发正常
   - 已配置的频道仍然工作

4. 测试完成后，如果使用 systemd/launchd 管理服务，重启正式服务：
   ```bash
   # macOS
   launchctl kickstart -k gui/$(id -u)/com.okclaw

   # Linux
   systemctl --user restart okclaw
   ```

## 回滚

如果更新后出现问题，可以回滚到更新前的状态：

```bash
git reflog  # 找到更新前的 commit
git reset --hard <commit-hash>
npm install && npm run build
```

## 注意事项

- 更新前务必备份自定义配置（`.env`、`.mcp.json`、群组 CLAUDE.md）
- 合并冲突时，配置文件（`.env`）应保留用户自定义值
- 如果用户有自定义技能，更新不会影响 `.claude/skills/` 目录
- 更新后如遇问题，优先查看日志排查
