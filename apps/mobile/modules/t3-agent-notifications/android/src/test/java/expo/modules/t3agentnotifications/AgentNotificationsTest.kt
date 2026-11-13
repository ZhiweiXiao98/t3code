package expo.modules.t3agentnotifications

import android.app.Activity
import android.app.AlarmManager
import android.app.Application
import android.app.NotificationChannel
import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ProcessLifecycleOwner
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

abstract class AgentNotificationsFixture {
  protected lateinit var context: Application
  protected lateinit var manager: NotificationManager
  protected lateinit var lifecycle: LifecycleRegistry

  @Before
  fun setUp() {
    context = RuntimeEnvironment.getApplication()
    manager = context.getSystemService(NotificationManager::class.java)
    shadowOf(manager).setNotificationsEnabled(true)
    lifecycle = ProcessLifecycleOwner.get().lifecycle as LifecycleRegistry
    lifecycle.currentState = Lifecycle.State.CREATED

    val launcher = ComponentName(context, Activity::class.java)
    shadowOf(context.packageManager).addActivityIfNotPresent(launcher)
    shadowOf(context.packageManager).addIntentFilterForActivity(
      launcher,
      IntentFilter(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
    )
    AgentNotifications.clear(context)
    AgentNotifications.configure(context, "device", "user", "t3code-dev", true)
    AgentNotifications.setThreadOnScreen("/threads/environment/thread")
  }

  protected fun update(alertId: String, active: Boolean) = mapOf(
    "device_id" to "device",
    "user_id" to "user",
    "updated_at" to System.currentTimeMillis().toString(),
    "active" to active.toString(),
    "activity_title" to "1 active agent",
    "activity_body" to "Test thread · Working",
    "activity_path" to "/threads/environment/thread",
    "alert_id" to alertId,
    "alert_group" to "environment/thread",
    "alert_title" to "Test thread",
    "alert_body" to "Done: Test project",
    "alert_path" to "/threads/environment/thread",
  )
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 26, 33, 36], manifest = Config.NONE)
class AgentAlertPresentationTest : AgentNotificationsFixture() {
  private fun row(
    phase: String = "completed",
    threadId: String = "thread",
    environmentId: String = "environment",
    updatedAt: String = "2026-11-13T00:00:00.000Z"
  ) = listOf(environmentId, threadId, phase, updatedAt)

  private fun single(identity: List<String> = row(), status: String = "Done") = mapOf(
    "alert_id" to JSONArray(identity).toString(),
    "alert_group" to JSONArray(identity.take(2)).toString(),
    "alert_title" to "2 agents finished",
    "alert_body" to "$status: Done: 用户项目, Input",
    "alert_path" to "/threads/${Uri.encode(identity[0])}/${Uri.encode(identity[1])}",
  )

  private fun grouped(rows: List<List<String>>, attention: Boolean = false) = mapOf(
    "alert_id" to JSONArray(rows.map { JSONArray(it) }).toString(),
    "alert_title" to "${rows.size} agents ${if (attention) "need attention" else "finished"}",
    "alert_body" to "Done: 用户会话, 2 agents finished, Approval",
    "alert_path" to "/",
  )

  private fun assertUnchanged(data: Map<String, String>) {
    assertEquals(
      data.toString(),
      AgentAlertPresentation(data["alert_title"].orEmpty(), data["alert_body"].orEmpty()),
      agentAlertPresentation(data, T3NativeStrings("zh-CN"))
    )
  }

  @Test
  fun singleAlertsTranslateOnlyTheirVerifiedStatusPrefix() {
    val phases = listOf(
      Triple("waiting_for_approval", "Approval", "待审批"),
      Triple("waiting_for_input", "Input", "待输入"),
      Triple("completed", "Done", "已完成"),
      Triple("failed", "Failed", "失败"),
    )
    for ((phase, status, chinese) in phases) {
      val data = single(row(phase, "thread/中文", "env:one"), status)
      val snapshot = data.toMap()
      for (locale in listOf(null, "en", "zh-TW", "zh-CN")) {
        val presentation = agentAlertPresentation(data, T3NativeStrings(locale))
        assertEquals(data["alert_title"], presentation.title)
        assertEquals(
          if (locale == "zh-CN") "$chinese：Done: 用户项目, Input" else data["alert_body"],
          presentation.body
        )
      }
      assertEquals(snapshot, data)
    }
    val whitespace = single() + ("alert_body" to "Done:  Done: project\n用户 ")
    assertEquals(
      "已完成： Done: project\n用户 ",
      agentAlertPresentation(whitespace, T3NativeStrings("zh-CN")).body
    )
  }

  @Test
  fun groupedAlertsTranslateOnlyTheMatchingCountAndPhaseFamily() {
    val cases = listOf(
      listOf(row("waiting_for_approval"), row("waiting_for_input", "second")) to true,
      listOf(row("completed"), row("failed", "second")) to false,
      (1..5).map { row("completed", "thread-$it") } to false,
    )
    for ((rows, attention) in cases) {
      for (ordered in listOf(rows, rows.reversed())) {
        val data = grouped(ordered, attention)
        for (locale in listOf(null, "en", "zh-TW", "zh-CN")) {
          val presentation = agentAlertPresentation(data, T3NativeStrings(locale))
          assertEquals(
            if (locale != "zh-CN") {
              data["alert_title"]
            } else {
              "${rows.size} 个智能体${if (attention) "需要处理" else "已结束"}"
            },
            presentation.title
          )
          assertEquals(data["alert_body"], presentation.body)
        }
      }
    }
  }

  @Test
  fun legacyMalformedAndUnknownIdentitiesNeverAuthorizeTranslation() {
    val data = single()
    val invalidIds = listOf(
      "legacy-alert-id",
      "null",
      "{}",
      "[]",
      "[\"environment\",\"thread\",\"completed\"]",
      "[\"environment\",\"thread\",\"completed\",\"time\",\"extra\"]",
      "[\"environment\",\"thread\",\"completed\",123]",
      "[\"environment\",\"thread\",\"completed\",null]",
      "[\"environment\",\"thread\",\"completed\",true]",
      "[environment,thread,completed,time]",
      "['environment','thread','completed','time']",
      "[\"environment\",\"thread\",\"completed\",\"time\",]",
      "/* comment */${data.getValue("alert_id")}",
      "${data.getValue("alert_id")} garbage",
      JSONArray(row("running")).toString(),
      JSONArray(row("starting")).toString(),
      JSONArray(row("stale")).toString(),
      JSONArray(row("unknown")).toString(),
      JSONArray(row(updatedAt = "")).toString(),
      JSONArray(row(updatedAt = " ")).toString(),
      JSONArray(row(environmentId = " environment")).toString(),
      JSONArray(row(threadId = "")).toString(),
    )
    for (id in invalidIds) assertUnchanged(data + ("alert_id" to id))
    for (key in listOf("alert_id", "alert_group", "alert_path", "alert_title", "alert_body")) {
      assertUnchanged(data - key)
    }
    val invalidGroups = listOf(
      "environment/thread",
      "[\"other\",\"thread\"]",
      "[\"environment\",123]",
      "[\"environment\",\"thread\",\"extra\"]",
      "${data.getValue("alert_group")} garbage",
    )
    for (group in invalidGroups) {
      assertUnchanged(data + ("alert_group" to group))
    }
    val invalidPaths = listOf(
      "/",
      "/threads/environment/other",
      "/threads/environment/thread?x=1",
      "/threads/environment/thread#fragment",
      "//threads/environment/thread",
      "/threads/environment/thread/",
      "t3code://threads/environment/thread",
    )
    for (path in invalidPaths) {
      assertUnchanged(data + ("alert_path" to path))
    }
    val invalidBodies = listOf(
      "Done",
      "Done:",
      "Done: ",
      "Done...",
      "Failed: project",
      "User: Done: project"
    )
    for (body in invalidBodies) {
      assertUnchanged(data + ("alert_body" to body))
    }
  }

  @Test
  fun conflictingOrTruncatedGroupsKeepTheirOriginalTitleAndUserBody() {
    val rows = listOf(row(), row("failed", "second"))
    val data = grouped(rows)
    val invalidRows = listOf(
      emptyList(),
      listOf(row()),
      listOf(row(), row("failed")),
      listOf(row(), row("waiting_for_input", "second")),
      listOf(row(), row("unknown", "second")),
      listOf(row(), listOf("environment", "second", "completed")),
      (1..6).map { row("completed", "thread-$it") },
    )
    for (invalid in invalidRows) {
      assertUnchanged(data + ("alert_id" to JSONArray(invalid.map { JSONArray(it) }).toString()))
    }
    val invalidTitles = listOf(
      "3 agents finished",
      "2 agents need attention",
      "2 agents finish...",
      "2 agents finished ",
      "My 2 agents finished",
      "2 个智能体已结束",
    )
    for (title in invalidTitles) {
      assertUnchanged(data + ("alert_title" to title))
    }
    for (group in listOf("", "[]", "[\"environment\",\"thread\"]")) {
      assertUnchanged(data + ("alert_group" to group))
    }
    assertUnchanged(data - "alert_path")
    assertUnchanged(data + ("alert_path" to "/threads/environment/thread"))
    assertUnchanged(data + ("alert_path" to "/?query=1"))
    val aggregateFields = mapOf(
      "activity_phase" to "waiting_for_approval",
      "activity_count" to "5",
      "activity_line_0" to "Approval\tUnrelated thread\tUnrelated project",
    )
    assertEquals(
      agentAlertPresentation(data, T3NativeStrings("zh-CN")),
      agentAlertPresentation(data + aggregateFields, T3NativeStrings("zh-CN"))
    )
  }

  @Test
  fun localizedPostsKeepTheirWireIdentityGroupingLinksAndRetryHistory() {
    val applicationInfo = requireNotNull(
      shadowOf(context.packageManager).getInternalMutablePackageInfo(context.packageName)
        .applicationInfo
    )
    applicationInfo.metaData = Bundle(applicationInfo.metaData ?: Bundle()).apply {
      putString("T3AppLocale", "zh-CN")
    }
    assertEquals(
      "zh-CN",
      context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA
      ).metaData?.getString("T3AppLocale")
    )
    val first = update("unused", false) + single()
    val second = update("unused", false) + single(row(updatedAt = "2026-11-13T00:01:00.000Z"))
    AgentNotifications.receive(context, first)
    AgentNotifications.receive(context, second)
    AgentNotifications.receive(context, second + ("alert_body" to "Retry must not replace text"))

    val children = manager.activeNotifications.filter { it.tag == "t3-agent-alert" }
    assertEquals(
      setOf(first.getValue("alert_id").hashCode(), second.getValue("alert_id").hashCode()),
      children.map { it.id }.toSet()
    )
    for (child in children) {
      assertEquals(first["alert_group"], child.notification.group)
      assertEquals(
        first["alert_title"],
        child.notification.extras.getString(Notification.EXTRA_TITLE)
      )
      assertEquals(
        "已完成：Done: 用户项目, Input",
        child.notification.extras.getString(Notification.EXTRA_BIG_TEXT)
      )
      assertEquals(
        "t3code-dev://threads/environment/thread",
        shadowOf(child.notification.contentIntent).savedIntent.dataString
      )
    }
    val summary = manager.activeNotifications.single { it.tag != "t3-agent-alert" }
    assertEquals(
      "已完成：Done: 用户项目, Input",
      summary.notification.extras.getString(Notification.EXTRA_TEXT)
    )
    assertEquals(null, summary.notification.sound)
    assertEquals(
      listOf(first.getValue("alert_id"), second.getValue("alert_id")).joinToString("\n"),
      context.getSharedPreferences("t3-agent-notifications", 0).getString("seenAlertsOrdered", null)
    )
    val aggregate = grouped(listOf(row(), row("failed", "second")))
    AgentNotifications.receive(
      context,
      update("unused", false).filterKeys { !it.startsWith("alert_") } + aggregate
    )
    val aggregateAlert = manager.activeNotifications.single {
      it.tag == "t3-agent-alert" && it.id == aggregate.getValue("alert_id").hashCode()
    }
    assertEquals(
      "2 个智能体已结束",
      aggregateAlert.notification.extras.getString(Notification.EXTRA_TITLE)
    )
    assertEquals(
      aggregate["alert_body"],
      aggregateAlert.notification.extras.getString(Notification.EXTRA_BIG_TEXT)
    )
    assertEquals("t3-agent-alert", aggregateAlert.notification.group)
    assertEquals(
      "t3code-dev://",
      shadowOf(aggregateAlert.notification.contentIntent).savedIntent.dataString
    )
  }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 26, 33, 36], manifest = Config.NONE)
class AgentNotificationsTest : AgentNotificationsFixture() {
  @Test
  fun localizedPresentationPreservesWireStatesAndUserText() {
    val data = mapOf(
      "activity_line_0" to "Approval\tWorking\tDone",
      "activity_line_1" to "Done\tInput\tDone",
      "activity_phase" to "waiting_for_approval",
    )
    for (locale in listOf(null, "en", "zh-TW", "zh-CN")) {
      val chinese = locale == "zh-CN"
      val presentation = ActivityPresentation(data, true, T3NativeStrings(locale))
      assertEquals(ActivityPhase.APPROVAL, presentation.phase)
      assertEquals(if (chinese) "1 项需要处理" else "1 needs you", presentation.summary)
      assertEquals(if (chinese) "审批" else "Approve", presentation.action)
      val builder = NotificationCompat.Builder(context, "test")
      presentation.applyTo(builder, context)
      val card = builder.build()
      assertEquals(
        if (chinese) "待审批 Working\n已完成 Input" else "Approval Working\nDone Input",
        card.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
      )
      assertEquals(
        if (chinese) "Done · 1 项活跃" else "Done · 1 active",
        card.extras.getString(Notification.EXTRA_SUB_TEXT)
      )
      assertEquals("Approval", activityRows(data).first().status)
      val unknown = ActivityPresentation(
        mapOf("activity_line_0" to "Custom status\tWorking\tDone"),
        true,
        T3NativeStrings(locale)
      )
      val unknownBuilder = NotificationCompat.Builder(context, "test")
      unknown.applyTo(unknownBuilder, context)
      assertEquals("Working", unknown.summary)
      assertEquals(
        "Custom status Done",
        unknownBuilder.build().extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
      )
    }
  }

  @Test
  fun alertHistoryEvictsOnlyTheOldestEntryAfterCapacity() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    for (id in 0..64) AgentNotifications.receive(context, update("alert-$id", false))
    lifecycle.currentState = Lifecycle.State.CREATED
    for (id in 1..64) AgentNotifications.receive(context, update("alert-$id", false))
    assertTrue(manager.activeNotifications.isEmpty())
    AgentNotifications.receive(context, update("alert-0", false))
    assertEquals("alert-0".hashCode(), manager.activeNotifications.single().id)
  }

  @Test
  fun alertsStackByThreadGroup() {
    AgentNotifications.receive(context, update("grouped", false))
    assertEquals("environment/thread", manager.activeNotifications.single().notification.group)
  }

  @Test
  fun missingLauncherDoesNotDiscardTheAlert() {
    shadowOf(context.packageManager).removeActivity(ComponentName(context, Activity::class.java))
    AgentNotifications.receive(context, update("no-launcher", false))
    assertEquals(
      "Test thread",
      manager.activeNotifications.single().notification.extras.getString(Notification.EXTRA_TITLE)
    )
  }

  @Test
  fun foregroundAlertsForThreadsThatAreNotOnScreen() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.setThreadOnScreen("/threads/environment/other")
    AgentNotifications.receive(context, update("elsewhere", false))
    assertEquals("t3-agent-alert", manager.activeNotifications.single().tag)
  }

  @Test
  fun foregroundSuppressesAlertsWhileOngoingActivityStillUpdatesAndClears() {
    lifecycle.currentState = Lifecycle.State.RESUMED

    AgentNotifications.receive(context, update("attention", true))

    val ongoing = manager.activeNotifications.single()
    assertEquals("t3-agent-activity", ongoing.tag)
    assertEquals("1 active agent", ongoing.notification.extras.getString(Notification.EXTRA_TITLE))
    assertTrue(ongoing.notification.flags and Notification.FLAG_ONGOING_EVENT != 0)

    AgentNotifications.receive(context, update("completion", false))

    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun retryOfForegroundSuppressedAlertDoesNotAppearAfterBackgrounding() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val suppressed = update("foreground-completion", false)
    AgentNotifications.receive(context, suppressed)
    lifecycle.currentState = Lifecycle.State.CREATED

    AgentNotifications.receive(context, suppressed)

    assertTrue(manager.activeNotifications.isEmpty())

    AgentNotifications.receive(context, update("later-background-completion", false))

    assertEquals("later-background-completion".hashCode(), manager.activeNotifications.single().id)
  }

  @Test
  fun returningToForegroundSuppressesNewAlertsWithoutRemovingPreviousOnes() {
    AgentNotifications.receive(context, update("background-completion", false))
    lifecycle.currentState = Lifecycle.State.RESUMED

    AgentNotifications.receive(context, update("foreground-completion", false))

    assertEquals("background-completion".hashCode(), manager.activeNotifications.single().id)
  }

  @Test
  fun repeatedThreadAlertsHaveOneSilentSummaryAndClearTogether() {
    AgentNotifications.receive(context, update("first", false) + ("alert_group" to "thread-group"))
    AgentNotifications.receive(context, update("second", false) + ("alert_group" to "thread-group"))

    val summary = manager.activeNotifications.single {
      it.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0
    }
    assertEquals("thread-group", summary.notification.group)
    assertEquals(3, manager.activeNotifications.size)
    assertEquals(null, summary.notification.sound)

    AgentNotifications.clear(context)
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun groupedAlertDisplaysEveryThreadAndRetriesStaySilent() {
    val titles = (1..5).map { "Thread $it " + "x".repeat(111) }.joinToString(", ")
    val grouped = update("group-completion", false) + mapOf(
      "alert_title" to "5 agents finished",
      "alert_body" to titles,
      "alert_path" to "/",
    )

    AgentNotifications.receive(context, grouped)
    AgentNotifications.receive(
      context,
      grouped + ("alert_body" to "A retry must not replace this alert")
    )

    val alert = manager.activeNotifications.single()
    assertEquals("5 agents finished", alert.notification.extras.getString(Notification.EXTRA_TITLE))
    assertEquals(titles, alert.notification.extras.getString(Notification.EXTRA_BIG_TEXT))
    assertEquals("t3code-dev://", shadowOf(alert.notification.contentIntent).savedIntent.dataString)
  }

  @Test
  fun foregroundGroupForOtherThreadsAlertsOnceAcrossBackgroundRetry() {
    val grouped = update("group-attention", true) + mapOf(
      "alert_title" to "2 agents need attention",
      "alert_body" to "First thread, Second thread",
      "alert_path" to "/",
    )
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.receive(context, grouped)
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-alert" })
    lifecycle.currentState = Lifecycle.State.CREATED
    AgentNotifications.receive(context, grouped)

    assertEquals(2, manager.activeNotifications.size)
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-alert" })
  }

  @Test
  fun reopeningSameAccountPreservesCardsDeduplicationAndDismissal() {
    val message = update("attention", true)
    AgentNotifications.receive(context, message)
    AgentNotifications.configure(context, "device", "user", "t3code-dev", true)
    assertEquals(2, manager.activeNotifications.size)
    AgentNotifications.dismiss(context)
    AgentNotifications.configure(context, "device", "user", "t3code-dev", true)
    AgentNotifications.receive(context, message)
    assertEquals("t3-agent-alert", manager.activeNotifications.single().tag)
  }

  @Test
  fun changingAccountOrDeviceClearsOldCardsAndRejectsOldPushes() {
    AgentNotifications.receive(context, update("attention", true))
    AgentNotifications.configure(context, "device", "different-user", "t3code-dev", true)
    AgentNotifications.receive(context, update("attention", true))
    assertTrue(manager.activeNotifications.isEmpty())
    AgentNotifications.configure(context, "different-device", "user", "t3code-dev", true)
    AgentNotifications.receive(context, update("attention", true))
    assertTrue(manager.activeNotifications.isEmpty())
    AgentNotifications.clear(context)
    AgentNotifications.receive(context, update("attention", true))
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun expandedActivityShowsFiveRowsAndUsesThePriorityThreadRoute() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val lines =
      listOf(
        "Approval: First · Project",
        "Input: Second · Project",
        "Failed: Third · Project",
        "Working: Fourth · Project",
        "Done: Fifth · Project"
      )
    AgentNotifications.receive(
      context,
      update("attention", true) +
        lines.mapIndexed { index, line -> "activity_line_$index" to line }.toMap()
    )
    val card = manager.activeNotifications.single().notification
    assertEquals(lines.joinToString("\n"), card.extras.getString(Notification.EXTRA_BIG_TEXT))
    assertEquals(
      "t3code-dev://threads/environment/thread",
      shadowOf(card.contentIntent).savedIntent.dataString
    )
  }

  @Test
  fun quietWorkUsesAbsoluteRelayLifetimeInsteadOfTenMinuteRemoval() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val expiresAt = System.currentTimeMillis() + 2 * 60 * 60 * 1000L
    AgentNotifications.receive(
      context,
      update("work", true) + ("activity_expires_at" to expiresAt.toString())
    )
    val card = manager.activeNotifications.single().notification
    assertTimeout(card, 119 * 60 * 1000L..120 * 60 * 1000L)
  }

  @Test
  fun finishedCardIsRetainedSilentlyAndExpiresAtTheOriginalDeadline() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val expiresAt = System.currentTimeMillis() + 15 * 60 * 1000L
    val finished = update("finished", false) + mapOf(
      "activity_title" to "Agent work failed",
      "activity_body" to "Failed: Test thread · Project",
      "activity_expires_at" to expiresAt.toString(),
    )
    AgentNotifications.receive(context, finished)
    val card = manager.activeNotifications.single().notification
    assertEquals("Agent work failed", card.extras.getString(Notification.EXTRA_TITLE))
    assertEquals(Build.VERSION.SDK_INT >= 36, card.flags and Notification.FLAG_ONGOING_EVENT != 0)
    assertTimeout(card, 1..15 * 60 * 1000L)
    AgentNotifications.receive(
      context,
      finished + ("activity_expires_at" to (System.currentTimeMillis() - 1).toString())
    )
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun dismissalIncludesFinishedReplaysAndANewRunRearmsTheCard() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.receive(context, update("work", true))
    AgentNotifications.dismiss(context)
    val finished =
      update("finished", false) +
        ("activity_expires_at" to (System.currentTimeMillis() + 900000).toString())
    AgentNotifications.receive(context, finished)
    AgentNotifications.receive(context, finished)
    assertTrue(manager.activeNotifications.isEmpty())
    AgentNotifications.receive(context, update("new-work", true))
    assertEquals("t3-agent-activity", manager.activeNotifications.single().tag)
    AgentNotifications.configure(context, "device", "user", "t3code-dev", false)
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun severalThreadsListEveryRowWithItsStatusAndActionsFollowThePriorityThread() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val title = "A long thread title that should wrap rather than disappear"
    val data = update("attention", true) + mapOf(
      "activity_line_0" to "Approval	$title	Project",
      "activity_line_1" to "Working	Another thread	Other project",
      "activity_phase" to "waiting_for_approval",
      "activity_active_count" to "8",
      "activity_attention_count" to "1",
    )
    AgentNotifications.receive(context, data)
    val card = manager.activeNotifications.single().notification
    assertEquals("1 needs you", card.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
    assertEquals("8 active", card.extras.getString(Notification.EXTRA_SUB_TEXT))
    assertEquals(
      "Approval $title · Project\nWorking Another thread · Other project",
      card.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
    )
    assertEquals(
      "Approval $title · Project",
      card.extras.getCharSequence(Notification.EXTRA_TEXT).toString()
    )
    assertEquals(listOf("Approve", "Dismiss"), card.actions.map { it.title.toString() })
    assertEquals(
      "t3code-dev://threads/environment/thread",
      shadowOf(card.actions[0].actionIntent).savedIntent.dataString
    )
    assertEquals("Approve", card.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT))

    AgentNotifications.receive(
      context,
      data + mapOf(
        "activity_phase" to "waiting_for_input",
        "activity_attention_count" to "2",
        "activity_path" to "/threads/another-environment/another-thread",
      )
    )
    val next = manager.activeNotifications.single().notification
    assertEquals("2 need you", next.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
    assertEquals("Answer", next.actions[0].title.toString())
    assertEquals(
      "t3code-dev://threads/another-environment/another-thread",
      shadowOf(next.actions[0].actionIntent).savedIntent.dataString
    )
    assertEquals("Answer", next.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT))
  }

  @Test
  fun waitingCardsIgnoreMutableThreadTimestampsEvenAfterRename() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val now = System.currentTimeMillis()
    for (phase in listOf("waiting_for_approval", "waiting_for_input")) {
      val status = if (phase == "waiting_for_approval") "Approval" else "Input"
      for ((title, updatedAt) in listOf("Original" to now - 1200000L, "Renamed" to now)) {
        AgentNotifications.receive(
          context,
          update("waiting", true) + mapOf(
            "activity_line_0" to "$status\t$title\tProject",
            "activity_phase" to phase,
            "activity_since" to updatedAt.toString()
          )
        )
        val card = manager.activeNotifications.single().notification
        assertEquals(title, card.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
        assertFalse(card.extras.getBoolean(Notification.EXTRA_SHOW_WHEN))
        assertFalse(card.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER))
      }
    }
  }

  @Test
  fun aSingleThreadUsesItsTitleAndNeverShowsAProgressBar() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val data = update("work", true) + mapOf(
      "activity_line_0" to "Working	Update dashboard	Project",
      "activity_phase" to "running",
    )
    AgentNotifications.receive(context, data)
    val working = manager.activeNotifications.single().notification
    assertEquals(
      "Update dashboard",
      working.extras.getCharSequence(Notification.EXTRA_TITLE).toString()
    )
    assertEquals(
      "Working Project",
      working.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
    )
    assertEquals(null, working.extras.getString(Notification.EXTRA_SUB_TEXT))
    assertEquals("Working", working.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT))
    assertFalse(working.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER))
    for (phase in listOf(
      "waiting_for_approval",
      "waiting_for_input",
      "stale",
      "failed",
      "completed"
    )) {
      val active = phase != "failed" && phase != "completed"
      AgentNotifications.receive(
        context,
        data + mapOf(
          "activity_phase" to phase,
          "active" to active.toString(),
          "activity_expires_at" to (System.currentTimeMillis() + 900000).toString(),
        )
      )
      val card = manager.activeNotifications.single().notification
      assertEquals(
        "android.app.Notification\$BigTextStyle",
        card.extras.getString(Notification.EXTRA_TEMPLATE)
      )
      assertEquals(
        active || Build.VERSION.SDK_INT >= 36,
        NotificationCompat.isRequestPromotedOngoing(card)
      )
      if (!active) {
        assertEquals(
          if (Build.VERSION.SDK_INT < 36) {
            null
          } else if (phase == "failed") {
            "Failed"
          } else {
            "Done"
          },
          card.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT)
        )
        assertEquals(if (Build.VERSION.SDK_INT >= 36) 1 else 0, card.actions?.size ?: 0)
      }
    }
  }

  @Test
  fun olderRelayRowsStillSelectTheNativeStateAndAction() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.receive(
      context,
      update("input", true) + mapOf(
        "activity_line_0" to "Input	Choose an icon	Project",
      )
    )
    val card = manager.activeNotifications.single().notification
    assertEquals("Choose an icon", card.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
    assertEquals("Answer", card.actions.first().title.toString())
    assertEquals(2, card.actions.size)
    assertFalse(card.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER))
  }

  @Test
  fun multipleAgentsUseTheChipCountAndFinishedThreadsRemainInTheSummary() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    val data = update("multiple", true) + mapOf(
      "activity_line_0" to "Working	Build feature	Project",
      "activity_line_1" to "Done	Write tests	Project",
      "activity_phase" to "running",
      "activity_active_count" to "2",
    )
    AgentNotifications.receive(context, data)
    val card = manager.activeNotifications.single().notification
    assertEquals("2 live", card.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT))
    assertEquals("2 working", card.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
    assertEquals("Project · 2 active", card.extras.getString(Notification.EXTRA_SUB_TEXT))
    assertEquals(
      "Working Build feature\nDone Write tests",
      card.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
    )
    AgentNotifications.receive(context, data + ("activity_active_count" to "15"))
    assertEquals(
      "9+ live",
      manager.activeNotifications.single().notification.extras
        .getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT)
    )
    AgentNotifications.receive(
      context,
      data + mapOf(
        "activity_line_0" to "Failed	Build feature	Project",
        "activity_phase" to "failed",
        "activity_active_count" to "0",
        "active" to "false",
        "activity_expires_at" to (System.currentTimeMillis() + 900000).toString(),
      )
    )
    val finished = manager.activeNotifications.single().notification
    assertEquals(
      "Finished, 1 failed",
      finished.extras.getCharSequence(Notification.EXTRA_TITLE).toString()
    )
    assertEquals("Project · 2 threads", finished.extras.getString(Notification.EXTRA_SUB_TEXT))
  }

  private fun assertTimeout(card: Notification, expected: LongRange) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      assertTrue(card.timeoutAfter in expected)
      assertTrue(
        shadowOf(context.getSystemService(AlarmManager::class.java)).scheduledAlarms.isEmpty()
      )
    } else {
      val alarm = shadowOf(
        context.getSystemService(AlarmManager::class.java)
      ).scheduledAlarms.single()
      assertTrue(alarm.triggerAtTime - System.currentTimeMillis() in expected)
      assertEquals(AlarmManager.RTC_WAKEUP, alarm.type)
    }
  }

  @Test
  @Config(sdk = [24, 25])
  fun legacyExpiryRemovesOnlyTheCardAndCannotRemoveANewerRun() {
    val alarms = shadowOf(context.getSystemService(AlarmManager::class.java))
    val expiresAt = System.currentTimeMillis() + 900000
    AgentNotifications.receive(
      context,
      update("done", false) + ("activity_expires_at" to expiresAt.toString())
    )
    val oldExpiry = alarms.scheduledAlarms.single().operation!!
    AgentNotifications.receive(context, update("next-run", true))
    assertEquals(1, alarms.scheduledAlarms.size)
    val receiver = AgentActivityExpiryReceiver()
    receiver.onReceive(context, shadowOf(oldExpiry).savedIntent)
    AgentNotifications.expire(context, expiresAt + 60_000)
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
    AgentNotifications.expire(context, expiresAt + 2 * 60 * 60 * 1000L)
    assertEquals(2, manager.activeNotifications.count { it.tag == "t3-agent-alert" })
    assertTrue(manager.activeNotifications.none { it.tag == "t3-agent-activity" })
    assertTrue(alarms.scheduledAlarms.isEmpty())
  }

  @Test
  @Config(sdk = [24, 25])
  fun legacyExpiryIsCancelledOnDismissDisableAndSignOut() {
    val alarms = shadowOf(context.getSystemService(AlarmManager::class.java))
    AgentNotifications.receive(context, update("work", true))
    AgentNotifications.dismiss(context)
    assertTrue(alarms.scheduledAlarms.isEmpty())
    AgentNotifications.configure(context, "device", "user", "t3code-dev", false)
    AgentNotifications.configure(context, "device", "user", "t3code-dev", true)
    AgentNotifications.receive(context, update("work", true))
    assertEquals(1, alarms.scheduledAlarms.size)
    AgentNotifications.configure(context, "device", "user", "t3code-dev", false)
    assertTrue(alarms.scheduledAlarms.isEmpty())
    AgentNotifications.configure(context, "device", "user", "t3code-dev", true)
    AgentNotifications.receive(context, update("work", true))
    AgentNotifications.clear(context)
    assertTrue(alarms.scheduledAlarms.isEmpty())
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun alertsAndActivityUseVersionAppropriatePriorityAndPromotion() {
    AgentNotifications.receive(context, update("work", true))
    val alert = manager.activeNotifications.single { it.tag == "t3-agent-alert" }.notification
    val card = manager.activeNotifications.single { it.tag == "t3-agent-activity" }.notification
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      assertEquals(Notification.PRIORITY_HIGH, alert.priority)
      assertTrue(alert.defaults and Notification.DEFAULT_SOUND != 0)
      assertEquals(Notification.PRIORITY_LOW, card.priority)
      assertEquals(0, card.defaults)
    } else {
      assertEquals(
        NotificationManager.IMPORTANCE_HIGH,
        manager.getNotificationChannel(alert.channelId).importance
      )
      assertEquals(
        NotificationManager.IMPORTANCE_LOW,
        manager.getNotificationChannel(card.channelId).importance
      )
    }
    assertTrue(NotificationCompat.isRequestPromotedOngoing(card))
    assertFalse(NotificationCompat.isRequestPromotedOngoing(alert))
    // Robolectric's API 36 image predates the shipped Live Update rules;
    // its hasPromotableCharacteristics() incorrectly requires colorization.
    assertFalse(card.extras.getBoolean(NotificationCompat.EXTRA_COLORIZED))
    assertTrue(card.flags and Notification.FLAG_ONGOING_EVENT != 0)
    assertEquals(Notification.VISIBILITY_PRIVATE, card.visibility)
  }

  @Test
  fun liveUpdateChipChangesWithActivityAndShowsDoneOnCompletion() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.receive(context, update("work", true))
    assertEquals(
      "Active",
      manager.activeNotifications.single().notification.extras
        .getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT)
    )
    AgentNotifications.receive(context, update("input", true) + ("activity_chip" to "Review"))
    val activeCard = manager.activeNotifications.single().notification
    assertEquals(
      "Review",
      activeCard.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT)
    )
    assertTrue(NotificationCompat.isRequestPromotedOngoing(activeCard))

    AgentNotifications.receive(
      context,
      update("done", false) + mapOf(
        "activity_chip" to "Review",
        "activity_expires_at" to (System.currentTimeMillis() + 900000).toString()
      )
    )
    val finishedCard = manager.activeNotifications.single().notification
    val promoted = Build.VERSION.SDK_INT >= 36
    assertEquals(
      if (promoted) "Done" else null,
      finishedCard.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT)
    )
    assertEquals(promoted, NotificationCompat.isRequestPromotedOngoing(finishedCard))
    assertEquals(promoted, finishedCard.flags and Notification.FLAG_ONGOING_EVENT != 0)
  }

  @Test
  fun blankTitleCannotMakeAnActivityIneligibleForPromotion() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.receive(context, update("work", true) + ("activity_title" to "  "))
    assertEquals(
      "Agent activity",
      manager.activeNotifications.single().notification.extras.getString(Notification.EXTRA_TITLE)
    )
  }

  @Test
  fun expiredMalformedAndFutureMessagesCannotDisplayOrPoisonLaterUpdates() {
    val invalid = update("invalid", true)
    AgentNotifications.receive(context, invalid - "updated_at")
    AgentNotifications.receive(context, invalid + ("updated_at" to "invalid"))
    AgentNotifications.receive(
      context,
      invalid + ("updated_at" to (System.currentTimeMillis() - 600001).toString())
    )
    AgentNotifications.receive(
      context,
      invalid + ("updated_at" to (System.currentTimeMillis() + 3600000).toString())
    )
    assertTrue(manager.activeNotifications.isEmpty())
    AgentNotifications.receive(context, update("valid", true))
    assertEquals(2, manager.activeNotifications.size)
  }

  @Test
  fun deniedPermissionDoesNotConsumeAnAlertBeforeTheUserAllowsNotifications() {
    shadowOf(manager).setNotificationsEnabled(false)
    val message = update("attention", true)
    AgentNotifications.receive(context, message)
    assertTrue(manager.activeNotifications.isEmpty())
    shadowOf(manager).setNotificationsEnabled(true)
    AgentNotifications.receive(context, message)
    assertEquals(2, manager.activeNotifications.size)
  }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26, 33, 36], manifest = Config.NONE)
class AgentNotificationChannelsTest {
  @Test
  fun mutedAlertChannelKeepsTheSameActivityThroughCompletionUntilDismissedOrExpired() {
    val context = RuntimeEnvironment.getApplication()
    val manager = context.getSystemService(NotificationManager::class.java)
    shadowOf(manager).setNotificationsEnabled(true)
    AgentNotifications.clear(context)
    AgentNotifications.configure(context, "device", "user", "t3code-dev", true)
    val running = mapOf(
      "device_id" to "device",
      "user_id" to "user",
      "updated_at" to System.currentTimeMillis().toString(),
      "active" to "true",
      "activity_title" to "Agent activity"
    )
    manager.createNotificationChannel(
      NotificationChannel("agent-alerts", "Agent alerts", NotificationManager.IMPORTANCE_NONE)
    )
    AgentNotifications.receive(context, running)
    val initialCard = manager.activeNotifications.single()
    assertEquals("t3-agent-activity", initialCard.tag)

    AgentNotifications.configure(context, "device", "user", "t3code-dev", true)
    AgentNotifications.receive(
      context,
      running + mapOf(
        "activity_phase" to "waiting_for_approval",
        "activity_attention_count" to "1"
      )
    )
    val card = manager.activeNotifications.single().notification
    assertEquals("Approve", card.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT))

    val finished = running + mapOf(
      "active" to "false",
      "activity_phase" to "completed",
      "activity_line_0" to "Done\tTest thread\tTest project",
      "activity_expires_at" to (System.currentTimeMillis() + 900000).toString()
    )
    AgentNotifications.receive(context, finished)
    AgentNotifications.receive(context, finished)
    val completedCard = manager.activeNotifications.single()
    assertEquals(initialCard.id, completedCard.id)
    assertEquals(initialCard.tag, completedCard.tag)
    assertEquals("agent-activity", completedCard.notification.channelId)
    assertEquals(
      "Test thread",
      completedCard.notification.extras.getString(Notification.EXTRA_TITLE)
    )
    assertEquals(
      "Done Test project",
      completedCard.notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString()
    )
    val promoted = Build.VERSION.SDK_INT >= 36
    assertEquals(promoted, NotificationCompat.isRequestPromotedOngoing(completedCard.notification))
    assertEquals(
      promoted,
      completedCard.notification.flags and Notification.FLAG_ONGOING_EVENT != 0
    )
    assertEquals(
      if (promoted) "Done" else null,
      completedCard.notification.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT)
    )

    if (promoted) {
      val dismiss = completedCard.notification.actions.single()
      assertEquals("Dismiss", dismiss.title.toString())
      AgentActivityDismissReceiver().onReceive(context, shadowOf(dismiss.actionIntent).savedIntent)
    } else {
      AgentNotifications.dismiss(context)
    }
    AgentNotifications.receive(context, finished)
    assertTrue(manager.activeNotifications.isEmpty())

    AgentNotifications.receive(context, running)
    assertEquals("t3-agent-activity", manager.activeNotifications.single().tag)
    AgentNotifications.receive(
      context,
      finished + ("activity_expires_at" to (System.currentTimeMillis() - 1).toString())
    )
    assertTrue(manager.activeNotifications.isEmpty())
  }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 26, 33, 36], manifest = Config.NONE)
class AgentNotificationsCompletionTest : AgentNotificationsFixture() {
  private fun finished(alertId: String, expiresAt: Long) = update(alertId, false) + mapOf(
    "activity_line_0" to "Done\tTest thread\tTest project",
    "activity_phase" to "completed",
    "activity_expires_at" to expiresAt.toString(),
  )

  @Test
  fun backgroundCompletionAlertsAndClearsOngoingActivity() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.receive(context, update("running", true))
    lifecycle.currentState = Lifecycle.State.CREATED

    val expiresAt = System.currentTimeMillis() + 900000
    val completion = finished("completion", expiresAt)
    AgentNotifications.receive(context, completion)
    AgentNotifications.receive(context, completion)
    AgentNotifications.receive(context, completion.filterKeys { !it.startsWith("alert_") })

    val alert = manager.activeNotifications.single()
    assertEquals("t3-agent-alert", alert.tag)
    assertEquals("Test thread", alert.notification.extras.getString(Notification.EXTRA_TITLE))
    assertFalse(alert.notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
    AgentNotifications.receive(context, update("next-run", true))
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })

    // An alert for another thread, or a card that also lists another result, stays.
    AgentNotifications.receive(
      context,
      finished("other-thread", expiresAt + 60000) + ("alert_path" to "/threads/other/thread")
    )
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
    AgentNotifications.receive(
      context,
      finished("with-muted-result", expiresAt + 120000) +
        ("activity_line_1" to "Done\tMuted thread\tOther project")
    )
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
  }

  @Test
  @Config(sdk = [26, 33, 36])
  fun blockedAlertChannelKeepsTheFinishedCard() {
    manager.getNotificationChannel("agent-alerts").importance = NotificationManager.IMPORTANCE_NONE
    AgentNotifications.receive(
      context,
      finished("completion", System.currentTimeMillis() + 900000)
    )
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
  }

  @Test
  fun reorderedActivityDoesNotEraseNewerCardOrDropAnIndependentAlert() {
    val now = System.currentTimeMillis()
    AgentNotifications.receive(context, update("new", true) + ("updated_at" to now.toString()))
    AgentNotifications.receive(
      context,
      finished("older-alert", now + 900000) + ("updated_at" to (now - 1000).toString())
    )
    assertEquals(4, manager.activeNotifications.size)
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
    // A newer replay of a finish can show its card before the original alert lands.
    val finish = finished("finish", now + 960000)
    AgentNotifications.receive(
      context,
      finish.filterKeys { !it.startsWith("alert_") } + ("updated_at" to (now + 2000).toString())
    )
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
    AgentNotifications.receive(context, finish + ("updated_at" to (now + 1000).toString()))
    assertTrue(manager.activeNotifications.none { it.tag == "t3-agent-activity" })
    assertTrue(manager.activeNotifications.any { it.id == "finish".hashCode() })
    AgentNotifications.receive(
      context,
      finished("previous-run", now + 900000) + ("updated_at" to now.toString())
    )
    AgentNotifications.receive(
      context,
      finish.filterKeys { !it.startsWith("alert_") } + ("updated_at" to (now + 3000).toString())
    )
    assertTrue(manager.activeNotifications.none { it.tag == "t3-agent-activity" })
    shadowOf(manager).setNotificationsEnabled(false)
    AgentNotifications.receive(context, update("revoked-permission", true))
    assertEquals(5, manager.activeNotifications.size)
  }
}
