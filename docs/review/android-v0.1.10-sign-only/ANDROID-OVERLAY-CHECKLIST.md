# ARM64 本地覆盖验收（尚未执行）

仅在获授权、隔离、可清空的测试设备/模拟器执行。不要在用户日常手机上运行，也不自动预约云设备。当前没有已连接 ARM 测试设备；这不是已通过验收。

## 接收与校验

测试环境自行生成一次性接收者密钥；私钥不上传、不放进CI、不进PR。通过独立通道核实完整指纹后，才允许 signer 对此唯一接收者加密。接收端解密先写私有临时路径，只有解密返回成功且完整性校验通过才改名供安装；错误/篡改删除暂存文件。禁止直接流式传给 adb install。

核实密文的实际 SHA256、来源签名 run/操作 SHA，再解密。核实新 APK 的签名证书 SHA256 = `82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88`，包名 `com.zhiweixiao.t3code.zhcn`，版本 `0.1.10-zh.1` / `1000418`，仅 `arm64-v8a`。原已发布APK必须SHA256为 `900aa0db1585dbcc69e39fb125bec82b3e69251a249e7a35ad8ee39ce264a8c4`，版本1000416且同证书。运行可信SDK的 `apksigner verify --verbose --print-certs`、`aapt2 dump badging`、`zipalign -c -P 16 -v 4`，保留裁剪后的证明，不上传密钥、个人设备ID或用户数据。

## 准确命令骨架

下面的 NEW_APK 只能是已经上述校验过的真实原钥签名包，不是 synthetic demo。ANDROID_SERIAL 必须人工确认是专用测试设备。任何命令非零停止；不加 -d、不清数据、不卸载后假装覆盖成功。

```sh
set -eu
: "${ANDROID_SERIAL:?explicit isolated test serial required}"
: "${OLD_APK:?verified published 1000416 APK required}"
: "${NEW_APK:?verified same-cert 1000418 APK required}"
PKG=com.zhiweixiao.t3code.zhcn
adb -s "$ANDROID_SERIAL" get-state
adb -s "$ANDROID_SERIAL" shell getprop ro.product.cpu.abilist
adb -s "$ANDROID_SERIAL" shell getprop ro.build.version.sdk
# 此块故意在安装前停止，先人审 pm path 的完整结果（包括错误/离线）。
adb -s "$ANDROID_SERIAL" shell pm path "$PKG" || true
printf '%s\n' 'STOP: confirm isolated device and package absent before proceeding'
exit 1
```

确认专用设备在线、包确实不存在后，才能另行运行以下安装步骤；不要简单删除上面的停止点做批量无人值守安装。

```sh
set -eu
: "${ANDROID_SERIAL:?explicit isolated test serial required}"
: "${OLD_APK:?verified published 1000416 APK required}"
: "${NEW_APK:?verified same-cert 1000418 APK required}"
PKG=com.zhiweixiao.t3code.zhcn
adb -s "$ANDROID_SERIAL" install --no-streaming "$OLD_APK"
adb -s "$ANDROID_SERIAL" shell dumpsys package "$PKG" # 记录1000416、firstInstallTime、权限状态
adb -s "$ANDROID_SERIAL" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
# 人工在旧版连接隔离测试服务器，创建非敏感持久化设置/会话标记并截图；没有标记则不能证明数据保留。
adb -s "$ANDROID_SERIAL" shell am force-stop "$PKG"
adb -s "$ANDROID_SERIAL" install --no-streaming -r "$NEW_APK"
adb -s "$ANDROID_SERIAL" shell dumpsys package "$PKG" # 必须1000418，firstInstallTime保留
adb -s "$ANDROID_SERIAL" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
# 人工确认旧标记保留、启动无崩溃，连接/配对、中文、输入/发送/流式响应、断网重连、后台返回正常。
```

上面 pm path 的人审注释不是可无人值守的断言脚本；这些是操作清单，不能直接当自动验收工具。完整自动化需绑定真实设备与fixture，避免误操作。

## 通过证据

保存：新旧APK哈希与同证书证明、CPU ABI/API、安装返回Success、前后versionCode、保留firstInstallTime、同一个非敏感标记前后截图、启动/恢复/联网/中文/流式场景结果。ADB安装成功本身不等于应用质量验收。干净安装还须使用另一个干净隔离实例（或经单独许可恢复专用测试快照），不能用覆盖安装代替。不要把私有服务器地址、会话文本、token或设备标识公开到PR。

回滚不能假设Android允许降versionCode；不使用 -d 绕过。真实用户升级前保留旧安装包并备份应用可导出数据/服务端数据库，恢复需另审版本兼容性。验收通过后才能进入发布决策。
