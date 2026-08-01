package com.wireline.app.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.wireline.app.data.ActiveCall
import com.wireline.app.data.ApiException
import com.wireline.app.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private sealed class TransferUiState {
    data object Idle : TransferUiState()
    data object Working : TransferUiState()
    data object Done : TransferUiState()
    data class Failed(val message: String) : TransferUiState()
}

@Composable
fun LiveCallScreen(
    callId: String?,
    autoHandoff: Boolean,
    model: WirelineViewModel,
    onDismiss: () -> Unit,
    onOpenSettings: () -> Unit = {},
) {
    val state = model.state
    var call by remember(callId) { mutableStateOf<ActiveCall?>(null) }
    var elapsed by remember(callId) { mutableIntStateOf(0) }
    var transferState by remember(callId) { mutableStateOf<TransferUiState>(TransferUiState.Idle) }
    var didAutoHandoff by remember(callId) { mutableStateOf(false) }
    // performTransfer suspends (it calls the transfer API and can retry on
    // conflict). onClick is not a coroutine context, so the button hands it to
    // the composition scope rather than blocking the click handler.
    val transferScope = rememberCoroutineScope()

    LaunchedEffect(callId, state.activeCalls) {
        call = resolveActiveCall(callId, state.activeCalls)
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            elapsed += 1
        }
    }

    LaunchedEffect(autoHandoff, callId) {
        if (autoHandoff && !didAutoHandoff) {
            didAutoHandoff = true
            LiveCallNavigator.clearAutoHandoff()
            performTransfer(callId, call, model, retryOnConflict = true) { transferState = it }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brand.Canvas),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("ACTIVE CALL", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                    Text("Wireline is handling this", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Brand.Text)
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Brand.Text2)
                }
            }

            Spacer(Modifier.weight(0.35f))

            ActivePulse()

            Spacer(Modifier.height(28.dp))

            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    call?.customerNumber ?: call?.label ?: "Active call",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Brand.Text,
                    textAlign = TextAlign.Center,
                )
                val subtitle = call?.label
                if (!subtitle.isNullOrBlank() && subtitle != call?.customerNumber) {
                    Spacer(Modifier.height(6.dp))
                    Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Brand.Text2, textAlign = TextAlign.Center)
                }
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    LiveMetric("Duration", formatElapsed(elapsed), Icons.Default.Timer, Modifier.weight(1f))
                    LiveMetric("Status", statusLabel(call?.status), Icons.Default.GraphicEq, Modifier.weight(1f))
                }
            }

            Spacer(Modifier.weight(0.45f))

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                when (val ui = transferState) {
                    TransferUiState.Idle -> {
                        Button(
                            onClick = { transferScope.launch { performTransfer(callId, call, model) { transferState = it } } },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(Brand.RadiusMd),
                            colors = ButtonDefaults.buttonColors(containerColor = Brand.Accent),
                        ) {
                            Text("Take this call", fontWeight = FontWeight.SemiBold)
                        }
                    }
                    TransferUiState.Working -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Brand.Accent, RoundedCornerShape(Brand.RadiusMd))
                                .padding(vertical = 16.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.size(10.dp))
                            Text("Connecting you to this call…", color = Color.White, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    TransferUiState.Done -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Brand.Panel, RoundedCornerShape(Brand.RadiusMd))
                                .border(1.dp, Brand.Border, RoundedCornerShape(Brand.RadiusMd))
                                .padding(vertical = 16.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Brand.Success)
                            Spacer(Modifier.size(8.dp))
                            Text("Call transferred", fontWeight = FontWeight.SemiBold, color = Brand.Text)
                        }
                    }
                    is TransferUiState.Failed -> {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                ui.message,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (ui.message.contains("callback", ignoreCase = true)) {
                                Button(onClick = onOpenSettings, modifier = Modifier.fillMaxWidth()) {
                                    Text("Open Settings")
                                }
                            }
                            Button(
                                onClick = { transferScope.launch { performTransfer(callId, call, model) { transferState = it } } },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = Brand.Accent),
                            ) {
                                Text("Take this call", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }

                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(Brand.RadiusMd),
                    colors = ButtonDefaults.buttonColors(containerColor = Brand.Panel2, contentColor = Brand.Text),
                ) {
                    Text("Keep handling it", fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun ActivePulse() {
    val transition = rememberInfiniteTransition(label = "pulse")
    val scale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 2.2f,
        animationSpec = infiniteRepeatable(tween(1800), RepeatMode.Restart),
        label = "scale",
    )
    val alpha by transition.animateFloat(
        initialValue = 0.32f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(tween(1800), RepeatMode.Restart),
        label = "alpha",
    )

    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .scale(scale)
                .border(1.5.dp, Brand.Accent.copy(alpha = alpha), CircleShape),
        )
        Box(
            modifier = Modifier
                .size(88.dp)
                .background(Brand.AccentSoft, CircleShape)
                .border(1.dp, Brand.Border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.GraphicEq, contentDescription = "Active call", tint = Brand.Accent, modifier = Modifier.size(30.dp))
        }
    }
}

@Composable
private fun LiveMetric(label: String, value: String, icon: ImageVector, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .background(Brand.Panel, RoundedCornerShape(Brand.RadiusMd))
            .border(1.dp, Brand.Border, RoundedCornerShape(Brand.RadiusMd))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, contentDescription = null, tint = Brand.Accent, modifier = Modifier.size(16.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = Brand.Text3, fontWeight = FontWeight.SemiBold)
            Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Brand.Text)
        }
    }
}

private fun resolveActiveCall(callId: String?, activeCalls: List<ActiveCall>): ActiveCall? {
    if (callId != null) {
        return activeCalls.firstOrNull { it.callId == callId } ?: activeCalls.firstOrNull()
    }
    return activeCalls.firstOrNull()
}

private fun statusLabel(raw: String?): String {
    val trimmed = raw?.trim().orEmpty()
    if (trimmed.isEmpty()) return "In progress"
    return trimmed.replace("_", " ").replaceFirstChar { it.uppercase() }
}

private fun formatElapsed(seconds: Int): String {
    val minutes = seconds / 60
    val remainder = seconds % 60
    return "%d:%02d".format(minutes, remainder)
}

private suspend fun performTransfer(
    callId: String?,
    call: ActiveCall?,
    model: WirelineViewModel,
    retryOnConflict: Boolean = false,
    onState: (TransferUiState) -> Unit,
) {
    val target = callId ?: call?.callId
    if (target.isNullOrBlank()) {
        onState(TransferUiState.Failed("No active call found. Refresh and try again."))
        return
    }
    onState(TransferUiState.Working)
    model.handoffCall(target)
        .onSuccess {
            onState(TransferUiState.Done)
            delay(1_500)
            LiveCallNavigator.dismiss()
        }
        .onFailure { error ->
            when ((error as? ApiException)?.status) {
                400 -> onState(TransferUiState.Failed("Set a callback number in Settings first."))
                409 -> {
                    if (retryOnConflict) {
                        delay(1_500)
                        performTransfer(callId, call, model, retryOnConflict = false, onState = onState)
                    } else {
                        onState(TransferUiState.Failed("Transfer is not ready yet. Wait a moment and try again."))
                    }
                }
                else -> onState(TransferUiState.Failed("Transfer failed. Try again."))
            }
        }
}
