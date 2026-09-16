# 情侣小窝 💗

一个无需安装、手机直接打开的情侣健康管理网页：
- 每日体重记录、7天/30天/全部趋势曲线
- 早餐/午餐/晚餐/加餐
- 菜品库、分类筛选、随机点菜、删除菜品
- 双人房间链接，云端同步
- 昵称、伴侣昵称、头像
- PWA：支持添加到手机主屏幕

## 最简单部署方式

### 第 1 步：创建 Supabase 项目
1. 打开 https://supabase.com/ 注册/登录。
2. 新建一个项目，选择 Free。
3. 进入 **SQL Editor** → **New query**。
4. 打开本项目的 `schema.sql`，全部复制进去并点击 Run。

### 第 2 步：复制 Supabase 地址和密钥
1. 进入 Supabase：**Project Settings → API**。
2. 找到 Project URL 和 anon public key。
3. 打开本项目 `config.js`，替换：
   - `https://你的项目ID.supabase.co`
   - `你的-anon-public-key`
4. 不要把 service_role key 放进网页里；这里只使用 anon public key。

### 第 3 步：发布网页
推荐 GitHub Pages：
1. GitHub 新建一个 **Public** 仓库。
2. 把本项目所有文件上传到仓库根目录。
3. 进入仓库 **Settings → Pages**。
4. Source 选择 **Deploy from a branch**。
5. Branch 选择 `main` / `/root`，保存。
6. 等待 GitHub Pages 发布后，会得到一个网页地址。

然后手机直接打开网页即可。第一次创建房间后，复制“我的”页面里的房间链接发给伴侣。

## 手机主屏幕

在手机浏览器打开网页后，使用浏览器的“添加到主屏幕”功能。网页本身已经包含 PWA 配置。

## 数据与隐私

房间链接本身就是进入房间的凭证。不要把房间链接公开发布。数据库的普通匿名读写已关闭，网页只通过 SQL RPC 操作房间数据。

## 免费方案说明

当前方案依赖 Supabase Free + GitHub Pages。Supabase 当前免费层提供 500 MB 数据库、1 GB 文件存储等额度，但免费项目在持续 1 周无活动后会暂停；恢复使用时需要在 Supabase 后台重新唤醒项目。GitHub Pages 可在 GitHub Free 的公开仓库中使用。

## 文件说明

- `index.html`：网页入口
- `styles.css`：手机界面样式
- `app.js`：全部功能
- `config.js`：你的 Supabase 配置
- `schema.sql`：一键建立数据库结构
- `manifest.json` / `sw.js`：主屏幕安装能力
