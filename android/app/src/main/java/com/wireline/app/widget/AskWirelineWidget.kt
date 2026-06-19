package com.wireline.app.widget

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.actionStartActivity
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

/** Lavender Noir — mirrors `Brand` / `src/index.css`. */
private object WidgetPalette {
    val Violet = Color(0xFF7C3AED)
    val Panel = Color(0xFF2A2540)
    val Text = Color(0xFFF3EFFA)
    val Text2 = Color(0xFFB8B0CA)
}

class AskWirelineWidget : GlanceAppWidget() {
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
                .background(WidgetPalette.Violet)
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
                    color = ColorProvider(WidgetPalette.Text),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )
        }
    }
}
