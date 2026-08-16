package com.wireline.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.wireline.app.MainActivity
import com.wireline.app.ui.theme.WirelineDesignTokens

class AssistantWidgetProvider : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AssistantStatusWidget()
}

class AssistantStatusWidget : GlanceAppWidget() {
    // See AskWirelineWidget: `provideGlance` is the member to override, and
    // `provideContent` is what you call inside it.
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSync.load(context)
        provideContent {
            WidgetContent(snapshot)
        }
    }

    @androidx.compose.runtime.Composable
    private fun WidgetContent(snapshot: WirelineWidgetSnapshot) {
        val intentAction = actionStartActivity<MainActivity>()

        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(WidgetPalette.Panel)
                .padding(16.dp)
                .clickable(intentAction),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.Start,
        ) {
            Text(
                text = "Wireline Agents",
                style = TextStyle(
                    color = ColorProvider(WidgetPalette.Accent),
                    fontSize = WirelineDesignTokens.Metric.typographyBodySize,
                    fontWeight = FontWeight.Bold,
                ),
            )
            Spacer(modifier = GlanceModifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "• Follow-ups: ",
                    style = TextStyle(color = ColorProvider(WidgetPalette.Text2), fontSize = 12.sp),
                )
                Text(
                    text = if (!snapshot.signedIn) "Sign in" else if (snapshot.needsAttention == 0) "All clear" else "${snapshot.needsAttention}",
                    style = TextStyle(
                        color = ColorProvider(if (snapshot.needsAttention > 0) WidgetPalette.Accent else WidgetPalette.Success),
                        fontSize = WirelineDesignTokens.Metric.typographyCaptionSize,
                        fontWeight = FontWeight.Bold,
                    ),
                )
            }
            Spacer(modifier = GlanceModifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "• Active: ",
                    style = TextStyle(color = ColorProvider(WidgetPalette.Text2), fontSize = 12.sp),
                )
                Text(
                    text = when {
                        !snapshot.signedIn -> "Signed out"
                        snapshot.activeCallCount > 0 -> snapshot.activeCallLabel ?: "${snapshot.activeCallCount} call(s)"
                        else -> "No active calls"
                    },
                    style = TextStyle(
                        color = ColorProvider(WidgetPalette.Text),
                        fontSize = WirelineDesignTokens.Metric.typographyCaptionSize,
                        fontWeight = FontWeight.Bold,
                    ),
                )
            }
        }
    }
}
