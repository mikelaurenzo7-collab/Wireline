package com.wireline.app.networking

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

import java.util.concurrent.TimeUnit

/**
 * Real networking layer for Android Wireline app
 * Uses OkHttp + coroutines
 */
object WirelineAPI {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val baseUrl = WirelineConfig.mobileAPIBase

    suspend fun getMe(): Map<String, Any> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/me")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("Failed to fetch user")
            // For now return mock until backend is fully wired
            mapOf(
                "accountMode" to "personal",
                "userId" to "demo"
            )
        }
    }

    suspend fun getAgents(accountMode: String): List<Map<String, Any>> = withContext(Dispatchers.IO) {
        // TODO: Replace with real call when backend ready
        listOf(
            mapOf("id" to "a1", "name" to "Agent Alpha", "status" to "idle"),
            mapOf("id" to "a2", "name" to "Agent Beta", "status" to "on_call"),
            mapOf("id" to "a3", "name" to "Agent Gamma", "status" to "training")
        )
    }

    suspend fun getActiveCalls(): List<Map<String, Any>> = withContext(Dispatchers.IO) {
        emptyList()
    }
}