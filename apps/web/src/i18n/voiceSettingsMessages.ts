import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const VOICE_SETTINGS_MESSAGES = {
  "Use existing": "使用现有模型",
  "Could not use a model from that path": "无法使用该路径中的模型",
  "Using your file at {path}": "正在使用位于 {path} 的本地文件",
  "Stop using your {name} file; the file stays on disk":
    "停止使用你的 {name} 文件；磁盘上的文件会保留",
  "Path to a model file or folder already on this environment":
    "此环境中已有的模型文件或文件夹路径",
  "Already downloaded elsewhere? Paste the model file or folder path":
    "已在其他位置下载？请粘贴模型文件或文件夹路径",

  "Microphone {number}": "麦克风 {number}",
  Recommended: "推荐",
  "A good default pick for the languages it covers.": "对于其支持的语言，这是一个不错的默认选择。",
  "Live preview": "实时预览",
  "Shows words in your draft as you speak, before the recording finishes.":
    "说话时即可在草稿中预览文字，无需等到录音结束。",
  Translate: "翻译",
  "Can write English text from speech in another language. Turn on Translate to English to use it.":
    "可将其他语言的语音转为英文文本。开启“翻译为英语”即可使用。",
  "Verifying download…": "正在验证下载…",
  Download: "下载",
  Selected: "已选择",
  "Use model": "使用模型",
  "Add words or phrases, separated by commas or line breaks": "添加词语或短语，用逗号或换行分隔",
  Add: "添加",
  Misspelling: "误识别写法",
  Alias: "别名",
  "Project dictionary": "项目词典",
  "Shared dictionary": "共享词典",
  "Saved on the environment and used in every project there, along with each person’s own dictionary. Pick a project above to limit these words to one project.":
    "保存在环境中，与每个人自己的词典一起用于该环境的所有项目。在上方选择项目，可将这些词语仅用于该项目。",
  entry: "条",
  entries: "条",
  "project dictionary": "项目词典",
  "shared dictionary": "共享词典",
  "Cleanup model not saved": "未能保存整理模型",
  "Cleanup model": "整理模型",
  "Model for transcript cleanup, such as a cheaper or faster one. When disabled, use the text generation model configured for this environment.":
    "用于整理转写文本的模型，例如更便宜或更快的模型。关闭后使用此环境配置的文本生成模型。",
  "Connect an environment first.": "请先连接一个环境。",
  "No text generation providers available.": "没有可用的文本生成提供商。",
  "Use a separate cleanup model": "使用独立的整理模型",
  "Could not load transcription models": "无法加载转写模型",
  Hardware: "硬件",
  "Auto uses the environment’s GPU when it has one.": "自动模式会在环境有 GPU 时使用 GPU。",
  "Could not change transcription hardware": "无法更改转写硬件",
  "Transcription hardware": "转写硬件",
  Auto: "自动",
  "Selected GPU": "已选 GPU",
  "Unload model": "卸载模型",
  "Release the model’s memory on the environment after it sits idle.":
    "模型闲置一段时间后，释放它在环境中占用的内存。",
  "Could not change when the model unloads": "无法更改模型卸载时间",
  "Smallest download": "下载体积最小",
  "Fastest transcription": "转写速度最快",
  Languages: "语言",
  "Search languages": "搜索语言",
  "Browse models by language": "按语言浏览模型",
  "All languages": "所有语言",
  "No languages match.": "没有匹配的语言。",
  "All models": "所有模型",
  "Search transcription models": "搜索转写模型",
  "Search models": "搜索模型",
  "Sort by": "排序方式",
  "Downloaded only": "仅显示已下载",
  "Transcription models": "转写模型",
  "No models match.": "没有匹配的模型。",
  "Could not download the model": "无法下载模型",
  "Could not select the model": "无法选择模型",
  "Could not cancel the download": "无法取消下载",
  "Could not delete the model": "无法删除模型",
  "Test model": "测试模型",
  "Waiting for the environment to connect": "正在等待环境连接",
  "Say a sentence in the language above. Cleanup is skipped, so you see exactly what the model heard. The transcript stays on this page.":
    "用上方所选语言说一句话。测试会跳过整理步骤，让你直接查看模型的识别结果。转写文本仅保留在此页面。",
  "Close model test": "关闭模型测试",
  "Test transcript": "测试转写文本",
  "No speech recognized. Try again.": "未识别到语音，请重试。",
  "Selected microphone (unavailable)": "所选麦克风（不可用）",
  "System default": "系统默认",
  "Manage OpenRouter": "管理 OpenRouter",
  "Manage key": "管理密钥",
  Input: "输入",
  Microphone: "麦克风",
  "System default follows your operating system. Record a ten-second test and play it back here. Test audio stays on this device and is never transcribed.":
    "系统默认会跟随操作系统设置。录制一段十秒的测试音频并在此回放。测试音频仅保留在此设备上，不会被转写。",
  "Refresh microphones": "刷新麦克风",
  "Dictation shortcut": "听写快捷键",
  "How the dictation shortcut starts and stops recording.": "设置听写快捷键如何开始和停止录音。",
  "Dictation shortcut mode": "听写快捷键模式",
  Transcription: "转写",
  "Transcribe with": "转写方式",
  Use: "使用",
  "Chosen environment (unavailable)": "所选环境（不可用）",
  Off: "关闭",
  "unavailable environment": "不可用的环境",
  "On an environment": "在环境上",
  Language: "语言",
  "The cloud provider can detect your language automatically.": "云端提供商可以自动检测你的语言。",
  "Choose an environment above to see the languages its transcription model supports.":
    "在上方选择环境，查看其转写模型支持的语言。",
  "Translate to English": "翻译为英语",
  "Speak any language and get English text.": "说任意语言，生成英文文本。",
  "Transcription options": "转写选项",
  "Silence filtering": "静音过滤",
  "OpenAI handles silence automatically.": "OpenAI 会自动处理静音。",
  "Skip silence and other non-speech audio before transcription, keeping a short buffer so words aren’t cut off.":
    "转写前跳过静音和其他非语音音频，同时保留短暂缓冲，避免截断词语。",
  "Remove filler words": "移除语气词",
  "Remove filler words like “um” and “uh” from transcripts.":
    "从转写文本中移除“um”和“uh”等语气词。",
  Dictionary: "词典",
  "Names and terms transcription should spell your way, saved on this device. Add an alias when it keeps hearing a term wrong. The name of the project you dictate in is also sent as a hint.":
    "保存在此设备上的名称和术语，转写时会按你的写法使用。若某个词总是识别错误，可添加别名。当前听写所在项目的名称也会作为提示发送。",
  dictionary: "词典",
  Cleanup: "整理",
  "Clean up transcripts": "整理转写文本",
  "Fixes punctuation, numbers, and spoken corrections with the cleanup model on the draft’s environment. Sends the transcript and nearby draft text, never audio.":
    "使用草稿所在环境的整理模型修正标点、数字和口头更正。会发送转写文本及其附近的草稿文本，不会发送音频。",
  "Cleanup instructions": "整理指令",
  "Use the built-in instructions or write your own.": "使用内置指令，或自行编写。",
  Custom: "自定义",
  "Built-in": "内置",
  "Custom cleanup instructions": "自定义整理指令",
  "Correction cue": "更正提示词",
  "The word or phrase you say to flag a correction, like “sorry” or “scratch that”. Cleanup applies the correction only where one is meant, and hears the cue as a hint.":
    "用来表示更正的词语或短语，例如“sorry”或“scratch that”。整理时会将其视为提示，仅在确实需要更正的位置进行修改。",
  "Auto: press to toggle, hold to record": "自动：按一下切换，按住录音",
  "Hold: record while held": "按住：按住期间录音",
  "Toggle: press to start, press again to stop": "切换：按一下开始，再按一下停止",
  Never: "从不",
  Immediately: "立即",
  "After 2 minutes": "2 分钟后",
  "After 5 minutes": "5 分钟后",
  "After 10 minutes": "10 分钟后",
  "After 15 minutes": "15 分钟后",
  "After 1 hour": "1 小时后",
  "Auto-detect": "自动检测",
  "Transcription language": "转写语言",
  "OpenRouter model": "OpenRouter 模型",
  "No transcription model matches.": "没有匹配的转写模型。",
  "Couldn’t save this change. Check your connection and try again.":
    "无法保存此更改。请检查连接后重试。",
  "Replace API key": "替换 API 密钥",
  "API key": "API 密钥",
  "Enter API key": "输入 API 密钥",
  "Enter an API key, not a URL or secret reference.": "请输入 API 密钥，而不是网址或密钥引用。",
  "Updating the key keeps dictation enabled.": "更新密钥后，听写仍会保持启用。",
  "Leave blank to keep the saved key.": "留空以保留已保存的密钥。",
  "Manage OpenRouter dictation": "管理 OpenRouter 听写",
  "Retry loading API key": "重新加载 API 密钥",
  "Checking for an API key…": "正在检查 API 密钥…",
  Model: "模型",
  "Retry loading models": "重新加载模型",
  "Loading transcription models…": "正在加载转写模型…",
  "This choice applies only to this device. Choose Off to stop sharing.":
    "此选择仅适用于此设备。选择“关闭”可停止共享。",
  "Remove key…": "移除密钥…",
  Cancel: "取消",
  "Remove key": "移除密钥",
  Save: "保存",
  "Save and enable": "保存并启用",
  "Save key": "保存密钥",
  "Test microphone": "测试麦克风",
  "Cancel microphone test": "取消麦克风测试",
  "Recording time": "录音时长",
  "Microphone input level": "麦克风输入音量",
  "Opening microphone…": "正在开启麦克风…",
  "Stop recording": "停止录音",
  "Pause recording": "暂停播放录音",
  "Play recording": "播放录音",
  "Recording playback position": "录音播放位置",
  "Record again": "重新录音",
  Done: "完成",
  "Could not play this recording. Try recording again.": "无法播放此录音，请重新录制。",
  "not benchmarked": "未测试",
  "update server": "请更新服务器",
  "Speed:": "速度：",
  "{count} languages": "{count} 种语言",
  "{name} download progress": "{name} 下载进度",
  "{progress}% downloaded": "已下载 {progress}%",
  "Cancel {name} download": "取消下载 {name}",
  "Delete {name}": "删除 {name}",
  "Add a word or phrase to the {dictionary}": "向{dictionary}添加词语或短语",
  "{dictionary} entries": "{dictionary}条目",
  "Alias for {term}": "{term} 的别名",
  "Add an alias for {term}": "为 {term} 添加别名",
  "Remove {term}": "移除 {term}",
  "Saved with {project} on its environment. Everyone who dictates in this project gets these spellings, along with their own dictionary. Project spellings win when the two overlap.":
    "与 {project} 一同保存在其环境中。在此项目中听写的每个人都会同时使用这些写法和自己的词典。若两者重叠，以项目中的写法为准。",
  "Best {language} accuracy": "{language}准确率最高",
  "This environment can’t transcribe audio: {reason}.": "此环境无法转写音频：{reason}。",
  "Pick languages to see models that support all of them. Accuracy is word or character error rate: lower is better. Speed is the time to transcribe 30 seconds of audio on Handy’s benchmark {hardware}.":
    "选择语言，查看同时支持这些语言的模型。准确率以词语或字符错误率表示，越低越好。速度表示在 Handy 基准测试的 {hardware} 上转写 30 秒音频所需的时间。",
  "Models for {languages}": "支持{languages}的模型",
  "Sort and filter models: {sort}{filter}": "模型排序与筛选：{sort}{filter}",
  ", downloaded only": "，仅显示已下载",
  " via {environment}": "，经由 {environment}",
  "Cloud via {environment}": "经由 {environment} 的云端服务",
  "{provider} via {environment}": "{provider}，经由 {environment}",
  "{environment} can’t transcribe audio locally. Choose a different destination.":
    "{environment} 无法在本地转写音频。请选择其他转写目标。",
  "{model} detects the language automatically.": "{model} 会自动检测语言。",
  "{model} uses one fixed language.": "{model} 使用一种固定语言。",
  "{language} unavailable": "{language}不可用",
  "Auto ({language})": "自动（{language}）",
  "{effective} ({unavailable})": "{effective}（{unavailable}）",
  "OpenRouter no longer lists {model}. Dictation stays off until you choose another model.":
    "OpenRouter 已不再列出 {model}。在选择其他模型前，听写会保持关闭。",
  "{company} API key": "{company} API 密钥",
  "{company} API key reference": "{company} API 密钥引用",
  "Anyone with dictation access to {environment} can bill this key.":
    "任何拥有 {environment} 听写权限的人都可使用此密钥并产生费用。",
  "Remove the {company} key?": "移除 {company} 密钥？",
  "Manage {company} key": "管理 {company} 密钥",
  "Use {provider} for dictation?": "使用 {provider} 进行听写？",
  "Everyone using {provider} for dictation on {environment} will lose access.":
    "所有在 {environment} 上使用 {provider} 听写的人都将失去访问权限。",
  "Anyone with dictation access to {environment} can use this API key.":
    "任何拥有 {environment} 听写权限的人都可使用此 API 密钥。",
  "Connect to {environment} with dictation access to continue.":
    "请以听写权限连接到 {environment} 后继续。",
  "Update {environment} to use OpenRouter dictation.":
    "请更新 {environment} 以使用 OpenRouter 听写。",
  "Ask an administrator on {environment} to add an API key.":
    "请让 {environment} 的管理员添加 API 密钥。",
  "Uses the API key saved on {environment}. This choice applies only to this device.":
    "使用保存在 {environment} 上的 API 密钥。此选择仅适用于此设备。",
  "Use {provider}": "使用 {provider}",
  "After you stop, {environment} sends the recording to OpenRouter. OpenRouter chooses who runs your model. T3 requests zero data retention; your OpenRouter account may allow safety retention.":
    "停止录音后，{environment} 会将录音发送给 OpenRouter。OpenRouter 会选择运行模型的服务方。T3 请求零数据留存；你的 OpenRouter 账户可能允许出于安全目的保留数据。",
  "After you stop, {environment} sends your recording and vocabulary hints, including project names, to {company}.":
    "停止录音后，{environment} 会将录音和词汇提示（包括项目名称）发送给 {company}。",
  "{percent}% error)": "{percent}% 错误率)",
} as const;

export type VoiceSettingsMessageKey = keyof typeof VOICE_SETTINGS_MESSAGES;
type Values = Readonly<Record<string, string | number>>;

export function translateVoiceSettingsMessage(
  locale: ResolvedAppLocale,
  source: VoiceSettingsMessageKey,
  values: Values = {},
): string {
  const template = locale === "zh-CN" ? VOICE_SETTINGS_MESSAGES[source] : source;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}

const SPEECH_MODEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "Best all-around choice for English dictation": "英语听写的综合首选",
  "Fast and accurate transcription in many European languages": "可快速、准确地转写多种欧洲语言",
  "Tiny, fast, and runs well on any hardware": "体积小、速度快，可在各种硬件上流畅运行",
  "Consistently strong in many languages, best for Greek and Polish":
    "多种语言表现稳定，尤其适合希腊语和波兰语",
  "Broadest language support, but may run a bit slow": "支持的语言最广，但运行速度可能稍慢",
  "Multilingual, very accurate in Italian and Spanish. Best on Apple Silicon or discrete GPUs":
    "支持多语言，意大利语和西班牙语准确率很高。最适合 Apple Silicon 或独立 GPU",
  "Best accuracy across 25 European languages": "在 25 种欧洲语言中准确率最佳",
  "Fast and accurate, great overall multilingual pick": "快速准确，是多语言转写的优秀综合选择",
  "Excellent English only model, runs on any hardware": "优秀的英语专用模型，可在各种硬件上运行",
  "Best for Chinese, Cantonese, and Asian languages with English":
    "最适合中文、粤语，以及与英语混用的亚洲语言",
  "Best for Japanese, good at Thai, Indonesian, Malay":
    "最适合日语，泰语、印尼语和马来语表现也不错",
  "Most accurate small model for European languages": "欧洲语言准确率最高的小型模型",
  "Very accurate English. Slow without a GPU.": "英语准确率很高。没有 GPU 时速度较慢。",
  "Best for Arabic and Arabic/English speakers": "最适合阿拉伯语及阿拉伯语与英语混用的使用者",
  "Good for Mandarin, English, Japanese": "适合普通话、英语和日语",
  "Russian only.": "仅支持俄语。",
  "Best for Russian dictation. English may be unreliable.": "最适合俄语听写。英语识别可能不可靠。",
  "Extremely fast English transcription, best on GPU": "英语转写速度极快，最适合在 GPU 上运行",
  "Accurate with translation support. Best with GPU": "准确且支持翻译，最适合搭配 GPU",
  "For clinicians dictating notes. Poor on general speech":
    "适合临床医生口述笔记。一般语音表现较差",
  "Tiny English model, virtually instant even on CPU": "微型英语模型，即使使用 CPU 也几乎即时完成",
  "For overlapping speakers in meetings, not for solo dictation":
    "适合会议中多人同时讲话，不适合单人听写",
  "Top accuracy across languages. Best on Apple Silicon or a GPU":
    "跨语言准确率出色，最适合 Apple Silicon 或 GPU",
  "Instant Mandarin, Japanese, Korean on any machine. Weak Cantonese":
    "普通话、日语和韩语在各种设备上均可即时转写，粤语表现较弱",
  "Accurate with translation support. Best on Apple Silicon or a GPU.":
    "准确且支持翻译。最适合 Apple Silicon 或 GPU。",
  "Wide language support in a relatively small model.": "体积相对较小，支持多种语言。",
  "Accurate in many languages. Slow without a GPU": "多种语言准确率较高，没有 GPU 时速度较慢",
  "Taiwan Mandarin with English mixed in. Traditional script, no punctuation":
    "支持台湾普通话与英语混用，输出繁体字，不含标点",
  "Most languages at usable accuracy. Best on Apple Silicon or a GPU.":
    "多数语言准确率可用。最适合 Apple Silicon 或 GPU。",
  "Canary 1B Flash speech-to-text.": "Canary 1B Flash 语音转文字。",
  "GigaAM v3 CTC speech-to-text.": "GigaAM v3 CTC 语音转文字。",
  "GigaAM v3 RNN-T speech-to-text.": "GigaAM v3 RNN-T 语音转文字。",
  "Granite Speech 4.0 1B speech-to-text.": "Granite Speech 4.0 1B 语音转文字。",
  "Granite Speech 4.1 2B NAR speech-to-text.": "Granite Speech 4.1 2B NAR 语音转文字。",
  "Granite Speech 4.1 2B Plus speech-to-text.": "Granite Speech 4.1 2B Plus 语音转文字。",
  "Moonshine Base speech-to-text.": "Moonshine Base 语音转文字。",
  "Moonshine Streaming Medium speech-to-text.": "Moonshine Streaming Medium 语音转文字。",
  "Moonshine Streaming Small speech-to-text.": "Moonshine Streaming Small 语音转文字。",
  "Moonshine Streaming Tiny speech-to-text.": "Moonshine Streaming Tiny 语音转文字。",
  "Moonshine Tiny speech-to-text.": "Moonshine Tiny 语音转文字。",
  "MOSS Transcribe Diarize speech-to-text.": "MOSS Transcribe Diarize 语音转文字。",
  "Nemotron Speech Streaming English 0.6B speech-to-text.":
    "Nemotron Speech Streaming English 0.6B 语音转文字。",
  "Orukeet speech-to-text.": "Orukeet 语音转文字。",
  "Parakeet CTC 0.6B speech-to-text.": "Parakeet CTC 0.6B 语音转文字。",
  "Parakeet CTC 1.1B speech-to-text.": "Parakeet CTC 1.1B 语音转文字。",
  "Parakeet Primeline speech-to-text.": "Parakeet Primeline 语音转文字。",
  "Parakeet RNN-T 0.6B speech-to-text.": "Parakeet RNN-T 0.6B 语音转文字。",
  "Parakeet RNN-T 1.1B speech-to-text.": "Parakeet RNN-T 1.1B 语音转文字。",
  "Parakeet TDT-CTC 1.1B speech-to-text.": "Parakeet TDT-CTC 1.1B 语音转文字。",
  "Parakeet TDT 1.1B speech-to-text.": "Parakeet TDT 1.1B 语音转文字。",
  "Voxtral Small 24B speech-to-text.": "Voxtral Small 24B 语音转文字。",
  "Whisper Base speech-to-text.": "Whisper Base 语音转文字。",
  "Whisper Base English speech-to-text.": "Whisper Base English 语音转文字。",
  "Whisper Large v1 speech-to-text.": "Whisper Large v1 语音转文字。",
  "Whisper Large v2 speech-to-text.": "Whisper Large v2 语音转文字。",
  "Whisper Medium English speech-to-text.": "Whisper Medium English 语音转文字。",
  "Whisper Small English speech-to-text.": "Whisper Small English 语音转文字。",
  "Whisper Tiny speech-to-text.": "Whisper Tiny 语音转文字。",
  "Whisper Tiny English speech-to-text.": "Whisper Tiny English 语音转文字。",
};

const VOICE_INPUT_ERRORS: Readonly<Record<string, string>> = {
  "Microphone testing is unavailable in this browser. Use HTTPS or the desktop app.":
    "此浏览器无法测试麦克风。请使用 HTTPS 或桌面应用。",
  "No audio was recorded. Try again.": "未录制到音频，请重试。",
  "Could not record microphone audio. Try again.": "无法录制麦克风音频，请重试。",
  "The microphone disconnected.": "麦克风已断开连接。",
  "Could not access the microphone.": "无法访问麦克风。",
  "Microphone access is required for voice input. Allow access in your browser or system settings and try again.":
    "语音输入需要麦克风权限。请在浏览器或系统设置中允许访问后重试。",
  "Microphone access is required for voice input.": "语音输入需要麦克风权限。",
  "This draft is no longer available.": "此草稿已不可用。",
  "Another voice recording is already active.": "已有其他语音录音正在进行。",
  "Voice transcription is not available.": "语音转写不可用。",
  "Voice transcription is still finishing. Try again shortly.": "语音转写尚未完成，请稍后重试。",
  "Voice transcription is not available for this language.": "此语言不支持语音转写。",
  "Could not prepare voice transcription.": "无法准备语音转写。",
  "Could not start voice recording.": "无法开始语音录音。",
  "Voice recording was interrupted.": "语音录音已中断。",
  "Could not finish voice recording.": "无法完成语音录音。",
  "Could not transcribe this recording.": "无法转写此录音。",
  "Voice transcription on this environment failed.": "此环境上的语音转写失败。",
  "The draft changed while voice input was running. The transcript was not added.":
    "语音输入期间草稿已更改，转写文本未添加。",
  "No speech was detected.": "未检测到语音。",
  "Microphone processing failed.": "麦克风处理失败。",
  "Voice input failed": "语音输入失败",
};

/** Only known catalog descriptions are translated; external text remains verbatim. */
export function translateVoiceSettingsSource(locale: ResolvedAppLocale, source: string): string {
  return locale === "zh-CN" && Object.hasOwn(SPEECH_MODEL_DESCRIPTIONS, source)
    ? SPEECH_MODEL_DESCRIPTIONS[source]!
    : source;
}

/** Preserve raw error codes for classification; localize only their displayed message. */
export function translateVoiceSettingsError(locale: ResolvedAppLocale, source: string): string {
  return locale === "zh-CN" && Object.hasOwn(VOICE_INPUT_ERRORS, source)
    ? VOICE_INPUT_ERRORS[source]!
    : source;
}
