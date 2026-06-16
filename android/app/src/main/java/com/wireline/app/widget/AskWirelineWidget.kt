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

class AskWirelineWidget : GlanceAppWidget() {
    override suspend fun provideContent(context: Context, id: GlanceId) {
        provideContent {
            WidgetContent(context)
        }
    }

    @androidx.compose.runtime.Composable
    private fun WidgetContent(context: Context) {
        val intentAction = actionStartActivity<MainActivity>()
        
        // Brand color: Rich Purple #8B3FD6
        val brandPurple = Color(0xFF8B3FD6)
        
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(brandPurple)
                .padding(16.dp)
                .clickable(intentAction),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                provider = ImageProvider(R.drawable.ic_mic),
                contentDescription = "Ask Wireline",
                modifier = GlanceModifier
            )
            Spacer(modifier = GlanceModifier.height(8.dp))
            Text(
                text = "Ask Wireline",
                style = TextStyle(
                    color = ColorProvider(Color.White),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            )
        }
    }
}
