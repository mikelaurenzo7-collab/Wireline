package com.wireline.app.widget

import android.content.Context
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
    override suspend fun provideContent(context: Context, id: GlanceId) {
        provideContent {
            WidgetContent()
        }
    }

    @androidx.compose.runtime.Composable
    private fun WidgetContent() {
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
                    fontSize = WirelineDesignTokens.Metric.typographyBodySize.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )
            Spacer(modifier = GlanceModifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "• Coverage: ",
                    style = TextStyle(color = ColorProvider(WidgetPalette.Text2), fontSize = 12.sp),
                )
                Text(
                    text = "100%",
                    style = TextStyle(
                        color = ColorProvider(WidgetPalette.Success),
                        fontSize = WirelineDesignTokens.Metric.typographyCaptionSize.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
            }
            Spacer(modifier = GlanceModifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "• Screened: ",
                    style = TextStyle(color = ColorProvider(WidgetPalette.Text2), fontSize = 12.sp),
                )
                Text(
                    text = "All active calls",
                    style = TextStyle(
                        color = ColorProvider(WidgetPalette.Text),
                        fontSize = WirelineDesignTokens.Metric.typographyCaptionSize.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
            }
        }
    }
}
