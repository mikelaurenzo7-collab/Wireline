package com.wireline.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.wireline.app.data.WirelineApi
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory

object WidgetSync {
    private const val PREFS = "wireline_widget"
    private const val SNAPSHOT_KEY = "wireline_widget_snapshot"

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val adapter = moshi.adapter(WirelineWidgetSnapshot::class.java)

    fun load(context: Context): WirelineWidgetSnapshot {
        val raw = context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(SNAPSHOT_KEY, null)
            ?: return WirelineWidgetSnapshot.empty
        return runCatching { adapter.fromJson(raw) }.getOrNull() ?: WirelineWidgetSnapshot.empty
    }

    private fun save(context: Context, snapshot: WirelineWidgetSnapshot) {
        val json = adapter.toJson(snapshot) ?: return
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(SNAPSHOT_KEY, json)
            .apply()
    }

    suspend fun refresh(context: Context, api: WirelineApi) {
        val appContext = context.applicationContext
        if (!api.isSignedIn()) {
            save(appContext, WirelineWidgetSnapshot.empty)
            reloadWidgets(appContext)
            return
        }

        val snapshot = runCatching {
            val recent = api.recentCalls(limit = 10)
            val active = api.activeCalls()
            val wallet = runCatching { api.wallet() }.getOrNull()
            val firstActive = active.calls.firstOrNull()

            WirelineWidgetSnapshot(
                needsAttention = recent.needsAttention,
                activeCallLabel = firstActive?.label ?: firstActive?.customerNumber,
                activeCallCount = active.calls.size,
                balanceUsd = wallet?.balanceUsd,
                signedIn = true,
                updatedAt = System.currentTimeMillis(),
            )
        }.getOrElse { load(appContext) }

        save(appContext, snapshot)
        reloadWidgets(appContext)
    }

    private suspend fun reloadWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val glanceManager = GlanceAppWidgetManager(context)

        manager.getAppWidgetIds(ComponentName(context, AskWirelineWidgetReceiver::class.java)).let { ids ->
            if (ids.isNotEmpty()) AskWirelineWidgetReceiver().onUpdate(context, manager, ids)
        }
        manager.getAppWidgetIds(ComponentName(context, AssistantWidgetProvider::class.java)).let { ids ->
            if (ids.isNotEmpty()) AssistantWidgetProvider().onUpdate(context, manager, ids)
        }

        runCatching {
            glanceManager.getGlanceIds(AskWirelineWidget::class.java).forEach { id ->
                AskWirelineWidget().update(context, id)
            }
            glanceManager.getGlanceIds(AssistantStatusWidget::class.java).forEach { id ->
                AssistantStatusWidget().update(context, id)
            }
        }
    }
}
