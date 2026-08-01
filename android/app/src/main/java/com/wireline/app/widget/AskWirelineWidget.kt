package com.wireline.app.widget

import android.content.Context
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.actionStartActivity
import com.wireline.app.ui.theme.WirelineDesignTokens
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.wireline.app.MainActivity
import com.wireline.app.R

class AskWirelineWidget : GlanceAppWidget() {
    // `provideGlance` is the abstract member Glance asks widgets to implement;
    // `provideContent` is the suspend function you call from inside it to hand
    // back the composition. Overriding `provideContent` instead left the class
    // abstract and overriding nothing.
    override suspend fun provideGlance(context: Context, id: GlanceId) {
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
                .background(WidgetPalette.Canvas)
                .padding(16.dp)
                .clickable(intentAction),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                provider = ImageProvider(R.drawable.ic_mic),
                contentDescription = "Ask Wireline",
            )
            Spacer(modifier = GlanceModifier.height(8.dp))
            Text(
                text = "Ask Wireline",
                style = TextStyle(
                    color = ColorProvider(WidgetPalette.Accent),
                    fontSize = WirelineDesignTokens.Metric.typographyBodySize,
                    fontWeight = FontWeight.Bold,
                ),
            )
        }
    }
}
