package com.wireline.app.auth

import android.content.Context
import java.util.UUID

class AuthTokenStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("wireline_auth", Context.MODE_PRIVATE)

    fun token(): String? = prefs.getString(KEY_TOKEN, null)

    fun saveToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    fun deviceId(): String {
        val existing = prefs.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing
        val created = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, created).apply()
        return created
    }

    companion object {
        private const val KEY_TOKEN = "token"
        private const val KEY_DEVICE_ID = "device_id"
    }
}
