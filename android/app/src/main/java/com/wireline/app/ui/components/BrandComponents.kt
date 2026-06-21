package com.wireline.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.wireline.app.ui.theme.Brand

/** Compact native components derived from the mobile Stitch delivery. */

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
            .background(Brand.AccentSoft),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Brand.Accent,
            modifier = Modifier.size(size * 0.42f),
        )
    }
}

/** Kept for existing screen composition; intentionally contains no mesh/gradient. */
@Composable
fun StitchMeshSurface(modifier: Modifier = Modifier) {
    Box(modifier = modifier.background(Brand.Canvas))
}

/**
 * Compatibility name for existing screens. The implementation is now a quiet
 * white, bordered Stitch card—not lavender and not decorative.
 */
@Composable
fun LavenderCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
        shape = RoundedCornerShape(Brand.RadiusMd),
        border = BorderStroke(1.dp, Brand.Border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskWirelineHeroCard(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
        shape = RoundedCornerShape(Brand.RadiusMd),
        border = BorderStroke(1.dp, Brand.Border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(Brand.AccentSoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Mic, contentDescription = null, tint = Brand.Accent)
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Ask Wireline",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.Text,
                )
                Text(
                    text = "Hand off a call, the wait, and the follow-up.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.Text2,
                )
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
    val background = if (highlighted) Brand.Accent else Brand.Panel2
    val valueColor = if (highlighted) Color.White else Brand.Text
    val labelColor = if (highlighted) Color.White.copy(alpha = 0.78f) else Brand.Text3

    Column(
        modifier = modifier
            .height(88.dp)
            .clip(RoundedCornerShape(Brand.RadiusSm))
            .background(background)
            .padding(12.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = valueColor)
        Text(label, style = MaterialTheme.typography.labelSmall, color = labelColor)
    }
}
