package com.wireline.app.data

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.wireline.app.BuildConfig
import com.wireline.app.auth.AuthTokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class WirelineApi(context: Context) {
    private val appContext = context.applicationContext
    private val tokenStore = AuthTokenStore(appContext)
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonMediaType = "application/json".toMediaType()
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val baseUrl = BuildConfig.WIRELINE_BASE_URL.trimEnd('/')

    fun isSignedIn(): Boolean = !tokenStore.token().isNullOrBlank()

    suspend fun signIn(email: String, password: String) {
        val body = JSONObject().put("email", email).put("password", password).toString().toRequestBody(jsonMediaType)
        val request = Request.Builder().url(endpoint("/api/auth/signin")).post(body).header("content-type", "application/json").build()
        withContext(Dispatchers.IO) {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw ApiException(response.code, "Sign-in failed.")
                val token = response.headers("set-cookie").firstNotNullOfOrNull { parseSessionCookie(it) }
                    ?: throw ApiException(response.code, "Sign-in succeeded without a session.")
                tokenStore.saveToken(token)
            }
        }
    }

    suspend fun signOut() {
        val deviceId = tokenStore.deviceId()
        runCatching { delete("/api/mobile/devices/$deviceId") }
        tokenStore.clear()
    }

    suspend fun me(): MobileMe = get("/api/mobile/me")
    suspend fun agents(): AgentList = get("/api/mobile/agents")
    suspend fun agentSetup(agentId: String): MobileAgentSetup = get("/api/mobile/agents/${escape(agentId)}/config")
    suspend fun activeCalls(): ActiveCallList = get("/api/mobile/calls/active")
    suspend fun recentCalls(limit: Int = 20): RecentCallsResponse = get("/api/mobile/calls/recent?limit=$limit")
    suspend fun wallet(): WalletResponse = get("/api/mobile/wallet")

    /** Creates an owned agent through the same production contract as the web console. */
    suspend fun createAssistant(
        name: String,
        role: String = "scheduler",
        isBusinessAgent: Boolean = false,
    ): Agent {
        return post(
            "/api/mobile/agents",
            JSONObject()
                .put("name", name)
                .put("role", role)
                .put("deferPhoneProvision", true)
                .put("is_business_agent", isBusinessAgent),
        )
    }

    suspend fun registerDevice(fcmToken: String?) {
        val body = JSONObject().put("device_id", tokenStore.deviceId()).put("platform", "android").put("app_version", BuildConfig.VERSION_NAME)
        if (!fcmToken.isNullOrBlank()) body.put("fcm_token", fcmToken)
        postRaw("/api/mobile/devices", body)
    }

    suspend fun setHandoffPhone(phone: String?) {
        putRaw("/api/mobile/settings", JSONObject().put("handoffPhone", phone ?: JSONObject.NULL))
    }

    suspend fun saveSetupEntry(agentId: String, type: String, content: String) {
        postRaw("/api/mobile/agents/${escape(agentId)}/config/manual", JSONObject().put("type", type).put("content", content))
    }

    suspend fun setEnabledTools(agentId: String, enabledTools: List<String>) {
        postRaw(
            "/api/mobile/agents/${escape(agentId)}/tools",
            JSONObject().put("enabled_tools", JSONArray(enabledTools))
        )
    }

    suspend fun handoffCall(callId: String, to: String? = null) {
        val body = JSONObject()
        if (!to.isNullOrBlank()) body.put("to", to)
        postRaw("/api/mobile/calls/$callId/handoff", body)
    }

    suspend fun placeCall(agentId: String, customerNumber: String, context: String?): String? {
        val body = JSONObject().put("agentId", agentId).put("customerNumber", customerNumber)
        if (!context.isNullOrBlank()) body.put("context", context)
        val response: OutboundCallResponse = post("/api/mobile/calls/outbound", body)
        return response.callId
    }

    private suspend inline fun <reified T> get(path: String): T = decode(send(authenticatedBuilder(path).get().build()))
    private suspend inline fun <reified T> post(path: String, json: JSONObject): T = decode(postRaw(path, json))
    private suspend fun postRaw(path: String, json: JSONObject): String = send(authenticatedBuilder(path).post(json.toString().toRequestBody(jsonMediaType)).build())
    private suspend fun putRaw(path: String, json: JSONObject): String = send(authenticatedBuilder(path).put(json.toString().toRequestBody(jsonMediaType)).build())
    private suspend fun delete(path: String): String = send(authenticatedBuilder(path).delete().build())

    private fun authenticatedBuilder(path: String): Request.Builder {
        val token = tokenStore.token() ?: throw ApiException(401, "Not signed in.")
        return Request.Builder().url(endpoint(path)).header("authorization", "Bearer $token").header("content-type", "application/json")
    }

    private suspend fun send(request: Request): String = withContext(Dispatchers.IO) {
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw ApiException(response.code, body.ifBlank { "Request failed." })
            body
        }
    }

    private inline fun <reified T> decode(body: String): T {
        val adapter = moshi.adapter(T::class.java)
        return adapter.fromJson(body) ?: throw ApiException(500, "Empty response.")
    }

    private fun endpoint(path: String): String = "$baseUrl/${path.trimStart('/')}"
    private fun escape(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun parseSessionCookie(header: String): String? {
        val first = header.substringBefore(';')
        if (first.substringBefore('=', missingDelimiterValue = "") != "wireline_session") return null
        return first.substringAfter('=', missingDelimiterValue = "").ifBlank { null }
    }
}

class ApiException(val status: Int, override val message: String) : Exception(message)
