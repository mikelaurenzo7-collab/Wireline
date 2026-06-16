buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.23")
        classpath("com.google.gms:google-services:4.4.1")
    }
}

plugins {
    id("org.jetbrains.kotlin.plugin.compose") version "1.9.23" apply false
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}