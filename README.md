# 力法许可小程序

通过微信小程序为力法工具箱客户端签发 **1 天**或**永久**许可。小程序用 `wx.login` 获取一次性 code，独立 Azure Functions 服务校验微信身份，按公众号旧版格式用 RSA-SHA1 签名，将 `.lfm-license.dat` 上传至 Azure Blob Storage 的 `licenses` 容器并返回下载链接。原公众号后端不需要修改。

## 项目与部署

在微信开发者工具中打开本目录，AppID 为 `wx5b0addc610a9b8b9`。Azure 后端位于 `backend/`；目标资源组为 `rg-lifa-mosaic-license-issuer`（East Asia），Function App 为 `lifa-mosaic-license-issuer`，与公众号服务独立。

1. 在 Azure Portal 打开上述 Function App 的「设置 → 环境变量 → 应用设置」，添加以下三项并保存。`WECHAT_APP_ID` 与 `AZURE_STORAGE_ACCOUNT` 已配置，不要修改运行存储设置 `AzureWebJobsStorage`。
   - `WECHAT_APP_SECRET`：微信公众平台「开发管理 → 开发设置」中**此小程序**的 AppSecret，仅供服务端调用微信 `jscode2session`；重置前确认不会影响其他集成。
   - `LICENSE_PRIVATE_KEY_BASE64`：从原公众号后端 `wx/license.js` 复制包含 `BEGIN PRIVATE KEY` 和 `END PRIVATE KEY` 的完整 PEM 签名私钥，在本机 PowerShell 中执行 `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Clipboard -Raw))) | Set-Clipboard`，将剪贴板中的编码结果填入 Azure，随后清空剪贴板。必须使用旧许可签名私钥，**不是**小程序代码上传 `.key` 文件，否则现有客户端无法验证许可。
   - `AZURE_STORAGE_KEY`：Azure Portal → Storage 账户 `storageaccountlifam886f` →「安全性和网络 → 访问密钥」，复制 `key1` 或 `key2` 的 **Key**，不是 Connection string。`licenses` 容器须存在，且返回的文件 URL 对客户端可访问。
2. 将 `lifa-mosaic-license-issuer.weixin.sneezry.cn` 的 CNAME 指向 `lifa-mosaic-license-issuer.azurewebsites.net`，按 Azure「自定义域」页面提示添加 `asuid` TXT 验证记录。若在 DNSPod 管理 `sneezry.cn`，CNAME 和 TXT 的主机记录分别填写 `lifa-mosaic-license-issuer.weixin` 和 `asuid.lifa-mosaic-license-issuer.weixin`，不要再附加 `sneezry.cn`；记录生效后在 Azure 为此域名绑定托管 HTTPS 证书。
3. 在微信公众平台「开发管理 → 开发设置 → 服务器域名」把 `https://lifa-mosaic-license-issuer.weixin.sneezry.cn` 加入 **request 合法域名**。普通真机测试要求 HTTPS 证书有效且域名符合微信的备案要求；未完成配置时，仅开发者工具和手机调试模式可临时跳过域名校验。
4. 运行 `npm ci` 安装小程序上传工具。在微信公众平台生成代码上传密钥并保存在仓库之外，使用 PowerShell 上传开发版：

   ```powershell
   $env:WX_CI_PRIVATE_KEY_PATH = 'C:\path\to\private.key'
   npm run upload
   ```

5. 不公开发布时，在微信公众平台「版本管理 → 开发版本」选择刚上传的版本，**设为体验版**；如需其他人测试，在「成员管理」添加体验成员，再用后台生成的体验版二维码扫码。无需提交审核或发布，普通小程序码及 CI 机器人生成的开发预览码不能代替体验版二维码。

用户输入工具箱客户端 ID，选择许可类型并签发；成功后复制下载链接。旧版授权记录按公众号 OpenID 保存，此测试版不读取 `license`/`admin` 权限。

不要把小程序 AppSecret、签名私钥、Storage 密钥或代码上传密钥写入项目文件或提交到版本库。服务缺少配置时返回 503，不会生成许可。

## 验证与维护

运行 `npm test` 检查短期许可的小端序时间戳、永久许可签名、HTTP 输入/登录校验及小程序请求和错误提示。运行 `npm ci --prefix backend` 安装后端依赖；后端发布时只打包 `backend/` 中的 `host.json`、`index.js`、`license.js`、`package.json`、`package-lock.json` 和 `node_modules/`，再使用 Azure Functions ZIP 部署到上述独立应用。小程序上传和后端部署是两项独立操作。

若启用了小程序代码上传 IP 白名单，需允许上传机器的公网出口 IP。此版本仅验证调用方有有效的小程序微信登录 code；**所有测试用户均可签发永久许可**。公开发布前必须增加服务端授权限制。
