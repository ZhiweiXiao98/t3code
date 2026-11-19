# 单接收者加密传输模块（尚未接入签名或工作流）

`encrypted_handoff.py` 是仅加密的 Python API，不是签名器或发布器。使用现有 `cryptography` 50.0.0，不安装新依赖。原拟用 GPG，但当前隔离环境禁止 gpg-agent 创建 socket，无法完成真实合成往返测试，故改用无 agent 的标准密码原语。

格式为版本化 JSON：RSA-OAEP（SHA-256/MGF1-SHA-256）封装随机 256 位内容密钥；AES-256-GCM 加密内容。版本、算法和收件指纹同时绑定 OAEP label 和 GCM AAD。使用一次性随机 96 位 nonce。收件 RSA 公钥至少 3072 位，只接受一份规范 SPKI PEM/DER。allowlist 必须恰有一个完整 SHA256 指纹（规范 DER SubjectPublicKeyInfo 的哈希），不是 OpenPGP 指纹，也不是 Android 签名证书指纹。必须从独立可信渠道确认该收件公钥/指纹，不可只信任同一传输中的公钥和自称指纹。

Python 使用方法（仅接口说明，不代表获准处理真实签名包）：

```python
from encrypted_handoff import encrypt_handoff
# payload: 调用方提供的 bytes；public_spki: 单一收件公钥 bytes。
# fingerprint: 经独立审核的 SPKI-SHA256；destination 必须是新文件。
proof = encrypt_handoff(payload, public_spki, destination,
                        allowed_fingerprints=[fingerprint])
```

没有读取环境凭据、用户配置、网络、签名私钥或收件私钥；不接受私钥输入，不提供解密 CLI。仅测试代码生成短生命周期、内存中的 synthetic 收件者，验证实际往返与篡改拒绝。没有真实身份或密钥写入仓库。

只在调用方控制的可信输出目录写 0600 密文临时文件，再独占创建最终文件。已有文件、已有/竞争 symlink 不覆盖。故障清理临时密文；模块从不写明文或私钥文件。Python 无法保证内存擦除，调用方原有明文文件不由模块删除，进程强杀/主机崩溃也不能保证清理；残留临时文件仅为密文。返回明文哈希属于关联元数据，不应自动公开。

GCM 提供密文完整性/篡改检测，不证明发送者身份，和 GPG MDC 一样不能冒充来源认证。任意拥有公钥的人都能生成合法密文。未来接收方必须先核对受信来源中的完整密文哈希、候选/签名来源和收件指纹，再完成 OAEP+GCM 全量验证后才释放明文；不得流式释放未认证内容。当前未实现生产解密、用户密钥管理、密文上传或自动激活。接入原签名身份、传输、真机测试及发布仍需独立审核和授权。
