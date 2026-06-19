package com.wireline.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.wireline.app.ui.theme.Brand

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Medallion(
    icon: ImageVector,
    size: Dp = 44.dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Brand.VioletSoft, Brand.Violet, Brand.VioletDeep))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(size * 0.42f))
    }
}

@Composable
fun StitchMeshSurface(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(Brand.Canvas)
            .background(
                Brush.radialGradient(
                    colors = listOf(Brand.Violet.copy(alpha = 0.28f), Color.Transparent),
                    radius = 820f,
                )
            )
            .background(
                Brush.linearGradient(
                    listOf(Color.White.copy(alpha = 0.035f), Color.Transparent, Color.Black.copy(alpha = 0.32f))
                )
            )
    )
}

@Composable
fun LavenderCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
        shape = RoundedCornerShape(Brand.RadiusLg),
        border = BorderStroke(1.dp, Brand.Border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier
                .background(Brush.verticalGradient(listOf(Brand.Panel2.copy(alpha = 0.78f), Brand.Panel)))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

@Composable
fun AskWirelineHeroCard(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(Brand.RadiusLg),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.14f)),
    ) {
        Box(
            modifier = Modifier
                .background(Brush.linearGradient(listOf(Brand.Violet, Brand.VioletDeep)))
                .background(
                    Brush.radialGradient(
                        listOf(Brand.VioletSoft.copy(alpha = 0.28f), Color.Transparent),
                        radius = 620f,
                    )
                )
        ) {
            Row(
                modifier = Modifier.padding(20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Mic, contentDescription = null, tint = Color.White)
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "Ask Wireline",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                    Text(
                        "Have your AI call, wait, summarize, and follow up.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.76f),
                    )
                }
            }
        }
    }
}

@Composable
fun FleetStatCard(
    value: String,
    label: String,
    highlighted: Boolean,
    modifier: Modifier = Modifier,
) {
    val bg = if (highlighted) Brand.Violet else Brand.Panel2
    val valueColor = if (highlighted) Color.White else Brand.Text
    val labelColor = if (highlighted) Color.White.copy(alpha = 0.75f) else Brand.Text3

    Column(
        modifier = modifier
            .height(96.dp)
            .clip(RoundedCornerShape(Brand.RadiusMd))
            .background(bg)
            .background(if (highlighted) Brush.linearGradient(listOf(Brand.Violet, Brand.VioletDeep)) else Brush.verticalGradient(listOf(Brand.Panel2, Brand.Panel)))
            .padding(12.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = valueColor)
        Text(label, style = MaterialTheme.typography.labelSmall, color = labelColor)
    }
}
