package com.wireline.app.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.util.UUID

class AuthTokenStore(context: Context) {
    // security-crypto 1.0.0 is the pinned stable release: the master key is an
    // alias string from MasterKeys, and create() takes (fileName, alias,
    // context, ...). The MasterKey.Builder form this used to call belongs to
    // 1.1.0, which has never left alpha -- not a dependency to take on for the
    // component that guards the session token.
    private val prefs = EncryptedSharedPreferences.create(
        "wireline_auth",
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        context.applicationContext,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

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
