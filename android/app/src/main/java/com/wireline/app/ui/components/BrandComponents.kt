package com.wireline.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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

/** Copper-to-patina cap — shared Letterpress signature on native cards. */
@Composable
private fun WirelineLetterpressCap(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(2.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(
                Brush.horizontalGradient(
                    colors = listOf(
                        Brand.Wire,
                        Brand.Accent.copy(alpha = 0.35f),
                        Color.Transparent,
                    ),
                ),
            ),
    )
}

/**
 * AssistantCard displays information inside a flat card matching the Wireline Precision design system:
 * warm paper surface, copper cap, 1dp border, 16dp internal spacing.
 */
@Composable
fun AssistantCard(
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
        Column(modifier = Modifier.padding(bottom = 16.dp)) {
            WirelineLetterpressCap(modifier = Modifier.padding(top = 1.dp))
            Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content,
            )
        }
    }
}

/** 200ms 0.98 press response required by the Wireline Precision system. */
@Composable
private fun Modifier.tactileScale(interactionSource: MutableInteractionSource): Modifier {
    val pressed = interactionSource.collectIsPressedAsState().value
    val scale = animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = tween(durationMillis = 200),
        label = "wireline-tactile-scale",
    ).value
    return graphicsLayer { scaleX = scale; scaleY = scale }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskWirelineHeroCard(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interactionSource = remember { MutableInteractionSource() }
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().tactileScale(interactionSource),
        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
        shape = RoundedCornerShape(Brand.RadiusMd),
        border = BorderStroke(1.dp, Brand.Border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        interactionSource = interactionSource,
    ) {
        Column {
            WirelineLetterpressCap(modifier = Modifier.padding(top = 1.dp))
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
}

@Composable
fun MetricStatCard(
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallbackNumberPromptCard(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interactionSource = remember { MutableInteractionSource() }
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().tactileScale(interactionSource),
        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
        shape = RoundedCornerShape(Brand.RadiusMd),
        border = BorderStroke(1.dp, Brand.Border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        interactionSource = interactionSource,
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
                Icon(
                    imageVector = Icons.Default.PhoneInTalk,
                    contentDescription = null,
                    tint = Brand.Accent
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Set callback number",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.Text,
                )
                Text(
                    text = "Required for live call transfers to your device.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.Text2,
                )
            }
        }
    }
}
