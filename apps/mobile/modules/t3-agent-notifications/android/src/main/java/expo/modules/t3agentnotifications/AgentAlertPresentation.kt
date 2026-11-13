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
  val identity = data["alert_id"]?.let(::parseAlertIdentity)
  return when {
    identity == null -> original
    identity.grouped -> groupedAlertPresentation(data, original, identity.rows, strings) ?: original
    else -> singleAlertPresentation(data, original, identity.rows.single(), strings) ?: original
  }
}

private fun singleAlertPresentation(
  data: Map<String, String>,
  original: AgentAlertPresentation,
  row: AlertRow,
  strings: T3NativeStrings
): AgentAlertPresentation? {
  val group = data["alert_group"]?.let(::parseAlertGroup)
  val path = "/threads/${Uri.encode(row.environmentId)}/${Uri.encode(row.threadId)}"
  val prefix = "${row.phase.status}: "
  val project = original.body.takeIf { it.startsWith(prefix) }?.substring(prefix.length)
  return if (
    group != (row.environmentId to row.threadId) || data["alert_path"] != path ||
    project.isNullOrBlank()
  ) {
    null
  } else {
    original.copy(body = strings.text(original.body, "${row.phase.chinese}：$project"))
  }
}

private fun groupedAlertPresentation(
  data: Map<String, String>,
  original: AgentAlertPresentation,
  rows: List<AlertRow>,
  strings: T3NativeStrings
): AgentAlertPresentation? {
  val needsUser = rows.first().phase.needsUser
  val title = "${rows.size} agents ${if (needsUser) "need attention" else "finished"}"
  return if (
    data.containsKey("alert_group") || data["alert_path"] != "/" ||
    rows.map { it.environmentId to it.threadId }.distinct().size != rows.size ||
    rows.any { it.phase.needsUser != needsUser } || original.title != title
  ) {
    null
  } else {
    original.copy(
      title = strings.text(
        title,
        if (needsUser) "${rows.size} 个智能体需要处理" else "${rows.size} 个智能体已结束"
      )
    )
  }
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
