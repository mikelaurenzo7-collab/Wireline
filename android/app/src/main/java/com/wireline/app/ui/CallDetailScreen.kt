package com.wireline.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wireline.app.data.CallDetail
import com.wireline.app.data.RecentCall
import com.wireline.app.ui.components.AssistantCard
import com.wireline.app.ui.components.Medallion
import com.wireline.app.ui.theme.Brand

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallDetailScreen(
    call: RecentCall,
    model: WirelineViewModel,
    onBack: () -> Unit,
) {
    var full by remember(call.id) { mutableStateOf<CallDetail?>(null) }
    var loading by remember(call.id) { mutableStateOf(true) }

    LaunchedEffect(call.id) {
        loading = true
        full = model.loadCallDetail(call.id)
        loading = false
    }

    val context = LocalContext.current

    Scaffold(
        containerColor = Brand.Canvas,
        topBar = {
            TopAppBar(
                title = { Text("Call recap", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Brand.Canvas,
                    titleContentColor = Brand.Text,
                ),
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Brand.Canvas)
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                AssistantCard {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Medallion(
                            if (call.direction == "outbound") Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                            size = 40.dp,
                        )
                        Column {
                            Text(
                                call.customerNumber ?: "Unknown",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = Brand.Text,
                            )
                            Text(
                                "${(call.direction ?: "call").replaceFirstChar { it.uppercase() }}${durationSuffix(call.durationSeconds)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = Brand.Text2,
                            )
                        }
                    }
                }
            }

            if (!call.summary.isNullOrBlank()) {
                item {
                    AssistantCard {
                        Text("SUMMARY", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                        Spacer(Modifier.height(6.dp))
                        Text(call.summary, style = MaterialTheme.typography.bodyMedium, color = Brand.Text)
                    }
                }
            }

            item {
                AssistantCard {
                    Text("DETAILS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                    Spacer(Modifier.height(8.dp))
                    call.outcomeTag?.let {
                        DetailRow("Outcome") { OutcomeTag(it) }
                        Spacer(Modifier.height(8.dp))
                    }
                    call.sentiment?.let {
                        DetailRow("Sentiment") {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                androidx.compose.foundation.layout.Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .background(sentimentColor(it), CircleShape),
                                )
                                Text(it.replaceFirstChar { c -> c.uppercase() }, color = Brand.Text)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    call.intentLabel?.takeIf { it != "none" }?.let {
                        DetailRow("Intent") {
                            Text(it.replace("_", " ").replaceFirstChar { c -> c.uppercase() }, color = Brand.Text)
                        }
                    }
                }
            }

            full?.recordingUrl?.takeIf { it.isNotBlank() }?.let { url ->
                item {
                    AssistantCard {
                        TextButton(
                            onClick = {
                                runCatching {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                }
                            },
                        ) {
                            Icon(Icons.Default.PlayCircle, contentDescription = null, tint = Brand.Accent)
                            Spacer(Modifier.size(8.dp))
                            Text("Play recording", color = Brand.Accent)
                        }
                    }
                }
            }

            full?.transcript?.takeIf { it.isNotBlank() }?.let { transcript ->
                item {
                    AssistantCard {
                        Text("TRANSCRIPT", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                        Spacer(Modifier.height(6.dp))
                        Text(transcript, style = MaterialTheme.typography.bodyMedium, color = Brand.Text)
                    }
                }
            }

            if (loading) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator(color = Brand.Accent, strokeWidth = 2.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Brand.Text2)
        value()
    }
}

@Composable
private fun OutcomeTag(tag: String) {
    val color = when (tag.lowercase()) {
        "booked", "converted", "completed" -> Brand.Success
        "objection", "no_answer", "voicemail" -> Color(0xFFFF9800)
        "transferred" -> Brand.Accent
        else -> Brand.Text2
    }
    AssistChip(
        onClick = {},
        label = {
            Text(
                tag.replace("_", " ").replaceFirstChar { it.uppercase() },
                color = color,
                fontWeight = FontWeight.SemiBold,
            )
        },
    )
}

private fun durationSuffix(seconds: Int?): String {
    if (seconds == null || seconds <= 0) return ""
    return " · ${seconds / 60}m ${seconds % 60}s"
}

private fun sentimentColor(sentiment: String): Color = when (sentiment.lowercase()) {
    "positive" -> Brand.Success
    "negative" -> Color(0xFFEF7B92)
    else -> Brand.Text3
}
