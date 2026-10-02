# DoubleDB 工具箱

面向开发者的 14 款浏览器工具。响应式布局、分类搜索、收藏、深浅色主题，无需登录。普通工具输入仅在浏览器内处理；只将收藏与主题保存在当前域名的 localStorage 中。个人 AI 助理需单独登录，会将主动提交的问题、选择附带的内容和最近问答发送到配置的模型服务。

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

React + Vite；普通工具由 Nginx 托管 `dist/`；可选 AI 助理需要独立的 Node 服务。依赖由锁文件固定。所有资源在构建中打包，无第三方 CDN 依赖。

目录：`src/` 前端、`tests/` 核心与 DOM 交互测试、`deploy/` Nginx 与发布脚本。浏览器支持 `document.modelContext` 时，JSON 页额外暴露 `format_json` 操作；未支持时正常使用页面。其注册和交互已通过模拟上下文测试，未验证原生浏览器 WebMCP 环境。

## 部署

正式站点由 Nginx 托管。仓库不记录实际服务器地址、登录用户、证书路径或部署目录。所有实际环境值只保存在仓库之外，禁止提交。

```sh
# 以下仅为示例；实际值从仓库外的私有环境配置注入。
export DEPLOY_TARGET=your-ssh-alias
export DEPLOY_ROOT=/srv/example-toolbox
./deploy/deploy.sh
```

部署脚本先测试与构建，再上传版本并切换链接。共享静态资源保留各版本的内容哈希文件，防止旧标签页在新版本发布后加载失败。重载失败会回滚版本链接。共享资源不会自动删除，需监控磁盘占用并按访问情况安排保留策略。

Nginx 配置是模板，先在私有环境设置 `SITE_ROOT`、`ASSET_ROOT`、`SITE_SNIPPET`、`TLS_ME_CERT`、`TLS_ME_KEY`、`TLS_CN_CERT`、`TLS_CN_KEY`、`ACME_ROOT`，然后生成到仓库外的私有目录：

```sh
node deploy/render-nginx.mjs /path/to/private/generated-config
```

其中 `SITE_ROOT` 指向部署根目录下的 `current`，`ASSET_ROOT` 指向同一根目录下的 `shared-assets`。将生成配置安装到服务器实际的 Nginx 配置位置，再执行 `nginx -t` 和 reload。不要直接安装未替换占位符的模板。

证书由运维环境管理，到期前续签并更新部署。模板不包含自动续签功能，也不记录真实证书有效期或存储位置。

## 发布与输入保护

- 旧版静态资源与新版共存；加载失败时提供手动刷新提示，不自动刷新或把输入写入持久存储。
- JSON、YAML、SQL、差异比较和 Markdown 解析在独立 Worker 中执行，超时 5 秒自动终止；切换工具或开始新计算会取消旧任务。
- 编辑器拒绝过大的粘贴和文件内容，保留原输入；处理函数再次验证边界，不能通过导入或程序调用绕过。
- 通用输入上限 20 万字符，输出上限 100 万字符；JSON/YAML 深度上限 64 层、节点上限 1 万，树形视图上限 2,000 节点。
- SQL 与正则文本上限 10 万字符；Markdown 上限 5 万字符。正则另有 2,000 字符表达式、1 万字符替换模板、1 万次替换、100 个捕获组和 1 秒超时限制。
- 正则替换逐段检查输出预算，避免一次性构造巨大结果。

## 边界与隐私

- 主题和收藏按域名隔离；切换工具、刷新或离开页面会丢弃未保存输入。
- 文本文件导入上限 1 MB，并受工具字符数限制；哈希文件上限 50 MB；差异文本总长上限 10 万字符。
- UUID、哈希和剪贴板依赖安全上下文，请使用 HTTPS（或本机 localhost）。
- JWT 解析不代表签名可信；SQL 格式化不执行查询，也不替代数据库验证。
- YAML 转换会移除注释；大整数保留，高精度 JSON 小数转成 YAML 字符串以避免精度丢失。
- Cron 采用 cron-parser 的 Unix 语义；不支持 Quartz 年字段。
- Markdown 过滤脚本、交互标签及图片，链接需用户主动点击；导出 HTML 使用相同过滤逻辑。
- 正式环境 CSP 仅允许同域网络连接以支持 AI 接口，阻止浏览器直连外部模型服务；无统计追踪脚本。

测试范围包含核心转换、加密标准向量、无效输入、正则超时、DOM 操作及 Markdown 注入防护。二维码 DOM 测试模拟 Canvas，真实编码由 qrcode 库执行。开发过程曾检查桌面预览；手机布局由响应式样式实现，未进行真机浏览器验收。


## 个人 AI 助理

JSON、JavaScript 正则、SQL、Cron、Markdown 页可使用个人助理。所有人可见入口，只有持有私有访问口令的人能调用模型；无注册系统。两个域名使用独立的 host-only 登录 Cookie（HttpOnly、Secure、SameSite=Strict），8 小时失效；服务重启会使所有会话失效。不要分享口令。

- 默认不附带工具输入。勾选后产生可编辑的内容快照，最多 12,000 字符；不会自动读取 JWT、密码或 HMAC 密钥。
- 问题最多 4,000 字符，最近最多 4 轮完成的问答作为上下文，总历史最多 24,000 字符；附件不自动重复发送，但模型回答可能引用附件。
- 回答逐步显示、可停止、可复制；代码需检查确认后填入。JSON、SQL、正则、Cron 通过现有语法/格式检查后才替换输入，支持撤销。语法检查不保证代码逻辑正确，不执行 SQL 或服务器命令。
- 对话只存在当前页面内存；刷新、切换工具或退出登录后清空。服务不保存问题、回答或请求正文，模型服务方的数据处理政策另行适用。
- 默认单个并发、每分钟 10 次模型请求、每天 100 次（UTC 日期），失败请求也计次。每次最多 2,048 输出 token、60 秒；这是次数限制，不是金额预算，仍应设置服务商额度。
- 登录入口全局每分钟最多 8 次尝试。该策略适用于个人版，连续恶意尝试可能短暂阻止本人登录。

### 服务端配置

复制 `deploy/ai.env.example` 到仓库外的私有目录（权限 600），填写 `AI_ORIGINS` 和 `AI_ACCESS_HASH`。访问口令应使用至少 32 字节随机值生成，配置中仅保存其 SHA-256 摘要；不要使用人类可猜测的短密码。`AI_QUOTA_FILE` 指向服务可写的持久文件，用来在重启后保持每日次数限制。

`AI_ENDPOINT` 是完整 HTTPS Chat Completions 接口地址，`AI_MODEL` 为模型标识，`AI_API_KEY` 为服务端密钥。接口采用 `messages`、`stream: true`、`max_tokens` 请求字段，解析 SSE `choices[0].delta.content` 和 `[DONE]`；选定模型后需验证其兼容性。可参考[百炼流式协议文档](https://www.alibabacloud.com/help/en/model-studio/stream)。未配置这三项时，登录后显示“模型尚未配置”，不发出模型请求。

使用 `deploy/ai.service.template`，在私有输出中替换 `AI_ENV_FILE`、`AI_NODE_BIN`、`AI_SERVER_FILE`、`AI_STATE_NAME`；程序及 Node 运行时放在服务可读目录，环境配置由 systemd 读取。`StateDirectory` 对应目录与 `AI_QUOTA_FILE` 保持一致。服务以动态低权限用户运行，只监听 `127.0.0.1:8787`，由 Nginx `/api/ai/` 代理，不向公网开放此端口。服务没有访问 SSH、执行代码或数据库的工具能力。

启动示例（使用私有环境注入配置）：`node server/ai.mjs`。Nginx 配置包含代理与同域 CSP，安装后执行 `nginx -t`。`deploy/deploy.sh` 只发布静态前端；后端文件和 service 由运维独立更新并重启，保留旧版以便回滚。模型配置变化也需重启服务。不要将实际环境文件、口令、服务器路径或地址放入公共仓库。两个域名的所有登录与发送操作都校验精确来源，禁止跨域 Cookie 复用。
