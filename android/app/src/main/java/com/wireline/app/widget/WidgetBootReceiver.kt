package com.wireline.app.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

class WidgetBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val manager = AppWidgetManager.getInstance(context)
        manager.getAppWidgetIds(ComponentName(context, AskWirelineWidgetReceiver::class.java)).let {
            if (it.isNotEmpty()) AskWirelineWidgetReceiver().onUpdate(context, manager, it)
        }
        manager.getAppWidgetIds(ComponentName(context, AssistantWidgetProvider::class.java)).let {
            if (it.isNotEmpty()) AssistantWidgetProvider().onUpdate(context, manager, it)
        }
    }
}