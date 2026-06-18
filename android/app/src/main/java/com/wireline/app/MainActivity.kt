package com.wireline.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.wireline.app.ui.WirelineAndroidApp
import com.wireline.app.ui.WirelineTheme

class MainActivity : ComponentActivity() {
    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    // Reactive holder for the latest wireline:// deep-link host, so widget /
    // App Action / shortcut taps route to the right surface — including when the
    // app is already running (onNewIntent).
    private var deepLinkHost by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        deepLinkHost = intent?.data?.host
        setContent {
            WirelineTheme {
                WirelineAndroidApp(deepLinkHost = deepLinkHost)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLinkHost = intent.data?.host
    }
}
