package com.wireline.app.data

import com.squareup.moshi.Json

data class MobileMe(
    val user: MobileUser,
    val account: MobileAccount,
    val agents: AgentQuota,
    @Json(name = "extra_agent") val extraAgent: ExtraAgent?,
    val settings: MobileSettings?,
)

data class MobileUser(
    val id: String,
    val email: String,
    @Json(name = "full_name") val fullName: String?,
)

data class MobileAccount(
    val mode: String,
    @Json(name = "plan_id") val planId: String,
    @Json(name = "plan_name") val planName: String,
    @Json(name = "business_name") val businessName: String?,
    @Json(name = "subscription_status") val subscriptionStatus: String,
)

data class AgentQuota(
    val count: Int,
    val included: Int?,
    val extras: Int,
    @Json(name = "effective_cap") val effectiveCap: Int?,
    val unlimited: Boolean,
    @Json(name = "can_add_more") val canAddMore: Boolean,
)

data class ExtraAgent(
    @Json(name = "price_usd") val priceUsd: Double?,
    val configured: Boolean,
)

data class MobileSettings(
    @Json(name = "handoff_phone") val handoffPhone: String?,
)

data class AgentList(val agents: List<Agent>)

data class Agent(
    val id: String,
    val name: String,
    val role: String?,
    val archetype: String?,
    val channels: List<String>?,
    val voiceId: String?,
    val isBusinessAgent: Boolean? = null,
)

data class ActiveCallList(val calls: List<ActiveCall>)

data class ActiveCall(
    val callId: String,
    val agentId: String?,
    val customerNumber: String?,
    val status: String?,
    val label: String?,
    val type: String?,
)

data class RecentCallsResponse(
    val calls: List<RecentCall>,
    val needsAttention: Int,
)

data class RecentCall(
    val id: String,
    val agentId: String?,
    val direction: String?,
    val customerNumber: String?,
    val durationSeconds: Int?,
    val summary: String?,
    val sentiment: String?,
    val outcomeTag: String?,
    val intentLabel: String?,
    val createdAt: String?,
)

data class WalletResponse(
    @Json(name = "balance_usd") val balanceUsd: Double,
    val ledger: List<WalletEntry>,
)

data class WalletEntry(
    val id: String,
    val deltaUsd: Double,
    val balanceAfterUsd: Double,
    val reason: String,
    val createdAt: String?,
)

data class OutboundCallResponse(
    val success: Boolean,
    val callId: String?,
)

