package com.wireline.app.widget

import android.content.Context
import androidx.compose.ui.graphics.Color
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

class AgentWidgetProvider : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AgentStatusWidget()
}

class AgentStatusWidget : GlanceAppWidget() {
    override suspend fun provideContent(context: Context, id: GlanceId) {
        provideContent {
            WidgetContent(context)
        }
    }

    @androidx.compose.runtime.Composable
    private fun WidgetContent(context: Context) {
        val intentAction = actionStartActivity<MainActivity>()
        
        // Brand color: Rich Cream (#F5F1E8) background, Rich Purple (#8B3FD6) text
        val brandCream = Color(0xFFF5F1E8)
        val brandPurple = Color(0xFF8B3FD6)
        
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(brandCream)
                .padding(16.dp)
                .clickable(intentAction),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.Start
        ) {
            Text(
                text = "Wireline Fleet",
                style = TextStyle(
                    color = ColorProvider(brandPurple),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
            )
            Spacer(modifier = GlanceModifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "• Live calls: ",
                    style = TextStyle(
                        color = ColorProvider(Color.Black),
                        fontSize = 12.sp
                    )
                )
                Text(
                    text = "Active",
                    style = TextStyle(
                        color = ColorProvider(brandPurple),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                )
            }
            Spacer(modifier = GlanceModifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "• Roster: ",
                    style = TextStyle(
                        color = ColorProvider(Color.Black),
                        fontSize = 12.sp
                    )
                )
                Text(
                    text = "Connected",
                    style = TextStyle(
                        color = ColorProvider(Color.DarkGray),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                )
            }
        }
    }
}
