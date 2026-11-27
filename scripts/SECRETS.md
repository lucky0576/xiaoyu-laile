# 凭据管理说明

## 为什么有这个文件

仓库是**公开**的。历史提交里曾经明文包含：
- 服务器 root 密码
- 站点管理员密码

这些凭据已从代码中移除，改为从**环境变量**或本地未跟踪文件读取。

> ⚠️ 仅移除代码**不够**——密码已经公开过，必须**更换**。
> 见文末「必须做的事」。

## 使用方式

### 方式一：环境变量（推荐，一次性）

PowerShell：
```powershell
$env:XYL_SERVER_PASSWORD = '新密码'
.\scripts\deploy.ps1
```

bash：
```bash
export XYL_ADMIN_PASSWORD='新密码'
node scripts/contest-reminder.mjs
```

### 方式二：本地密钥文件（长期，方便）

在项目根目录创建 `.secrets.env`（已被 .gitignore 忽略）：

```ini
XYL_SERVER_HOST=root@154.221.23.7
XYL_SERVER_PASSWORD=改成新密码
XYL_ADMIN_ACCOUNT=13456693544
XYL_ADMIN_PASSWORD=改成新密码
```

PowerShell 脚本启动时会自动加载它：

```powershell
. "$PSScriptRoot\_secrets.ps1"
```

Node 脚本：

```js
import { loadSecrets } from './lib/secrets.mjs';
loadSecrets();
```

## 变量清单

| 变量 | 用途 | 用于 |
|---|---|---|
| `XYL_SERVER_HOST` | 服务器 SSH 地址 | `deploy.ps1` / `pull-backup.ps1` 等 |
| `XYL_SERVER_PASSWORD` | 服务器 root 密码 | 同上 |
| `XYL_ADMIN_ACCOUNT` | 站点管理员账号 | 各类维护脚本 |
| `XYL_ADMIN_PASSWORD` | 站点管理员密码 | 同上 |

## 必须做的事（换密码）

代码清理只是止损，**已泄露的密码必须更换**：

### 1. 换服务器 root 密码

```bash
ssh root@154.221.23.7
passwd
```

更推荐：改用 SSH 密钥登录并关闭密码登录

```bash
# 本机
ssh-keygen -t ed25519 -f ~/.ssh/xiaoyu_server
ssh-copy-id -i ~/.ssh/xiaoyu_server.pub root@154.221.23.7

# 服务器
vim /etc/ssh/sshd_config
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
systemctl restart sshd
```

### 2. 换站点管理员密码

登录后台改，或直接改数据库：

```bash
cd /opt/xiaoyu-laile
node -e "
const db = (await import('./src/store/db.js')).default;
const u = db.collection('users').findOne(x => x.phone === '13456693544');
console.log('找到管理员:', u && u.nickname);
"
```

### 3. 检查服务器有没有被入侵

```bash
last -20                 # 最近登录记录
grep -i 'accepted' /var/log/auth.log | tail -30
ps aux | grep -v '\['
crontab -l
```

## 清理 git 历史（可选）

已公开的提交历史里仍有旧密码。即使代码已改，有权限的人仍能翻到。

彻底清除需要重写历史并强推：

```bash
git filter-repo --replace-text <(echo 'regex:Weilan0576==>***REMOVED***')
git push --force
```

**但注意**：GitHub 可能已被爬虫抓取、fork 保留旧提交。所以
**换密码才是真正的修复**，重写历史只是降低后续暴露面。
