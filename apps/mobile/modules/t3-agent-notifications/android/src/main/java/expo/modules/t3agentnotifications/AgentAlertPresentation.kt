package expo.modules.t3agentnotifications

import android.net.Uri
import android.util.JsonReader
import android.util.JsonToken
import java.io.StringReader

internal data class AgentAlertPresentation(val title: String, val body: String)

private enum class AlertPhase(
  val wire: String,
  val status: String,
  val chinese: String,
  val needsUser: Boolean
) {
  APPROVAL("waiting_for_approval", "Approval", "待审批", true),
  INPUT("waiting_for_input", "Input", "待输入", true),
  COMPLETED("completed", "Done", "已完成", false),
  FAILED("failed", "Failed", "失败", false)
}

private data class AlertRow(
  val environmentId: String,
  val threadId: String,
  val phase: AlertPhase
)

private data class AlertIdentity(val rows: List<AlertRow>, val grouped: Boolean)

internal fun agentAlertPresentation(
  data: Map<String, String>,
  strings: T3NativeStrings
): AgentAlertPresentation {
  val original = AgentAlertPresentation(data["alert_title"].orEmpty(), data["alert_body"].orEmpty())
  if (original.title.isBlank() || original.body.isBlank()) return original
  val identity = parseAlertIdentity(data["alert_id"] ?: return original) ?: return original
  if (!identity.grouped) {
    val row = identity.rows.single()
    val group = parseAlertGroup(data["alert_group"] ?: return original) ?: return original
    if (group != (row.environmentId to row.threadId)) return original
    val path = "/threads/${Uri.encode(row.environmentId)}/${Uri.encode(row.threadId)}"
    if (data["alert_path"] != path) return original
    val prefix = "${row.phase.status}: "
    if (!original.body.startsWith(prefix)) return original
    val project = original.body.substring(prefix.length)
    if (project.isBlank()) return original
    return original.copy(body = strings.text(original.body, "${row.phase.chinese}：$project"))
  }

  if (data.containsKey("alert_group") || data["alert_path"] != "/") return original
  val rows = identity.rows
  if (rows.map { it.environmentId to it.threadId }.distinct().size != rows.size) return original
  val needsUser = rows.first().phase.needsUser
  if (rows.any { it.phase.needsUser != needsUser }) return original
  val title = "${rows.size} agents ${if (needsUser) "need attention" else "finished"}"
  if (original.title != title) return original
  return original.copy(
    title = strings.text(
      title,
      if (needsUser) "${rows.size} 个智能体需要处理" else "${rows.size} 个智能体已结束"
    )
  )
}

// Only relay-generated alert identities authorize translating a template; user text stays opaque.
private fun parseAlertIdentity(value: String): AlertIdentity? = readAlertJson(value) { reader ->
  reader.beginArray()
  val grouped = reader.peek() == JsonToken.BEGIN_ARRAY
  val rows = if (grouped) {
    val result = mutableListOf<AlertRow>()
    while (reader.hasNext()) {
      check(result.size < 5)
      reader.beginArray()
      result.add(readAlertRow(reader))
      reader.endArray()
    }
    check(result.size >= 2)
    result
  } else {
    listOf(readAlertRow(reader))
  }
  reader.endArray()
  AlertIdentity(rows, grouped)
}

private fun readAlertRow(reader: JsonReader): AlertRow {
  val environmentId = readAlertString(reader)
  val threadId = readAlertString(reader)
  val phase = readAlertString(reader)
  readAlertString(reader) // updatedAt is part of the identity, not display copy.
  return AlertRow(
    environmentId,
    threadId,
    checkNotNull(AlertPhase.entries.firstOrNull { it.wire == phase })
  )
}

private fun parseAlertGroup(value: String): Pair<String, String>? = readAlertJson(value) { reader ->
  reader.beginArray()
  val group = readAlertString(reader) to readAlertString(reader)
  reader.endArray()
  group
}

private fun readAlertString(reader: JsonReader): String {
  check(reader.peek() == JsonToken.STRING)
  return reader.nextString().also { check(it.isNotBlank() && it == it.trim()) }
}

private fun <T> readAlertJson(value: String, read: (JsonReader) -> T): T? = try {
  JsonReader(StringReader(value)).use { reader ->
    reader.isLenient = false
    val result = read(reader)
    check(reader.peek() == JsonToken.END_DOCUMENT)
    result
  }
} catch (_: Exception) {
  null
}
