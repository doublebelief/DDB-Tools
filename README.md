# DoubleDB 工具箱

面向开发者的 14 款浏览器工具。响应式布局、分类搜索、收藏、深浅色主题，无需登录。输入仅在浏览器内处理，不上传服务器；只将收藏与主题保存在当前域名的 localStorage 中。

- https://doubledatabase.me
- https://doubledatabase.cn

两个域名共用同一套构建，直接访问各自域名，不进行跨域跳转。HTTP 自动升级到同域名 HTTPS。

公共页脚展示主体备案号 **浙ICP备2026079328号**，链接至工信部备案系统。域名对应网站备案号：`doubledatabase.me` 为 `浙ICP备2026079328号-1`，`doubledatabase.cn` 为 `浙ICP备2026079328号-2`。

## 功能

| 工具 | 功能 |
| --- | --- |
| JSON | 格式化、压缩、校验、树形查看，保留大整数精度 |
| 编解码 | UTF-8 Base64、URL 组件、HTML 实体、Unicode |
| 时间戳 | 秒/毫秒、日期互转，时区显示 |
| JWT | Header/Payload 解码、过期状态；不验签 |
| UUID / 随机字符串 | UUID v4、密码学安全随机源、批量生成 |
| 哈希 | SHA-256、SHA-512、HMAC、文件摘要 |
| 正则 | JavaScript 正则、捕获组、匹配高亮、替换、Worker 超时保护 |
| 文本对比 | 逐行差异、新增/删除高亮 |
| 二维码 | 纠错级别、尺寸、PNG 下载 |
| 文本处理 | 去重、排序、大小写、命名转换、统计 |
| YAML ↔ JSON | 转换、语法校验、别名展开限制 |
| SQL | 常用方言、格式化、紧凑排版 |
| Cron | 5/6 位表达式、字段解释、时区、未来 8 次执行 |
| Markdown | 实时预览、代码高亮、安全过滤、HTML 导出 |

## 开发

需要 Node.js 22.12+（建议 Node 24）和 npm。

```sh
npm ci
npm run dev
npm test
npm run test:ui
npm run build
```

React + Vite；正式环境仅需 Nginx 托管 `dist/`，不需要 Node 常驻。依赖由锁文件固定。所有资源在构建中打包，无第三方 CDN 依赖。

目录：`src/` 前端、`tests/` 核心与 DOM 交互测试、`deploy/` Nginx 与发布脚本。浏览器支持 `document.modelContext` 时，JSON 页额外暴露 `format_json` 操作；未支持时正常使用页面。其注册和交互已通过模拟上下文测试，未验证原生浏览器 WebMCP 环境。

## ECS 部署

服务器：`deploy@example.invalid`

- 网站版本：`/srv/example-toolbox/releases/<release>`
- 当前版本符号链接：`/srv/example-toolbox/current`
- Nginx 入口：`/path/to/example-vhost.conf`
- 公共站点配置：`/path/to/example-site.conf`
- `.me` 证书：`/path/to/example-certificates/me/fullchain.pem`、`privkey.key`
- `.cn` 证书：`/path/to/example-certificates/cn/fullchain.pem`、`privkey.key`

首次安装证书与 `deploy/nginx-https.conf`，然后运行 `nginx -t` 并启动 Nginx。不要将证书、私钥或云平台凭据提交到仓库。

后续发布：

```sh
./deploy/deploy.sh
# 或指定其他 SSH 目标
DEPLOY_TARGET=deploy@your-server ./deploy/deploy.sh
```

脚本先执行测试与构建，再上传新版本并切换链接。旧版本保留。回滚时将 `current` 指回此前发布目录即可，Nginx 配置无需改变。

两个域名的 `@` A 记录均指向服务器 IP。安全组需要允许入站 TCP 80/443。证书须与所访问的域名匹配。

## HTTPS 证书更新

当前证书到期时间：**请查看实际证书有效期（Asia/Shanghai）**。当前为手动安装，不包含自动续签。到期前在阿里云续签、下载 Nginx 格式，并替换对应文件；私钥权限保持 `600`。然后：

```sh
nginx -t && systemctl reload nginx
```

不要只在阿里云签发新证书而未替换服务器上的文件。若要配置自动续签，可后续接入 ACME 或阿里云证书部署流程。

## 边界与隐私

- 主题和收藏按域名隔离；切换工具、刷新或离开页面会丢弃未保存输入。
- 文本文件导入上限 1 MB；哈希文件上限 50 MB；正则文本上限 10 万字符，运行超时 1 秒；差异文本总长上限 10 万字符；Markdown 上限 20 万字符。
- UUID、哈希和剪贴板依赖安全上下文，请使用 HTTPS（或本机 localhost）。
- JWT 解析不代表签名可信；SQL 格式化不执行查询，也不替代数据库验证。
- YAML 转换会移除注释；大整数保留，高精度 JSON 小数转成 YAML 字符串以避免精度丢失。
- Cron 采用 cron-parser 的 Unix 语义；不支持 Quartz 年字段。
- Markdown 过滤脚本、交互标签及图片，链接需用户主动点击；导出 HTML 使用相同过滤逻辑。
- 正式环境 CSP 禁止网络连接，阻止外部资源加载；无统计追踪脚本。

测试范围包含核心转换、加密标准向量、无效输入、正则超时、DOM 操作及 Markdown 注入防护。二维码 DOM 测试模拟 Canvas，真实编码由 qrcode 库执行。开发过程曾检查桌面预览；手机布局由响应式样式实现，未进行真机浏览器验收。
