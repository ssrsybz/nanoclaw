---
name: "single-file-saver"
description: "使用SingleFile CLI将URL保存为干净的单个HTML文件。Invoke when user asks to save a webpage as single HTML file."
---

# SingleFile 网页保存技能

这个技能使用 SingleFile CLI 将任意URL保存为干净的单个HTML文件。

## 安装

首次使用需要安装 SingleFile CLI：

```bash
npm install -g single-file-cli
```

验证安装：

```bash
single-file --version
```

## 使用方法

### 基本用法

用户提供一个URL，技能会将其保存为干净的单个HTML文件：

```bash
single-file <URL>
```

### 常用选项

- `--output-directory=<path>`: 指定输出目录（默认当前目录）
- `--filename-template=<template>`: 文件名模板
  - `${title}` - 网页标题
  - `${url}` - 原始URL
  - `${date}` - 保存日期
  - `${datetime}` - 保存日期和时间
- `--insert-single-file-comment`: 在HTML头部插入包含URL的注释（默认true）
- `--resolve-links`: 将链接解析为绝对URL（默认true）
- `--insert-meta-CSP`: 插入CSP meta标签避免加载外部资源（默认true）

### 示例

```bash
# 保存到当前目录
single-file https://example.com

# 保存到指定目录
single-file https://example.com --output-directory=./saved_pages

# 使用网页标题作为文件名
single-file https://example.com --filename-template="${title}.html"

# 批量保存多个URL
single-file --urls-file=./urls.txt --output-directory=./saved
```

## 注意事项

- 部分网站可能有反爬虫机制，可能无法完整保存
- 建议配合代理使用（设置环境变量 `HTTP_PROXY` / `HTTPS_PROXY`）
- 某些需要登录的页面可能无法保存
- CLI使用无头浏览器处理页面，需要等待一会儿完成
