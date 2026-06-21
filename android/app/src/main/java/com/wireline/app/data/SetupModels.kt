package com.wireline.app.data

data class MobileAgentSetup(
    val enabledTools: List<String> = emptyList(),
    val personality: String = "",
    val directives: List<MobileSetupEntry> = emptyList(),
    val knowledge: List<MobileSetupEntry> = emptyList(),
)

data class MobileSetupEntry(val content: String)
