# 原钥激活审查（惰性方案，未授权执行）

## 已观察的旧路径与精确风险

旧分支 `signing/android-bootstrap` 的已审基线为 `5b48c3abd7c38618d63a899059fdb852d66a34d7`。对应 `.github/workflows/android-sign-reviewed.yml` 实际是 **push** 触发，过滤该分支及该工作流、`docs/tools/android-cloud-signing/**`；名字中的 disabled 不是禁用机制。不要向该路径推送本草案。

旧 job 使用既有 `environment: android-signing`，`permissions: {contents: read, actions: read}`、`ubuntu-24.04`，仅签名步骤获得既有两个 Secrets。根线程已通过 GitHub 环境 UI 只读核实：Selected branches and tags 仅允许 signing/android-bootstrap；required reviewers 关闭，wait timer 关闭；既有两个 Secrets，不改动。环境本身没有人工审批，不能把 environment 字段当作审批闸门。激活前仍需重新只读核实该状态，不能修改保护/Secrets/权限。GitHub Git 数据写权限不等于 workflow 文件写权限；本 PR 的 docs 提交成功不能证明连接器具有 workflow write 权限。

旧脚本硬编码另一个候选 74039745 / 1000417 / 26 receipts。仅替换 JSON 不够。它的 upload-artifact 会公开原钥签名 APK，所以不能沿用该上传步骤。

## 必须独立审查的激活差异

1. 现有环境仅允许 signing/android-bootstrap，因此不能在新分支调用 Secrets，也不能扩充白名单。最终只能在该分支应用经冻结独立审查的精确安全差异：同一提交先移除旧 push 触发及明文上传，改为仅 workflow_dispatch，绝不 pull_request/pull_request_target/workflow_run/schedule。提交前核查其他工作流不会因该次 push 触发签名。当前本 PR 仅存惰性方案，禁止把本PR直接合并到bootstrap。默认分支如需注册手动工作流，须另审不触发版本，绝不能引入新 secret access。
2. 使用环境已经允许的 signing/android-bootstrap ref，并锁定其唯一审查提交。派发前后验证 ref 仍指向该 SHA；不得使用裸 SHA 冒充 API 文档要求的 branch/tag name。job 验证 event=workflow_dispatch、repository、精确 github.sha 和 ref、run_attempt=1；concurrency 固定且 cancel-in-progress=false。记录唯一 run ID，失败不得自动再派发。暂不填写真实操作 SHA 或接收者身份。
3. 只读权限沿用 contents:read/actions:read，沿用 android-signing；不创建环境、不扩展可访问 Secrets 的分支、不放宽审批。不得添加任何新 ref；如果既有环境状态改变，停止交 root 决定而不是修改权限。
4. 无秘密 prepare 先运行本 PR 的 live 双快照 + ZIP 验证器，25项门禁全部成功、attempt1、源2ed55016、run44228163780、artifact14395695421，过期/变动即停。之后用官方已校验 SDK 实测包名 com.zhiweixiao.t3code.zhcn、0.1.10-zh.1、1000418、仅ARM64和未签名。
5. 移植旧已审 recovery/sign 内核，而非调用旧硬编码 sign_reviewed.py：保留恢复证据、容器哈希、固定证书82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88、16KB zipalign、签后包名/版本/ABI/验签复核及 finally 清理。此移植现由 signing_orchestrator.py + signer_adapter.py 实现，合成/模拟工具测试通过；现有 synthetic_sign_test.py 仍不可使用原钥。实际原钥执行未发生。
6. 公钥交接使用经过独立核验并固定的 **单个临时测试环境接收者**。私钥只在获授权测试环境，原签名私钥从不离开 signer。调用 encrypted_handoff.py；公开上传路径只允许一个密文文件及不含身份/秘密的摘要，不允许原APK、keystore、工作目录通配符或失败诊断目录。加密完整性不是发送者身份验证，接收端还须核对固定来源/run/密文摘要与APK签名。
7. 无论成功失败清理签名临时目录；不使用 cache；不打印工具密钥输出；取消/超时后的 runner 回收也不等于可证明物理擦除。发布另行验收，不加入 Release 权限。

## 将来获批后的单次派发模板（现在不可执行）

先确认上述移植已实现且独审通过、接收者与测试环境已授权、操作SHA/工作流路径/环境现状均核实。通过 API 查询该 SHA 的既有 runs，若已启动则仅跟进，不重发。

```text
POST /repos/ZhiweiXiao98/t3code/actions/workflows/android-sign-reviewed.yml/dispatches
{"ref":"signing/android-bootstrap","inputs":{"operation_sha":"<approved-operation-sha>","candidate_run":"44228163780","candidate_attempt":"1","artifact_id":"14395695421"}}
```

工作流必须对所有输入与内嵌常量相等作强校验，不接受用户替换任意URL/ref/hash。依据实际 API 版本核实响应（不能仅硬编码204，也可能返回带run信息的200）；请求接受不代表签名成功；回查 workflow_dispatch + exact SHA +唯一新run ID，再核验 prepare/sign/encrypt步骤与密文产物。当前没有可派发的该工作流，故不能声称已就绪原钥执行。

## 到期

原候选到期 2026-12-02 03:35:06 UTC。不得放宽过期检查或悄悄改用重建物；需要新完整来源链时重新审查。

## 当前交付边界

本文件是差异规格及派发模板，具体完整待审差异另见 bootstrap-stage.patch（保持 enabled=false、缺真实收件公钥，应用也不自动签名）；原 signer 25项合同移植及接收端现已实现并在惰性路径测试；实际操作SHA和一次性接收者绑定尚未授权填写，因此仍不可派发原钥。encrypted_handoff.py 仅解决传输保密/完整性，不代替身份恢复与Android验收。

## 默认分支注册缺口（已只读核实）

默认分支 66dcada844acc43edb4f76e46db258a38579268c 的 .github/workflows 目录没有 android-sign-reviewed.yml，因此该精确路径目前未在默认分支注册 workflow_dispatch。建议独立窄 PR 仅增加同路径的默认 marker，内容见 default-dispatch-marker.yml.example：只声明手动事件和输入、permissions:{}、job if:false，不含 environment/Secrets/checkout/upload。该 marker 本身不能签名，选择默认ref时始终跳过。

另一个经独立冻结审核的安全实现只应用到现有 signing/android-bootstrap（环境唯一白名单），移除push后再以此ref手动派发。同名路径使注册存在，不扩大环境权限。两处写入均未实施，需 root 先审完整实现与精确差异；不建议退回无法中途确认的 push 即签方案。

## 本轮可执行代码与依赖

新增 signer_adapter.py、signing_orchestrator.py、receiver.py 和对应测试。prepare在无Secrets步骤使用现有只读Actions token做固定25项及recovery证据的前后快照；sign步骤不联网、不接收GitHub token，接受绑定同一操作SHA/run/recipient且最多120秒的可信runner本地proof，重复字节及SDK校验。该时间窗口不是“签名那一瞬间重新在线核查”；超时必须停，不得延长并假称已验证。

requirements-signing.lock固定Python3.12/Linux x86_64三枚官方PyPI轮子hash，已下载逐项核验PyPI元数据并在隔离venv安装/测试。workflow先无Secrets安装锁定依赖，再下载官方SDK36 Linux ZIP并校验完整SHA256，签名代码还校验工具/JAR/动态库。JRE来自GitHub可信官方runner的JAVA_HOME_21_X64，不执行候选代码。接收端仅此Linux SDK绑定，Mac需要另核官方平台哈希，不能绕过。

bootstrap-stage.patch 是对旧分支5b48c3ab的完整惰性stage差异：移除原push/原明文上传、增加所有工具及disabled绑定，不含任何真实收件者。默认 marker 单独default-marker.patch。两者均仅在docs作为文本待审，不修改实际workflows。应用后仍须root确认真实测试环境/公钥绑定与最终操作SHA，不能直接原钥派发。

## 重放与操作者修正

run_attempt=1 与 concurrency 不能单独防止同SHA第二次新派发。新增 replay_guard.py：固定workflow399155956、path、ref、操作SHA与current run，检查actor和triggering_actor均为ZhiweiXiao98/id99611261；在同一固定concurrency job内、无Secrets的prepare首尾查询该workflow+SHA全部dispatch，必须只有当前run且分页/总数一致，任何已失败/取消/排队/完成的其它run都拒绝，不确定也拒绝。Secrets步骤只接受绑定该观察且120秒以内的本地proof。连接器机器人不是获准actor，不增白名单适配。

此检查基于API可见状态，不是事务性消耗凭据；并发派发或API可见延迟仍不能数学保证全局只执行一次。故仍要求root只经既有owner会话派发一次、记录run ID，不重试；完成/失败后优先由root经独立窄PR撤回enabled绑定或将bootstrap恢复无操作定义（不改环境与权限），成功前也不再次派发。代码不自行提升contents权限来解除武装。

operation_sha输入相等仅验证运行的是操作方指定的版本，不代表该输入自身不可篡改或已经批准；实际SHA由root在应用后的冻结diff独审与分支核验中批准，派发前后再次核对。
