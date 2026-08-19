package com.wireline.app.device

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import android.provider.MediaStore
import android.app.SearchManager
import com.wireline.app.push.WirelineNotifications
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

object DeviceActionHandler {
    fun handle(context: Context, action: String, argsJson: String) {
        val args = runCatching { JSONObject(argsJson) }.getOrElse { JSONObject() }
        when (action) {
            "navigate" -> openMaps(context, args.optString("destination"))
            "reminder" -> addReminder(context, args.optString("title"), args.optString("datetime"))
            "play_music" -> playMusic(context, args.optString("query"))
            else -> WirelineNotifications.showDeviceAction(context, "BotBound", "Open BotBound for the latest update.")
        }
    }

    private fun openMaps(context: Context, destination: String) {
        if (destination.isBlank()) return
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(destination)}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startOrNotify(context, intent, "Directions", destination)
    }

    private fun addReminder(context: Context, title: String, datetime: String) {
        if (title.isBlank()) return
        val beginAt = parseMillis(datetime)
        val intent = Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, title)
            .putExtra(CalendarContract.Events.DESCRIPTION, "Created from a BotBound call.")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (beginAt != null) intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginAt)
        startOrNotify(context, intent, "Reminder", title)
    }

    private fun playMusic(context: Context, query: String) {
        if (query.isBlank()) return
        val intent = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
            .putExtra(SearchManager.QUERY, query)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startOrNotify(context, intent, "Music", query)
    }

    private fun startOrNotify(context: Context, intent: Intent, title: String, body: String) {
        runCatching { context.startActivity(intent) }
            .onFailure { WirelineNotifications.showDeviceAction(context, title, body) }
    }

    private fun parseMillis(value: String): Long? {
        if (value.isBlank()) return null
        return runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
            ?: runCatching {
                LocalDateTime.parse(value)
                    .atZone(ZoneId.systemDefault())
                    .toInstant()
                    .toEpochMilli()
            }.getOrNull()
    }
}
